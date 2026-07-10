/**
 * Grok Imagine 客户端（https://grok.com/imagine/）
 *
 * 能力：
 * 1. 普通提示词生图（mode=image）
 * 2. 多参考图上传 + 提示词（input[name=files] multiple）
 * 3. 生视频（mode=video，可选 480p/720p、6s/10s）
 * 4. 代理模式（mode=agent）
 *
 * 与 GeminiClient / ChatgptClient 同形：attach → open → generate* → SessionLog
 *
 * @module providers/grok/client/grok-imagine-client
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getPage,
  applyStealth,
  AiWebError,
  SessionLog,
  sleep,
  RUNTIME_ROOT,
} from '../../../shared/index.mjs';
import {
  GROK_URL,
  GROK_ORIGIN,
  GROK_IMAGINE_URL,
  IMAGINE_EDITOR_SEL,
  IMAGINE_FILE_INPUT_SEL,
  IMAGINE_SUBMIT_SEL,
  IMAGINE_DOWNLOAD_SEL,
  IMAGINE_RATIO_BTN_SEL,
  IMAGINE_MODE_LABELS,
  IMAGINE_QUALITY_LABELS,
  IMAGINE_VIDEO_RES,
  IMAGINE_VIDEO_DURATION,
  IMAGINE_RATIOS,
  GROK_ASSET_RE,
} from '../selectors/ui.mjs';

export {
  GROK_URL,
  GROK_ORIGIN,
  GROK_IMAGINE_URL,
  IMAGINE_MODE_LABELS,
  IMAGINE_RATIOS,
};

export const IMAGINE_MODES = Object.freeze({
  image: { id: 'image', label: IMAGINE_MODE_LABELS.image, defaultTimeoutMs: 180_000 },
  video: { id: 'video', label: IMAGINE_MODE_LABELS.video, defaultTimeoutMs: 600_000 },
  agent: { id: 'agent', label: IMAGINE_MODE_LABELS.agent, defaultTimeoutMs: 600_000 },
});

export class GrokImagineClient {
  static id = 'grok-imagine';
  static displayName = 'Grok Imagine';
  static url = GROK_IMAGINE_URL;
  static origin = GROK_ORIGIN;
  static urlIncludes = 'grok.com';

  /**
   * @param {import('puppeteer-core').Page} page
   * @param {{ runtimeDir?: string, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   */
  constructor(page, opts = {}) {
    /** @type {import('puppeteer-core').Page} */
    this.page = page;
    this.runtimeDir = opts.runtimeDir || RUNTIME_ROOT;
    this.mediaDir = path.join(this.runtimeDir, 'media', 'grok-imagine');
    /** @type {SessionLog | null} */
    this.sessionLog = null;
    if (opts.sessionLog instanceof SessionLog) {
      this.sessionLog = opts.sessionLog;
    } else if (opts.sessionLog !== false) {
      this.sessionLog = new SessionLog({
        provider: 'grok-imagine',
        rootDir: path.join(this.runtimeDir, 'sessions'),
        sessionId: opts.sessionId,
        label: 'grok-imagine',
      });
    }
  }

  async ensureSession() {
    if (!this.sessionLog) return null;
    await this.sessionLog.init();
    return this.sessionLog.paths;
  }

  /**
   * @param {import('puppeteer-core').Browser} browser
   * @param {{ forceNewTab?: boolean, reuseTab?: boolean, runtimeDir?: string, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   */
  static async attach(browser, opts = {}) {
    const reuseTab = opts.reuseTab !== false && !opts.forceNewTab;
    let page;
    if (reuseTab) {
      page =
        (await getPage(browser, {
          reuse: true,
          urlIncludes: 'grok.com/imagine',
        })) ||
        (await getPage(browser, { reuse: true, urlIncludes: 'grok.com' })) ||
        (await browser.newPage());
    } else {
      page = await browser.newPage();
    }
    await applyStealth(page);
    try {
      const ctx = browser.defaultBrowserContext();
      await ctx.overridePermissions(GROK_ORIGIN, [
        'clipboard-read',
        'clipboard-write',
      ]);
    } catch {
      // ignore
    }
    return new GrokImagineClient(page, opts);
  }

  /**
   * 打开 Imagine 页
   * @param {{ waitReady?: boolean, timeout?: number }} [opts]
   */
  async open(opts = {}) {
    const waitReady = opts.waitReady !== false;
    const timeout = opts.timeout ?? 120_000;
    // 推荐带尾斜杠
    await this.page.goto(GROK_IMAGINE_URL, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    await sleep(3000);
    if (waitReady) await this.waitReady({ timeout });
    return { ok: true, url: this.page.url() };
  }

  async waitReady(opts = {}) {
    const timeout = opts.timeout ?? 90_000;
    await this.page.waitForSelector(IMAGINE_EDITOR_SEL, {
      visible: true,
      timeout,
    });
    await sleep(500);
    return true;
  }

  async healthCheck() {
    try {
      await this.open({ waitReady: true, timeout: 30_000 });
      return true;
    } catch {
      return false;
    }
  }

  async captureError(tag = 'error') {
    try {
      await fs.mkdir(this.mediaDir, { recursive: true });
      const file = path.join(this.mediaDir, `${tag}-${Date.now()}.png`);
      await this.page.screenshot({ path: file, fullPage: false });
      return file;
    } catch {
      return null;
    }
  }

  async fail(code, message, cause) {
    const shot = await this.captureError(code.toLowerCase());
    throw new AiWebError(message, {
      code,
      cause,
      screenshot: shot,
      provider: 'grok-imagine',
    });
  }

  // ─── UI 控件 ────────────────────────────────────────────

  /**
   * 点击 button[role="radio"] 中文案完全匹配
   * @param {string} label
   */
  async clickRadioByLabel(label) {
    const ok = await this.page.evaluate((target) => {
      const btn = [...document.querySelectorAll('button[role="radio"]')].find(
        (b) => (b.textContent || '').trim() === target,
      );
      if (!btn) return false;
      btn.click();
      return true;
    }, label);
    if (!ok) {
      await this.fail('RADIO_NOT_FOUND', `未找到 radio「${label}」`);
    }
    await sleep(400);
    return { ok: true, label };
  }

  /**
   * @param {'image'|'video'|'agent'} mode
   */
  async setMode(mode = 'image') {
    const cfg = IMAGINE_MODES[mode];
    if (!cfg) {
      await this.fail(
        'INVALID_MODE',
        `未知 Imagine 模式: ${mode}（image|video|agent）`,
      );
    }
    await this.clickRadioByLabel(cfg.label);
    // 校验：目标 radio 应为 data-state=true / aria-checked=true
    const ok = await this.page.evaluate((label) => {
      const btn = [...document.querySelectorAll('button[role="radio"]')].find(
        (b) => (b.textContent || '').trim() === label,
      );
      if (!btn) return false;
      const st = btn.getAttribute('data-state') || btn.getAttribute('aria-checked');
      return st === 'true' || st === 'on' || st === 'checked';
    }, cfg.label);
    if (!ok) {
      // 再点一次
      await this.clickRadioByLabel(cfg.label);
      await sleep(300);
    }
    return { ok: true, mode, label: cfg.label };
  }

  /**
   * 图片模式质量：speed | quality
   * @param {'speed'|'quality'} quality
   */
  async setImageQuality(quality = 'quality') {
    const label = IMAGINE_QUALITY_LABELS[quality];
    if (!label) {
      await this.fail('INVALID_QUALITY', `未知质量: ${quality}`);
    }
    // 仅在图片模式下这些 radio 存在
    const exists = await this.page.evaluate(
      (t) =>
        [...document.querySelectorAll('button[role="radio"]')].some(
          (b) => (b.textContent || '').trim() === t,
        ),
      label,
    );
    if (!exists) return { ok: false, skipped: true, label };
    return this.clickRadioByLabel(label);
  }

  /**
   * 视频分辨率 480p | 720p
   * @param {'480p'|'720p'} res
   */
  async setVideoResolution(res = '480p') {
    if (!IMAGINE_VIDEO_RES.includes(res)) {
      await this.fail('INVALID_RES', `未知分辨率: ${res}`);
    }
    return this.clickRadioByLabel(res);
  }

  /**
   * 视频时长 6s | 10s
   * @param {'6s'|'10s'} duration
   */
  async setVideoDuration(duration = '6s') {
    if (!IMAGINE_VIDEO_DURATION.includes(duration)) {
      await this.fail('INVALID_DURATION', `未知时长: ${duration}`);
    }
    return this.clickRadioByLabel(duration);
  }

  /**
   * @param {string} ratio  2:3 | 3:2 | 1:1 | 9:16 | 16:9
   */
  async setRatio(ratio) {
    if (!IMAGINE_RATIOS.includes(ratio)) {
      await this.fail(
        'INVALID_RATIO',
        `未知宽高比: ${ratio}（${IMAGINE_RATIOS.join('/')}）`,
      );
    }
    const current = await this.page.evaluate((sel) => {
      const b = document.querySelector(sel);
      return b ? (b.textContent || '').trim() : '';
    }, IMAGINE_RATIO_BTN_SEL);
    if (current.startsWith(ratio)) return { ok: true, ratio, already: true };

    const btn = await this.page.$(IMAGINE_RATIO_BTN_SEL);
    if (!btn) await this.fail('RATIO_BTN_MISSING', '未找到宽高比按钮');
    const box = await btn.boundingBox();
    if (!box) await this.fail('RATIO_BTN_HIDDEN', '宽高比按钮不可见');
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await sleep(40);
    await this.page.mouse.up();
    await this.page.waitForSelector('[role="menuitem"]', { timeout: 5_000 });

    const clicked = await this.page.evaluate((r) => {
      const items = [...document.querySelectorAll('[role="menuitem"]')];
      const target = items.find((it) =>
        (it.textContent || '').trim().startsWith(r),
      );
      if (!target) return false;
      target.click();
      return true;
    }, ratio);
    if (!clicked) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.fail('RATIO_ITEM_MISSING', `未找到宽高比 menuitem「${ratio}」`);
    }
    await sleep(400);
    return { ok: true, ratio };
  }

  /**
   * 点击精选模板预设
   * @param {string} presetName
   */
  async applyPreset(presetName) {
    const ok = await this.page.evaluate((name) => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) =>
          (b.textContent || '').trim() === name && b.offsetParent !== null,
      );
      if (!btn) return false;
      btn.click();
      return true;
    }, presetName);
    if (!ok) await this.fail('PRESET_NOT_FOUND', `未找到预设「${presetName}」`);
    await sleep(600);
    return { ok: true, preset: presetName };
  }

  /**
   * 上传一张或多张参考图（页面 multiple=true）
   * @param {string[]} refImagePaths
   */
  async attachReferenceImages(refImagePaths) {
    if (!refImagePaths?.length) return { ok: true, count: 0 };
    const abs = [];
    for (const p of refImagePaths) {
      const a = path.resolve(p);
      try {
        await fs.access(a);
      } catch {
        await this.fail('REF_NOT_FOUND', `参考图不存在: ${a}`);
      }
      abs.push(a);
    }
    await this.page.waitForSelector(IMAGINE_FILE_INPUT_SEL, {
      timeout: 15_000,
    });
    const input = await this.page.$(IMAGINE_FILE_INPUT_SEL);
    if (!input) {
      await this.fail(
        'UPLOAD_INPUT_MISSING',
        `未找到 ${IMAGINE_FILE_INPUT_SEL}`,
      );
    }
    await input.uploadFile(...abs);
    // 等附件 chip / 缩略图
    await sleep(Math.min(12_000, 2500 + abs.length * 2000));
    // 上传后提交按钮可能短暂 disabled
    await this.page
      .waitForFunction(
        (sel) => {
          const b = document.querySelector(sel);
          return b && !b.disabled;
        },
        { timeout: 60_000 },
        IMAGINE_SUBMIT_SEL,
      )
      .catch(() => {});
    return { ok: true, count: abs.length, paths: abs };
  }

  async typePrompt(text) {
    await this.page.waitForSelector(IMAGINE_EDITOR_SEL, {
      visible: true,
      timeout: 20_000,
    });
    await this.page.click(IMAGINE_EDITOR_SEL);
    await sleep(150);
    await this.page.keyboard.down('Meta');
    await this.page.keyboard.press('KeyA');
    await this.page.keyboard.up('Meta');
    await this.page.keyboard.press('Backspace');
    await sleep(100);

    const cdp = await this.page.createCDPSession();
    try {
      await cdp.send('Input.insertText', { text });
    } finally {
      await cdp.detach().catch(() => {});
    }
    await sleep(400);

    const len = await this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return (el?.innerText || el?.textContent || '').trim().length;
    }, IMAGINE_EDITOR_SEL);

    if (len < Math.min(4, text.trim().length)) {
      // 键盘兜底
      await this.page.keyboard.type(text, { delay: 5 });
      await sleep(300);
    }
  }

  /**
   * 真实鼠标提交（Radix/React 需要 pointer 链）
   */
  async clickSubmit() {
    await this.page.waitForSelector(IMAGINE_SUBMIT_SEL, { timeout: 15_000 });
    await this.page
      .waitForFunction(
        (sel) => {
          const b = document.querySelector(sel);
          return b && !b.disabled && b.offsetParent !== null;
        },
        { timeout: 30_000 },
        IMAGINE_SUBMIT_SEL,
      )
      .catch(() => {});

    const btn = await this.page.$(IMAGINE_SUBMIT_SEL);
    if (!btn) await this.fail('SUBMIT_MISSING', '未找到提交按钮');
    const box = await btn.boundingBox();
    if (!box) await this.fail('SUBMIT_HIDDEN', '提交按钮不可见');

    // 仍 disabled 时再等一会儿（上传后）
    const disabled = await this.page.evaluate(
      (sel) => !!document.querySelector(sel)?.disabled,
      IMAGINE_SUBMIT_SEL,
    );
    if (disabled) {
      await this.page.waitForFunction(
        (sel) => {
          const b = document.querySelector(sel);
          return b && !b.disabled;
        },
        { timeout: 60_000 },
        IMAGINE_SUBMIT_SEL,
      );
    }

    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await sleep(50);
    await this.page.mouse.up();
  }

  /**
   * 收集当前页 assets.grok.com 媒体 src（用于提交前后 diff）
   */
  async collectAssetSrcs() {
    return this.page.evaluate(() => {
      const srcs = new Set();
      for (const i of document.querySelectorAll('img')) {
        if (/assets\.grok\.com/i.test(i.src)) srcs.add(i.src.split('?')[0]);
      }
      for (const v of document.querySelectorAll('video')) {
        const s = v.currentSrc || v.src;
        if (s && /assets\.grok\.com/i.test(s)) srcs.add(s.split('?')[0]);
      }
      return [...srcs];
    });
  }

  /**
   * 等待生成完成（新 UI 不一定跳 /imagine/post/）
   *
   * 完成信号（任一）：
   * 1. URL → /imagine/post/<uuid> 且出现下载按钮（旧路径）
   * 2. 出现「生成更多」且页面标题/顶栏含 prompt 片段（探索结果网格）
   * 3. 出现新的 assets.grok.com/…/generated/… 资源
   * 4. asset src 集合相对 beforeSrcs 增长且尺寸达标
   *
   * @param {{ timeout?: number, beforeSrcs?: string[], promptHint?: string }} [opts]
   */
  async waitForReady(opts = {}) {
    const timeout = opts.timeout ?? 180_000;
    const before = new Set(opts.beforeSrcs || []);
    const hint = (opts.promptHint || '').slice(0, 40);
    const start = Date.now();
    let lastLog = 0;

    while (Date.now() - start < timeout) {
      const st = await this.page.evaluate(
        ({ beforeList, hintText }) => {
          const beforeSet = new Set(beforeList);
          const url = location.href;
          const postUrl = /\/imagine\/post\/[a-f0-9-]+/i.test(url);
          const download = !!document.querySelector(
            'button[aria-label="下载"], button[aria-label="Download"]',
          );
          const genMore = [...document.querySelectorAll('button')].some((b) =>
            /生成更多|Generate more/i.test(b.textContent || ''),
          );
          const bodyText = (document.body?.innerText || '').slice(0, 2000);
          const hintHit =
            hintText &&
            hintText.length >= 8 &&
            bodyText.includes(hintText.slice(0, 24));

          const imgs = [...document.querySelectorAll('img')].filter((i) =>
            /assets\.grok\.com/i.test(i.src),
          );
          const videos = [...document.querySelectorAll('video')].filter(
            (v) => {
              const s = v.currentSrc || v.src;
              return s && /assets\.grok\.com/i.test(s);
            },
          );

          const allSrcs = [];
          for (const i of imgs) allSrcs.push(i.src.split('?')[0]);
          for (const v of videos) {
            allSrcs.push((v.currentSrc || v.src).split('?')[0]);
          }
          const newSrcs = allSrcs.filter((s) => !beforeSet.has(s));
          const hasGeneratedPath = newSrcs.some((s) =>
            /\/generated\//i.test(s),
          );
          const newLargeImg = imgs.some(
            (i) =>
              !beforeSet.has(i.src.split('?')[0]) &&
              i.complete &&
              i.naturalWidth >= 256,
          );
          const newVideo = videos.some((v) => {
            const s = (v.currentSrc || v.src).split('?')[0];
            return !beforeSet.has(s) && (v.readyState || 0) >= 1;
          });

          return {
            url,
            postUrl,
            download,
            genMore,
            hintHit,
            hasGeneratedPath,
            newLargeImg,
            newVideo,
            newCount: newSrcs.length,
          };
        },
        { beforeList: [...before], hintText: hint },
      );

      // 必须出现「新」资源，避免沿用上一次生成的「生成更多」网格
      const done =
        st.hasGeneratedPath ||
        st.newVideo ||
        (st.postUrl && (st.download || st.newLargeImg || st.hasGeneratedPath)) ||
        (st.newLargeImg && st.hintHit) ||
        (st.genMore && st.hintHit && st.newCount > 0 && st.newLargeImg);

      if (done) {
        await sleep(1500);
        return { ok: true, url: this.page.url(), signal: st };
      }

      const now = Date.now();
      if (this.sessionLog && now - lastLog > 10_000) {
        await this.sessionLog.logWaiting({
          phase: 'await_imagine_result',
          elapsedMs: now - start,
          ...st,
        });
        lastLog = now;
      }
      await sleep(1200);
    }

    await this.fail(
      'IMAGE_TIMEOUT',
      `等待 Grok Imagine 结果超时（${timeout / 1000}s）`,
    );
  }

  /**
   * @param {{ prefer?: 'image'|'video', beforeSrcs?: string[] }} [opts]
   */
  async extractMainAsset(opts = {}) {
    const prefer = opts.prefer || 'auto';
    const beforeSrcs = opts.beforeSrcs || [];
    return this.page.evaluate(
      ({ preferKind, beforeList }) => {
        const beforeSet = new Set(beforeList);
        const isNew = (src) => {
          const base = (src || '').split('?')[0];
          return base && !beforeSet.has(base);
        };
        const score = (src, w) => {
          let s = w || 0;
          if (/\/generated\//i.test(src)) s += 10000;
          if (isNew(src)) s += 5000;
          return s;
        };

        const videos = [...document.querySelectorAll('video')]
          .map((v) => {
            const src = v.currentSrc || v.src;
            if (!src || !/assets\.grok\.com/i.test(src)) return null;
            return {
              kind: 'video',
              src,
              poster: v.poster || null,
              width: v.videoWidth || 0,
              height: v.videoHeight || 0,
              _score: score(src, v.videoWidth || 500),
            };
          })
          .filter(Boolean)
          .sort((a, b) => b._score - a._score);

        const imgs = [...document.querySelectorAll('img')]
          .filter(
            (i) =>
              /assets\.grok\.com/i.test(i.src) &&
              i.naturalWidth >= 128 &&
              i.complete,
          )
          .map((i) => ({
            kind: 'image',
            src: i.src,
            width: i.naturalWidth,
            height: i.naturalHeight,
            alt: i.alt || '',
            poster: null,
            _score: score(i.src, i.naturalWidth),
          }))
          .sort((a, b) => b._score - a._score);

        const strip = (x) => {
          if (!x) return null;
          const { _score, ...rest } = x;
          return rest;
        };

        if (preferKind === 'image') {
          return strip(imgs[0]) || strip(videos[0]);
        }
        if (preferKind === 'video') {
          return strip(videos[0]) || strip(imgs[0]);
        }
        return strip(videos[0]) || strip(imgs[0]);
      },
      { preferKind: prefer, beforeList: beforeSrcs },
    );
  }

  async downloadBuffer(src) {
    const { base64, type, size } = await this.page.evaluate(async (u) => {
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, i + chunk),
        );
      }
      return { base64: btoa(binary), type: blob.type, size: blob.size };
    }, src);
    return {
      buffer: Buffer.from(base64, 'base64'),
      mime: type || 'application/octet-stream',
      size,
    };
  }

  static extFromMime(mime, kind) {
    if (!mime) return kind === 'video' ? '.mp4' : '.png';
    if (/png/i.test(mime)) return '.png';
    if (/webp/i.test(mime)) return '.webp';
    if (/jpe?g/i.test(mime)) return '.jpg';
    if (/gif/i.test(mime)) return '.gif';
    if (/mp4/i.test(mime)) return '.mp4';
    if (/webm/i.test(mime)) return '.webm';
    if (/quicktime/i.test(mime)) return '.mov';
    return kind === 'video' ? '.mp4' : '.png';
  }

  /**
   * 统一生成入口
   *
   * @param {string} prompt
   * @param {{
   *   mode?: 'image'|'video'|'agent',
   *   ratio?: string,
   *   quality?: 'speed'|'quality',
   *   resolution?: '480p'|'720p',
   *   duration?: '6s'|'10s',
   *   preset?: string,
   *   refImages?: string[],
   *   timeout?: number,
   *   filename?: string,
   *   outputDir?: string,
   *   open?: boolean,
   * }} [opts]
   */
  async generate(prompt, opts = {}) {
    if (!prompt || typeof prompt !== 'string') {
      await this.fail('BAD_ARGS', 'generate 需要 prompt 字符串');
    }
    const mode = opts.mode || 'image';
    const modeCfg = IMAGINE_MODES[mode];
    if (!modeCfg) await this.fail('INVALID_MODE', `未知 mode: ${mode}`);

    await this.ensureSession();
    if (opts.open !== false) {
      await this.open({ waitReady: true });
    } else {
      await this.waitReady({ timeout: 30_000 });
    }

    if (this.sessionLog) {
      await this.sessionLog.logUser(prompt, {
        kind: mode,
        mode,
        ratio: opts.ratio,
        refImages: opts.refImages || [],
        url: this.page.url(),
      });
      await this.sessionLog.setStatus('waiting', `generating ${mode}`);
    }

    try {
      // 先清到目标模式（避免页面残留「视频」态）
      await this.setMode(mode);
      await sleep(400);

      if (mode === 'image') {
        await this.setImageQuality(opts.quality || 'quality');
      }
      if (mode === 'video') {
        if (opts.resolution) await this.setVideoResolution(opts.resolution);
        if (opts.duration) await this.setVideoDuration(opts.duration);
      }
      if (opts.ratio) await this.setRatio(opts.ratio);

      if (opts.refImages?.length) {
        await this.attachReferenceImages(opts.refImages);
      }
      if (opts.preset) await this.applyPreset(opts.preset);

      // 提交前再确认一次模式（上传/预设可能改变 UI）
      await this.setMode(mode);

      await this.typePrompt(prompt);
      const beforeSrcs = await this.collectAssetSrcs();
      await this.clickSubmit();

      await this.waitForReady({
        timeout: opts.timeout ?? modeCfg.defaultTimeoutMs,
        beforeSrcs,
        promptHint: prompt,
      });

      const prefer =
        mode === 'image' ? 'image' : mode === 'video' ? 'video' : 'auto';
      let asset = await this.extractMainAsset({ prefer, beforeSrcs });
      if (!asset) {
        await this.fail('EXTRACT_FAILED', '未能提取 assets.grok.com 媒体');
      }
      // 图片模式若仍抽到旧视频，强制按 image 再抽一次
      if (mode === 'image' && asset.kind !== 'image') {
        asset = await this.extractMainAsset({
          prefer: 'image',
          beforeSrcs,
        });
      }
      if (!asset) {
        await this.fail('EXTRACT_FAILED', '未能提取生成结果');
      }

      const { buffer, mime, size } = await this.downloadBuffer(asset.src);
      const outDir = opts.outputDir || this.mediaDir;
      await fs.mkdir(outDir, { recursive: true });
      const ext = GrokImagineClient.extFromMime(mime, asset.kind);
      const base =
        opts.filename ||
        `grok-${mode}-${new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19)}`;
      const filePath = path.join(outDir, `${base}${ext}`);
      await fs.writeFile(filePath, buffer);

      const media = {
        path: filePath,
        kind: asset.kind,
        mime,
        width: asset.width,
        height: asset.height,
      };

      if (this.sessionLog) {
        await this.sessionLog.logAssistant(
          `[${asset.kind}] ${asset.width}x${asset.height}`,
          { media, url: this.page.url(), src: asset.src.slice(0, 200) },
        );
      }

      return {
        ok: true,
        prompt,
        mode,
        kind: asset.kind,
        filePath,
        imagePath: asset.kind === 'image' ? filePath : null,
        videoPath: asset.kind === 'video' ? filePath : null,
        width: asset.width,
        height: asset.height,
        mime,
        size,
        url: asset.src,
        postUrl: this.page.url(),
        poster: asset.poster || null,
        ratio: opts.ratio || null,
        preset: opts.preset || null,
        refImages: opts.refImages || [],
        session: this.sessionLog?.paths || null,
        media,
      };
    } catch (err) {
      if (this.sessionLog) {
        await this.sessionLog.logError(
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }
  }

  /** 文生图快捷方法 */
  async generateImage(prompt, opts = {}) {
    return this.generate(prompt, { ...opts, mode: 'image' });
  }

  /** 文生视频快捷方法 */
  async generateVideo(prompt, opts = {}) {
    return this.generate(prompt, { ...opts, mode: 'video' });
  }

  /**
   * 参考图 + 提示词（可多图）
   * @param {string} prompt
   * @param {string[]} refImages
   * @param {object} [opts]
   */
  async generateWithRefs(prompt, refImages, opts = {}) {
    return this.generate(prompt, {
      ...opts,
      mode: opts.mode || 'image',
      refImages,
    });
  }

  async generateWithTool(tool, prompt, opts = {}) {
    if (tool === 'image') return this.generateImage(prompt, opts);
    if (tool === 'video') return this.generateVideo(prompt, opts);
    await this.fail('NOT_SUPPORTED', `Grok Imagine 不支持 tool=${tool}`);
  }

  async explore() {
    await this.open({ waitReady: true });
    const info = await this.page.evaluate(() => {
      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const radios = [...document.querySelectorAll('button[role="radio"]')].map(
        (b) => ({
          text: clean(b.textContent),
          state: b.getAttribute('data-state') || b.getAttribute('aria-checked'),
        }),
      );
      const file = document.querySelector('input[type="file"][name="files"]');
      const editor = !!document.querySelector(
        '[aria-label="Ask Grok anything"], [contenteditable="true"]',
      );
      const submit = document.querySelector(
        'button[type="submit"][aria-label="提交"], button[type="submit"][aria-label="Submit"]',
      );
      const presets = [...document.querySelectorAll('button')]
        .map((b) => clean(b.textContent))
        .filter((t) => t && t.length > 2 && t.length < 36)
        .filter((t) =>
          /Chibi|Headshot|Logo|Street|Enhancer|Comic|Remover|Product|Anime|Watercolor|Game|Animation|Portrait|Dance|Empire|Western|Funky|Future|Spaghetti|Glossy|Object|Quality|Professional|3D|80s|70s|Roman|Family/i.test(
            t,
          ),
        );
      return {
        url: location.href,
        hasEditor: editor,
        submitPresent: !!submit,
        submitDisabled: submit ? !!submit.disabled : null,
        radios,
        fileInput: file
          ? {
              multiple: file.multiple,
              accept: file.accept,
              name: file.name,
            }
          : null,
        presets: [...new Set(presets)].slice(0, 30),
      };
    });

    return {
      ok: true,
      provider: 'grok-imagine',
      ...info,
      capabilities: {
        image: true,
        video: true,
        agent: true,
        multiRefImages: !!info.fileInput?.multiple,
        ratios: [...IMAGINE_RATIOS],
        videoResolution: [...IMAGINE_VIDEO_RES],
        videoDuration: [...IMAGINE_VIDEO_DURATION],
        imageQuality: ['speed', 'quality'],
      },
    };
  }

  async screenshot(opts = {}) {
    await fs.mkdir(this.mediaDir, { recursive: true });
    const file =
      opts.path || path.join(this.mediaDir, `shot-${Date.now()}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await this.page.screenshot({ path: file, fullPage: !!opts.fullPage });
    return file;
  }
}

export default GrokImagineClient;
