/**
 * ChatGPT 网页自动化客户端（chatgpt.com）
 *
 * 通过 puppeteer.connect 附着本机调试 Chrome，复用登录态。
 *
 * 主要能力：
 * - 对话：open / chat / send / waitForResponse（主站）
 * - 生图：openImages / generateImage（https://chatgpt.com/images/）
 * - 落盘：SessionLog（runtime/sessions/chatgpt/...）
 *
 * @module providers/chatgpt/client/chatgpt-client
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
  CHATGPT_URL,
  CHATGPT_ORIGIN,
  CHATGPT_IMAGES_URL,
  EDITOR_SEL,
  SEND_BTN_SEL,
  STOP_BTN_SEL,
  ASSISTANT_MSG_SEL,
  CONVERSATION_TURN_SEL,
  GOOD_IMAGE_BTN_SEL,
  IMAGES_FILE_INPUT_SEL,
  GENERATED_IMG_SRC_RE,
  GENERATED_IMG_ALT_RE,
} from '../selectors/ui.mjs';

export {
  CHATGPT_URL,
  CHATGPT_ORIGIN,
  CHATGPT_IMAGES_URL,
  EDITOR_SEL,
};

export class ChatgptClient {
  static id = 'chatgpt';
  static displayName = 'ChatGPT';
  static url = CHATGPT_URL;
  static origin = CHATGPT_ORIGIN;
  static imagesUrl = CHATGPT_IMAGES_URL;
  static urlIncludes = 'chatgpt.com';

  /**
   * @param {import('puppeteer-core').Page} page
   * @param {{ runtimeDir?: string, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   */
  constructor(page, opts = {}) {
    /** @type {import('puppeteer-core').Page} */
    this.page = page;
    this.runtimeDir = opts.runtimeDir || RUNTIME_ROOT;
    this.mediaDir = path.join(this.runtimeDir, 'media', 'chatgpt');
    /** @type {SessionLog | null} */
    this.sessionLog = null;
    if (opts.sessionLog instanceof SessionLog) {
      this.sessionLog = opts.sessionLog;
    } else if (opts.sessionLog !== false) {
      this.sessionLog = new SessionLog({
        provider: 'chatgpt',
        rootDir: path.join(this.runtimeDir, 'sessions'),
        sessionId: opts.sessionId,
        label: 'chatgpt',
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
          urlIncludes: 'chatgpt.com',
        })) || (await browser.newPage());
    } else {
      page = await browser.newPage();
    }
    await applyStealth(page);
    try {
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(CHATGPT_ORIGIN, [
        'clipboard-read',
        'clipboard-write',
      ]);
    } catch {
      // ignore
    }
    return new ChatgptClient(page, opts);
  }

  /**
   * 打开主站对话页
   * @param {{ waitReady?: boolean, timeout?: number }} [opts]
   */
  async open(opts = {}) {
    const waitReady = opts.waitReady !== false;
    const timeout = opts.timeout ?? 90_000;
    try {
      const url = this.page.url();
      if (!url.includes('chatgpt.com') || url.includes('/images')) {
        await this.page.goto(CHATGPT_URL, {
          waitUntil: 'domcontentloaded',
          timeout,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/detached|Target closed|Session closed/i.test(msg)) {
        const browser = this.page.browser();
        this.page = await browser.newPage();
        await applyStealth(this.page);
        await this.page.goto(CHATGPT_URL, {
          waitUntil: 'domcontentloaded',
          timeout,
        });
      } else {
        throw err;
      }
    }
    if (waitReady) await this.waitReady({ timeout });
    return { ok: true, url: this.page.url() };
  }

  /**
   * 打开 Images 2.0 专用页（推荐生图入口）
   * @param {{ waitReady?: boolean, timeout?: number }} [opts]
   */
  async openImages(opts = {}) {
    const waitReady = opts.waitReady !== false;
    const timeout = opts.timeout ?? 120_000;
    // 必须带尾斜杠，避免 service worker 打断导航
    await this.page.goto(CHATGPT_IMAGES_URL, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    await sleep(2500);
    if (waitReady) await this.waitReady({ timeout });
    return { ok: true, url: this.page.url(), mode: 'images' };
  }

  async waitReady(opts = {}) {
    const timeout = opts.timeout ?? 90_000;
    await this.page.waitForSelector(EDITOR_SEL, {
      visible: true,
      timeout,
    });
    await sleep(600);
    return true;
  }

  async healthCheck() {
    try {
      await this.open({ waitReady: true, timeout: 25_000 });
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

  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  async fail(code, message, cause) {
    const shot = await this.captureError(code.toLowerCase());
    throw new AiWebError(message, {
      code,
      cause,
      screenshot: shot,
      provider: 'chatgpt',
    });
  }

  // ─── 文本输入 ───────────────────────────────────────────

  /**
   * 向输入框写入文本（CDP insertText，适合长中文）
   * @param {string} text
   */
  async typePrompt(text) {
    await this.page.waitForSelector(EDITOR_SEL, {
      visible: true,
      timeout: 30_000,
    });
    await this.page.click(EDITOR_SEL);
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
    }, EDITOR_SEL);

    if (len < Math.min(8, text.trim().length)) {
      await this.page.evaluate(
        ({ sel, value }) => {
          const el = document.querySelector(sel);
          if (!el) return;
          el.focus();
          const dt = new DataTransfer();
          dt.setData('text/plain', value);
          el.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        { sel: EDITOR_SEL, value: text },
      );
      await sleep(600);
    }
  }

  async clickSend(opts = {}) {
    const enableTimeoutMs = opts.enableTimeoutMs ?? 60_000;
    await this.page.waitForFunction(
      (sel) => {
        const b = document.querySelector(sel);
        return b && !b.disabled;
      },
      { timeout: enableTimeoutMs },
      SEND_BTN_SEL,
    );
    await this.page.click(SEND_BTN_SEL);
  }

  // ─── 主站对话 ───────────────────────────────────────────

  async countResponses() {
    return this.page.evaluate(
      (sel) => document.querySelectorAll(sel).length,
      ASSISTANT_MSG_SEL,
    );
  }

  async getLastResponse() {
    return this.page.evaluate((sel) => {
      const msgs = [...document.querySelectorAll(sel)];
      return msgs.at(-1)?.innerText?.trim() || '';
    }, ASSISTANT_MSG_SEL);
  }

  async newChat() {
    const clicked = await this.page.evaluate(() => {
      const btn = [...document.querySelectorAll('a, button')].find((el) =>
        /新聊天|New chat/i.test(
          el.innerText || el.getAttribute('aria-label') || '',
        ),
      );
      if (btn) {
        /** @type {HTMLElement} */ (btn).click();
        return true;
      }
      return false;
    });
    if (!clicked) {
      await this.page.goto(CHATGPT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
    }
    await sleep(2000);
    await this.waitReady({ timeout: 30_000 });
    return { ok: true, clicked };
  }

  /**
   * @param {string} text
   * @returns {Promise<{ prevCount: number }>}
   */
  async send(text) {
    await this.open({ waitReady: true });
    const prevCount = await this.countResponses();
    await this.typePrompt(text);
    try {
      await this.clickSend();
    } catch {
      await this.page.keyboard.press('Enter');
    }
    await sleep(400);
    return { prevCount };
  }

  /**
   * @param {number} prevCount
   * @param {{ timeout?: number }} [opts]
   */
  async waitForResponse(prevCount, opts = {}) {
    const timeout = opts.timeout ?? 180_000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const state = await this.page.evaluate(
        ({ msgSel, stopSel, prev }) => {
          const stop = document.querySelector(stopSel);
          const generating = !!(stop && stop.offsetParent !== null);
          const msgs = [...document.querySelectorAll(msgSel)];
          const last = msgs.at(-1)?.innerText?.trim() || '';
          return {
            generating,
            count: msgs.length,
            last,
            ready: msgs.length > prev && !generating && !!last,
          };
        },
        { msgSel: ASSISTANT_MSG_SEL, stopSel: STOP_BTN_SEL, prev: prevCount },
      );
      if (state.ready) return state.last;
      await sleep(1200);
    }
    const last = await this.getLastResponse();
    if (last) return last;
    await this.fail('TIMEOUT', '等待 ChatGPT 回复超时');
  }

  /**
   * 主站对话
   * @param {string} text
   * @param {{ newChat?: boolean, timeout?: number }} [opts]
   */
  async chat(text, opts = {}) {
    await this.ensureSession();
    await this.open({ waitReady: true });
    if (opts.newChat) await this.newChat();
    if (this.sessionLog) {
      await this.sessionLog.logUser(text, { url: this.page.url() });
    }
    try {
      if (this.sessionLog) {
        await this.sessionLog.setStatus('waiting', 'waiting reply');
      }
      const { prevCount } = await this.send(text);
      const reply = await this.waitForResponse(prevCount, {
        timeout: opts.timeout,
      });
      if (this.sessionLog) {
        await this.sessionLog.logAssistant(reply, { url: this.page.url() });
      }
      return {
        ok: true,
        prompt: text,
        reply,
        url: this.page.url(),
        session: this.sessionLog?.paths || null,
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

  // ─── Images 2.0 生图 ────────────────────────────────────

  /**
   * 上传参考图（可选）
   * @param {string[]} refImagePaths 本地绝对路径
   */
  async attachReferenceImages(refImagePaths) {
    if (!refImagePaths?.length) return { ok: true, count: 0 };
    for (const p of refImagePaths) {
      try {
        await fs.access(p);
      } catch {
        await this.fail('REF_NOT_FOUND', `参考图不存在: ${p}`);
      }
    }
    await this.page.waitForSelector(IMAGES_FILE_INPUT_SEL, {
      timeout: 15_000,
    });
    const input = await this.page.$(IMAGES_FILE_INPUT_SEL);
    if (!input) {
      await this.fail(
        'UPLOAD_INPUT_MISSING',
        `未找到参考图 input（${IMAGES_FILE_INPUT_SEL}）`,
      );
    }
    await input.uploadFile(...refImagePaths.map((p) => path.resolve(p)));

    const expected = refImagePaths.length;
    await this.page.waitForFunction(
      (n) => {
        const removeBtns = [...document.querySelectorAll('button[aria-label]')]
          .filter((b) =>
            /移除文件|Remove file/i.test(b.getAttribute('aria-label') || ''),
          );
        return removeBtns.length >= n;
      },
      { timeout: 60_000 },
      expected,
    );
    await sleep(800);
    return { ok: true, count: expected };
  }

  /**
   * 等待生图完成
   * @param {{ timeout?: number, priorTurnCount?: number }} [opts]
   */
  async waitForImageReady(opts = {}) {
    const timeout = opts.timeout ?? 300_000;
    const priorTurnCount = opts.priorTurnCount ?? 0;
    const start = Date.now();
    let lastLog = 0;

    while (Date.now() - start < timeout) {
      const status = await this.page.evaluate(
        ({ turnSel, completeSel, sendSel, prior }) => {
          const turns = document.querySelectorAll(turnSel);
          const last = turns[turns.length - 1];
          const completeBtn = last?.querySelector(completeSel);
          const sendBtn = document.querySelector(sendSel);
          const stopVisible = [...document.querySelectorAll('button')].some(
            (b) =>
              /停止|Stop/i.test(
                b.getAttribute('aria-label') || b.innerText || '',
              ),
          );

          let generatedImg = null;
          const scan = (root) => {
            if (!root) return null;
            return (
              [...root.querySelectorAll('img')].find(
                (i) =>
                  /已生成图片|Generated/i.test(i.alt || '') ||
                  /estuary\/content/i.test(i.src || ''),
              ) || null
            );
          };
          generatedImg = scan(last) || scan(document.body);
          if (
            generatedImg &&
            generatedImg.naturalWidth < 100 &&
            /estuary\/content/i.test(generatedImg.src || '')
          ) {
            // 仍算候选
          }

          return {
            turnCount: turns.length,
            hasCompleteMarker: !!completeBtn,
            sendEnabled: !!(sendBtn && !sendBtn.disabled),
            hasGeneratedImg: !!generatedImg,
            imgComplete: generatedImg
              ? generatedImg.complete && generatedImg.naturalWidth > 0
              : false,
            stopVisible,
            pastBaseline: turns.length > prior,
          };
        },
        {
          turnSel: CONVERSATION_TURN_SEL,
          completeSel: GOOD_IMAGE_BTN_SEL,
          sendSel: SEND_BTN_SEL,
          prior: priorTurnCount,
        },
      );

      const now = Date.now();
      if (now - lastLog > 10_000) {
        // 轻量进度：仅写 session waiting
        if (this.sessionLog) {
          await this.sessionLog.logWaiting({
            elapsedMs: now - start,
            ...status,
          });
        }
        lastLog = now;
      }

      if (
        status.hasGeneratedImg &&
        status.imgComplete &&
        (status.hasCompleteMarker ||
          (status.sendEnabled && !status.stopVisible))
      ) {
        await sleep(1500);
        return status;
      }
      await sleep(1500);
    }
    await this.fail(
      'IMAGE_TIMEOUT',
      `等待 ChatGPT 生图超时（${timeout / 1000}s）`,
    );
  }

  /**
   * 从页面提取最大一张生成图元数据
   */
  async extractGeneratedImage() {
    return this.page.evaluate(
      ({ turnSel, srcRe, altRe }) => {
        const srcRx = new RegExp(srcRe, 'i');
        const altRx = new RegExp(altRe, 'i');
        const turns = document.querySelectorAll(turnSel);
        const last = turns[turns.length - 1];
        const roots = last ? [last, document.body] : [document.body];
        /** @type {{ src: string, alt: string, width: number, height: number }[]} */
        const candidates = [];
        for (const root of roots) {
          for (const i of root.querySelectorAll('img')) {
            if (!srcRx.test(i.src || '') || i.naturalWidth < 80) continue;
            candidates.push({
              src: i.src,
              alt: i.alt || '',
              width: i.naturalWidth,
              height: i.naturalHeight,
            });
          }
        }
        // 也收 alt 标记的
        if (!candidates.length) {
          for (const root of roots) {
            for (const i of root.querySelectorAll('img')) {
              if (!altRx.test(i.alt || '') || i.naturalWidth < 80) continue;
              candidates.push({
                src: i.src,
                alt: i.alt || '',
                width: i.naturalWidth,
                height: i.naturalHeight,
              });
            }
          }
        }
        candidates.sort((a, b) => b.width - a.width);
        return candidates[0] || null;
      },
      {
        turnSel: CONVERSATION_TURN_SEL,
        srcRe: GENERATED_IMG_SRC_RE.source,
        altRe: GENERATED_IMG_ALT_RE.source,
      },
    );
  }

  /**
   * 用浏览器 cookie 下载图片为 Buffer
   * @param {string} src
   */
  async downloadImageBuffer(src) {
    const { base64, type, size } = await this.page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: 'include' });
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
      mime: type || 'image/png',
      size,
    };
  }

  static extFromMime(mime) {
    if (!mime) return '.png';
    if (/png/i.test(mime)) return '.png';
    if (/webp/i.test(mime)) return '.webp';
    if (/jpe?g/i.test(mime)) return '.jpg';
    if (/gif/i.test(mime)) return '.gif';
    return '.png';
  }

  /**
   * Images 2.0 文生图 / 参考图生图
   *
   * @param {string} prompt
   * @param {{
   *   refImages?: string[],
   *   timeout?: number,
   *   filename?: string,
   *   outputDir?: string,
   *   openImages?: boolean,
   * }} [opts]
   * @returns {Promise<{
   *   ok: true,
   *   prompt: string,
   *   imagePath: string,
   *   width: number,
   *   height: number,
   *   mime: string,
   *   size: number,
   *   url: string,
   *   conversationUrl: string,
   *   session: object|null,
   *   media: { path: string, kind: 'image' },
   * }>}
   */
  async generateImage(prompt, opts = {}) {
    if (!prompt || typeof prompt !== 'string') {
      await this.fail('BAD_ARGS', 'generateImage 需要 prompt 字符串');
    }
    await this.ensureSession();
    const openImages = opts.openImages !== false;
    if (openImages) {
      await this.openImages({ waitReady: true });
    } else {
      await this.waitReady({ timeout: 30_000 });
    }

    if (this.sessionLog) {
      await this.sessionLog.logUser(prompt, {
        kind: 'image',
        url: this.page.url(),
        refImages: opts.refImages || [],
      });
      await this.sessionLog.setStatus('waiting', 'generating image');
    }

    try {
      if (opts.refImages?.length) {
        await this.attachReferenceImages(opts.refImages);
      }

      await this.typePrompt(prompt);

      const priorTurnCount = await this.page.evaluate(
        (sel) => document.querySelectorAll(sel).length,
        CONVERSATION_TURN_SEL,
      );
      await this.clickSend({
        enableTimeoutMs: opts.refImages?.length ? 90_000 : 60_000,
      });

      await this.waitForImageReady({
        timeout: opts.timeout ?? 300_000,
        priorTurnCount,
      });

      const img = await this.extractGeneratedImage();
      if (!img) {
        await this.fail('IMAGE_EXTRACT_FAILED', '未能从页面提取生成图片 URL');
      }

      const { buffer, mime, size } = await this.downloadImageBuffer(img.src);
      const outDir = opts.outputDir || this.mediaDir;
      await fs.mkdir(outDir, { recursive: true });
      const ext = ChatgptClient.extFromMime(mime);
      const base =
        opts.filename ||
        `chatgpt-image-${new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19)}`;
      const imagePath = path.join(outDir, `${base}${ext}`);
      await fs.writeFile(imagePath, buffer);

      const media = { path: imagePath, kind: 'image' };
      if (this.sessionLog) {
        await this.sessionLog.logAssistant(
          img.alt || `[image ${img.width}x${img.height}]`,
          {
            media,
            url: this.page.url(),
            imageSrc: img.src.slice(0, 200),
          },
        );
      }

      return {
        ok: true,
        prompt,
        imagePath,
        width: img.width,
        height: img.height,
        mime,
        size,
        url: img.src,
        conversationUrl: this.page.url(),
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

  /**
   * 与 Gemini generateWithTool 对齐的薄封装：目前仅 image
   * @param {'image'} tool
   * @param {string} prompt
   * @param {object} [opts]
   */
  async generateWithTool(tool, prompt, opts = {}) {
    if (tool === 'image') {
      return this.generateImage(prompt, opts);
    }
    await this.fail(
      'NOT_SUPPORTED',
      `ChatGPT 暂不支持 tool=${tool}（当前仅 image）`,
    );
  }

  /**
   * 探测页面是否具备生图入口
   */
  async explore() {
    await this.openImages({ waitReady: true }).catch(async () => {
      await this.open({ waitReady: true });
    });
    const info = await this.page.evaluate(() => {
      const editor = !!document.querySelector(
        '#prompt-textarea, [contenteditable="true"]',
      );
      const send = document.querySelector('[data-testid="send-button"]');
      const fileInputs = [...document.querySelectorAll('input[type="file"]')]
        .map((i) => ({
          name: i.getAttribute('name'),
          id: i.id,
          testid: i.getAttribute('data-testid'),
        }))
        .filter((x) => x.name || x.id || x.testid);
      const hasImagesApp = location.pathname.startsWith('/images');
      return {
        url: location.href,
        hasEditor: editor,
        sendPresent: !!send,
        sendDisabled: send ? !!send.disabled : null,
        fileInputs,
        hasImagesApp,
      };
    });
    return {
      ok: true,
      provider: 'chatgpt',
      ...info,
      capabilities: {
        chat: true,
        image: true,
        video: false,
        music: false,
        research: false,
        canvas: false,
        upload: (info.fileInputs || []).length > 0,
      },
      aliases: {
        tools: ['image'],
      },
    };
  }

  /**
   * 截图
   * @param {{ path?: string, fullPage?: boolean }} [opts]
   */
  async screenshot(opts = {}) {
    await fs.mkdir(this.mediaDir, { recursive: true });
    const file =
      opts.path || path.join(this.mediaDir, `shot-${Date.now()}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await this.page.screenshot({
      path: file,
      fullPage: !!opts.fullPage,
    });
    return file;
  }
}

export default ChatgptClient;
