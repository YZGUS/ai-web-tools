/**
 * Gemini 网页自动化客户端（gemini.google.com）
 *
 * 基于历史 page-automation GeminiSite 完整迁移。
 * 通过 puppeteer.connect 附着本机调试 Chrome，复用登录态。
 *
 * 主要能力：
 * - 对话：open / chat / send / waitForResponse
 * - 模式：listModes / setMode
 * - 工具：listTools / selectTool / generateWithTool（image|video|music|research|canvas）
 * - 探测：explore
 * - 落盘：SessionLog（runtime/sessions/gemini/...）
 *
 * @module providers/gemini/client/gemini-client
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
  GEMINI_URL,
  GEMINI_ORIGIN,
  EDITOR_SEL,
  GEMINI_TOOLS,
  GEMINI_MODES,
} from '../selectors/ui.mjs';

export { GEMINI_TOOLS, GEMINI_MODES, GEMINI_URL, EDITOR_SEL };

export class GeminiClient {

  static id = 'gemini';
  static displayName = 'Gemini';
  static url = GEMINI_URL;
  static origin = GEMINI_ORIGIN;
  static urlIncludes = 'gemini.google.com';

  /**
   * @param {import('puppeteer-core').Page} page
   * @param {{ runtimeDir?: string, outputDir?: string, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   *   outputDir 兼容旧参数，等同 runtimeDir
   */
  constructor(page, opts = {}) {
    /** @type {import('puppeteer-core').Page} */
    this.page = page;
    this.runtimeDir = opts.runtimeDir || opts.outputDir || RUNTIME_ROOT;
    this.mediaDir = path.join(this.runtimeDir, 'media', 'gemini');
    /** @type {SessionLog | null} */
    this.sessionLog = null;
    if (opts.sessionLog instanceof SessionLog) {
      this.sessionLog = opts.sessionLog;
    } else if (opts.sessionLog !== false) {
      this.sessionLog = new SessionLog({
        provider: 'gemini',
        rootDir: path.join(this.runtimeDir, 'sessions'),
        sessionId: opts.sessionId,
        label: 'gemini',
      });
    }
  }

  /** 确保会话目录就绪，返回路径信息 */
  async ensureSession() {
    if (!this.sessionLog) return null;
    await this.sessionLog.init();
    return this.sessionLog.paths;
  }

  /**
   * 附着到当前 Chrome：优先复用已打开的 Gemini 标签，否则新建
   * @param {import('puppeteer-core').Browser} browser
   * @param {{ outputDir?: string, defaultTimeout?: number, reuseTab?: boolean, forceNewTab?: boolean, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   * @returns {Promise<GeminiClient>}
   */
  static async attach(browser, opts = {}) {
    const reuseTab = opts.reuseTab !== false && !opts.forceNewTab;
    let page;

    if (reuseTab) {
      page =
        (await getPage(browser, {
          reuse: true,
          urlIncludes: 'gemini.google.com',
        })) || (await browser.newPage());
    } else {
      page = await browser.newPage();
    }

    await applyStealth(page);

    try {
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(GEMINI_ORIGIN, [
        'clipboard-read',
        'clipboard-write',
      ]);
    } catch {
      // 部分 Chrome 版本忽略即可
    }

    return new GeminiClient(page, opts);
  }

  /**
   * 打开 / 确保 Gemini 已就绪
   * @param {{ waitReady?: boolean, timeout?: number }} [opts]
   */
  async open(opts = {}) {
    const waitReady = opts.waitReady !== false;
    const timeout = opts.timeout ?? 90_000;

    const tryGoto = async () => {
      const url = this.page.url();
      if (!url.includes('gemini.google.com')) {
        await this.page.goto(GEMINI_URL, {
          waitUntil: 'domcontentloaded',
          timeout,
        });
      }
    };

    try {
      await tryGoto();
    } catch (err) {
      // 标签被关掉 / frame detached 时新建 page 重试一次
      const msg = err instanceof Error ? err.message : String(err);
      if (/detached|Target closed|Session closed/i.test(msg)) {
        try {
          const browser = this.page.browser();
          this.page = await browser.newPage();
          await applyStealth(this.page);
          await this.page.goto(GEMINI_URL, {
            waitUntil: 'domcontentloaded',
            timeout,
          });
        } catch (err2) {
          const shot = await this.captureError('open-fail');
          throw new AiWebError(
            `打开 Gemini 失败: ${err2 instanceof Error ? err2.message : err2}`,
            {
              code: 'GEMINI_OPEN_FAILED',
              cause: err2,
              screenshot: shot,
              provider: 'gemini',
            },
          );
        }
      } else {
        const shot = await this.captureError('open-fail');
        throw new AiWebError(
          `打开 Gemini 失败: ${msg}`,
          {
            code: 'GEMINI_OPEN_FAILED',
            cause: err,
            screenshot: shot,
            provider: 'gemini',
          },
        );
      }
    }

    if (waitReady) {
      await this.waitReady({ timeout });
    }

    return {
      ok: true,
      url: this.page.url(),
      ready: true,
    };
  }

  /**
   * 等待输入框出现（表示已登录且 UI 可用）
   * @param {{ timeout?: number }} [opts]
   */
  async waitReady(opts = {}) {
    const timeout = opts.timeout ?? 90_000;
    try {
      await this.page.waitForSelector(EDITOR_SEL, {
        visible: true,
        timeout,
      });
      await sleep(800);
      return { ok: true };
    } catch (err) {
      const shot = await this.captureError('not-ready');
      throw new AiWebError(
        'Gemini 输入框未出现：请确认调试 Chrome 中已登录 google 账号，且能打开 gemini.google.com',
        { code: 'GEMINI_NOT_READY', cause: err, screenshot: shot },
      );
    }
  }

  async healthCheck() {
    try {
      await this.open({ waitReady: true, timeout: 20_000 });
      return true;
    } catch {
      return false;
    }
  }

  /** 是否看起来在生成中（Stop 按钮） */
  async isGenerating() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) =>
        /停止|Stop/i.test(b.getAttribute('aria-label') || b.innerText || ''),
      ),
    );
  }

  /** model-response 条数 */
  async countResponses() {
    return this.page.evaluate(
      () => document.querySelectorAll('model-response').length,
    );
  }

  /**
   * 读取最后一条模型回复纯文本
   * @returns {Promise<string>}
   */
  async getLastResponse() {
    return this.page.evaluate(() => {
      const models = [...document.querySelectorAll('model-response')];
      const last = models[models.length - 1];
      if (!last) return '';
      const md = last.querySelector('.markdown');
      const text =
        md?.innerText?.trim() ||
        last.innerText?.replace(/^Gemini 说\s*/i, '').trim() ||
        '';
      return text;
    });
  }

  /**
   * 读取全部对话轮次（简化）
   */
  async getHistory() {
    return this.page.evaluate(() => {
      const models = [...document.querySelectorAll('model-response')];
      return models.map((el, i) => {
        const md = el.querySelector('.markdown');
        const text =
          md?.innerText?.trim() ||
          el.innerText?.replace(/^Gemini 说\s*/i, '').trim() ||
          '';
        return { index: i, role: 'model', text };
      });
    });
  }

  /**
   * 新对话
   * @param {{ timeout?: number }} [opts]
   */
  async newChat(opts = {}) {
    const timeout = opts.timeout ?? 30_000;
    const clicked = await this.page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll('button, a, [role="button"]'),
      ];
      const btn = nodes.find((el) =>
        /新对话|New chat|新的聊天/i.test(
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
      // 尝试侧边栏常见图标按钮
      await this.page.goto(GEMINI_URL, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
    } else {
      await sleep(1500);
    }

    await this.waitReady({ timeout });
    return { ok: true, clicked };
  }

  /**
   * 向输入框写入文本（不清空则追加；默认清空）
   * @param {string} text
   * @param {{ clear?: boolean }} [opts]
   */
  async typePrompt(text, opts = {}) {
    const clear = opts.clear !== false;
    await this.waitReady({ timeout: 30_000 });
    await this.page.click(EDITOR_SEL);

    if (clear) {
      await this.page.keyboard.down('Meta');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Meta');
      await this.page.keyboard.press('Backspace');
      // Windows/Linux 兼容
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
    }

    const cdp = await this.page.createCDPSession();
    try {
      await cdp.send('Input.insertText', { text });
    } finally {
      await cdp.detach().catch(() => {});
    }
    await sleep(400);
    return { ok: true, length: text.length };
  }

  /**
   * 点击发送
   */
  async clickSend() {
    const sent = await this.page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const btn = buttons.find((b) => {
        const label = b.getAttribute('aria-label') || '';
        return (
          label === '发送' ||
          /Send message|发送消息|Submit/i.test(label) ||
          label === 'Send'
        );
      });
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      // 退化：找含 send 图标且未 disabled 的
      const alt = buttons.find(
        (b) =>
          !b.disabled &&
          /send/i.test(
            (b.getAttribute('aria-label') || '') + (b.getAttribute('data-test-id') || ''),
          ),
      );
      if (alt) {
        alt.click();
        return true;
      }
      return false;
    });

    if (!sent) {
      // Enter 兜底
      await this.page.keyboard.press('Enter');
      await sleep(500);
      const generating = await this.isGenerating();
      if (!generating) {
        const shot = await this.captureError('send-fail');
        throw new AiWebError(
          '发送失败：未找到「发送」按钮，请确认已登录且输入框有内容',
          { code: 'GEMINI_SEND_FAILED', screenshot: shot },
        );
      }
    }
    return { ok: true };
  }

  /**
   * 发送消息（不写完不点发）
   * @param {string} text
   */
  async send(text) {
    if (!text || !String(text).trim()) {
      throw new AiWebError('send 需要非空文本', { code: 'EMPTY_PROMPT' });
    }
    await this.open({ waitReady: true });
    const prev = await this.countResponses();
    await this.typePrompt(String(text));
    await this.clickSend();
    return { ok: true, prevCount: prev };
  }

  /**
   * 轻量轮询页面状态（视频生成时避免沉重 evaluate 卡死 CDP）
   * 单次 evaluate 用 Promise.race 限时，超时则跳过本轮
   * @param {number} prevCount
   * @param {number} [evalTimeoutMs]
   */
  async #pollResponseState(prevCount, evalTimeoutMs = 20_000) {
    const evalPromise = this.page.evaluate((prev) => {
      const stopBtn = [...document.querySelectorAll('button')].some((b) => {
        const a = b.getAttribute('aria-label') || '';
        return /停止|Stop|停止生成|Stop generating/i.test(a);
      });
      const models = document.querySelectorAll('model-response');
      const count = models.length;
      const last = models[count - 1];
      let text = '';
      let videoN = 0;
      let imageN = 0;
      let audioN = 0;
      let readyHint = false;
      if (last) {
        const md = last.querySelector('.markdown');
        text = (md?.innerText || last.innerText || '')
          .replace(/^Gemini 说\s*/i, '')
          .trim()
          .slice(0, 500);
        readyHint =
          /视频已准备就绪|已准备就绪|Your video is ready|video is ready/i.test(
            text,
          );
        const vids = last.querySelectorAll('video');
        videoN = vids.length;
        for (const v of vids) {
          if (v.currentSrc || v.src || v.querySelector('source')?.src) {
            videoN = Math.max(videoN, 1);
          }
        }
        imageN = [...last.querySelectorAll('img')].filter((img) => {
          const s = img.currentSrc || img.src || '';
          return s.length > 30 && !s.startsWith('data:image/svg');
        }).length;
        audioN = last.querySelectorAll('audio').length;
      }
      const hasMedia = imageN > 0 || videoN > 0 || audioN > 0;
      const generating = stopBtn && !readyHint && !(videoN > 0 && count > prev);
      return {
        generating,
        count,
        last: text,
        hasMedia,
        readyHint,
        mediaCounts: {
          images: imageN,
          videos: videoN,
          audio: audioN,
          iframes: 0,
        },
      };
    }, prevCount);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('poll_evaluate_timeout')), evalTimeoutMs);
    });

    try {
      return await Promise.race([evalPromise, timeoutPromise]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /poll_evaluate_timeout|protocolTimeout|Runtime\.callFunctionOn timed out|Target closed|Session closed|detached/i.test(
          msg,
        )
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * 等待新的 model-response 完成
   * 视频：识别「视频已准备就绪」/ video 节点；evaluate 限时防 protocolTimeout
   * @param {number} prevCount
   * @param {{ timeout?: number, pollMs?: number, settleMs?: number, evalTimeoutMs?: number }} [opts]
   * @returns {Promise<string>}
   */
  async waitForResponse(prevCount, opts = {}) {
    const timeout = opts.timeout ?? 120_000;
    const pollMs = opts.pollMs ?? 2000;
    const settleMs = opts.settleMs ?? 2500;
    const evalTimeoutMs = opts.evalTimeoutMs ?? 20_000;
    const start = Date.now();
    let stableSince = 0;
    let lastHeartbeat = 0;
    let consecutivePollFails = 0;

    while (Date.now() - start < timeout) {
      let state;
      try {
        state = await this.#pollResponseState(prevCount, evalTimeoutMs);
      } catch (err) {
        consecutivePollFails += 1;
        if (consecutivePollFails > 30) throw err;
        await sleep(pollMs);
        continue;
      }

      if (!state) {
        consecutivePollFails += 1;
        await sleep(Math.min(5000, pollMs + consecutivePollFails * 200));
        continue;
      }
      consecutivePollFails = 0;

      const hasContent =
        (state.last && state.last.length > 0) ||
        state.hasMedia ||
        state.readyHint ||
        state.mediaCounts.iframes > 0;

      const mediaDone =
        state.count > prevCount &&
        (state.readyHint ||
          (state.mediaCounts.videos > 0 && !state.generating) ||
          (state.hasMedia && !state.generating));

      const textDone =
        state.count > prevCount && !state.generating && hasContent;

      const done = mediaDone || textDone;

      if (done) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= settleMs) {
          return (
            state.last ||
            `[media: img=${state.mediaCounts.images} vid=${state.mediaCounts.videos} aud=${state.mediaCounts.audio}]`
          );
        }
      } else {
        stableSince = 0;
      }

      const now = Date.now();
      if (this.sessionLog && now - lastHeartbeat >= 3000) {
        lastHeartbeat = now;
        await this.sessionLog.logWaiting({
          elapsedMs: now - start,
          generating: state.generating,
          responseCount: state.count,
          preview: (state.last || '').slice(0, 100),
          mediaCounts: state.mediaCounts,
          readyHint: state.readyHint,
        });
      }
      await sleep(pollMs);
    }

    let partial = '';
    let media = { images: [], videos: [], audio: [] };
    try {
      partial = await this.getLastResponse();
    } catch { /* ignore */ }
    try {
      media = await this.extractMediaFromLastResponse();
    } catch { /* ignore */ }
    const shot = await this.captureError('wait-timeout');
    if (
      (partial && partial.length > 10) ||
      media.images?.length ||
      media.videos?.length ||
      media.audio?.length
    ) {
      return (
        partial ||
        `[media partial: img=${media.images?.length || 0} vid=${media.videos?.length || 0}]`
      );
    }
    if (this.sessionLog) {
      await this.sessionLog.logError(`等待回复超时 ${timeout}ms`, {
        screenshot: shot,
      });
    }
    throw new AiWebError(
      `等待 Gemini 回复超时（${timeout}ms）${partial ? `；已捕获部分: ${partial.slice(0, 80)}…` : ''}`,
      { code: 'GEMINI_TIMEOUT', screenshot: shot, provider: 'gemini' },
    );
  }

  /**
   * 发送并等待完整回复
   * @param {string} text
   * @param {{ timeout?: number, newChat?: boolean }} [opts]
   */
  async chat(text, opts = {}) {
    await this.ensureSession();
    await this.open({ waitReady: true });
    if (opts.newChat) {
      await this.newChat();
    }
    if (this.sessionLog) {
      await this.sessionLog.logUser(text, { url: this.page.url() });
    }
    try {
      const { prevCount } = await this.send(text);
      const reply = await this.waitForResponse(prevCount, {
        timeout: opts.timeout,
      });
      const media = await this.extractMediaFromLastResponse();
      if (this.sessionLog) {
        await this.sessionLog.logAssistant(reply, {
          media,
          url: this.page.url(),
        });
      }
      return {
        ok: true,
        prompt: text,
        reply,
        media,
        url: this.page.url(),
        responseCount: await this.countResponses(),
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

  /**
   * 把当前页 model-response 历史导出到会话文件
   */
  async exportConversationToFile() {
    await this.ensureSession();
    const history = await this.getHistory();
    if (this.sessionLog) {
      await this.sessionLog.importHistory(history);
    }
    return {
      ok: true,
      count: history.length,
      session: this.sessionLog?.paths || null,
      history,
    };
  }

  /**
   * 截取当前对话
   * @param {{ path?: string, fullPage?: boolean }} [opts]
   */
  /**
   * 截取当前对话页面
   * @param {{ path?: string, fullPage?: boolean }} [opts]
   * @returns {Promise<string>} 截图文件路径
   */
  async screenshotChat(opts = {}) {
    await fs.mkdir(this.mediaDir, { recursive: true });
    const file =
      opts.path || path.join(this.mediaDir, `chat-${Date.now()}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await this.page.screenshot({
      path: file,
      fullPage: opts.fullPage ?? true,
    });
    return file;
  }

  /**
   * 失败时尽力截图，不抛错
   * @param {string} [prefix]
   * @returns {Promise<string|undefined>}
   */
  async captureError(prefix = 'error') {
    try {
      return await this.screenshotChat({
        path: path.join(this.mediaDir, `${prefix}-${Date.now()}.png`),
        fullPage: true,
      });
    } catch {
      return undefined;
    }
  }

  // ─── 模式 / 工具 / 多媒体能力 ─────────────────────────────

  /** 关闭可能打开的浮层 */
  async dismissOverlays() {
    await this.page.keyboard.press('Escape');
    await sleep(250);
    await this.page.keyboard.press('Escape');
    await sleep(200);
  }

  /**
   * 读取当前模式文案（如 Pro / Flash）
   */
  async getCurrentMode() {
    return this.page.evaluate(() => {
      const btn =
        document.querySelector('[data-test-id="bard-mode-menu-button"]') ||
        [...document.querySelectorAll('button')].find((b) =>
          /打开模式选择器|Open mode selector|当前模式|mode selector/i.test(
            b.getAttribute('aria-label') || '',
          ),
        );
      if (!btn) return null;
      const aria = btn.getAttribute('aria-label') || '';
      const m = aria.match(/[“"]([^”"]+)[”"]/) || aria.match(/“(.+?)”/);
      return {
        label: (btn.innerText || '').replace(/\s+/g, ' ').trim() || null,
        aria,
        mode: m?.[1] || (btn.innerText || '').trim() || null,
      };
    });
  }

  /**
   * 打开模式选择器并列出可用模式
   * @returns {Promise<string[]>}
   */
  async listModes() {
    await this.open({ waitReady: true });
    await this.dismissOverlays();
    const opened = await this.page.evaluate(() => {
      const btn =
        document.querySelector('[data-test-id="bard-mode-menu-button"]') ||
        [...document.querySelectorAll('button')].find((b) =>
          /打开模式选择器|Open mode selector|当前模式/i.test(
            b.getAttribute('aria-label') || '',
          ),
        );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!opened) {
      throw new AiWebError('未找到模式选择器', { code: 'MODE_MENU_MISSING' });
    }
    await sleep(900);
    const modes = await this.page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')]
        .map((el) => el.innerText.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    );
    await this.dismissOverlays();
    return modes;
  }

  /**
   * 切换模型模式
   * @param {string} mode  flash-lite | flash | pro | thinking | 或界面原文
   */
  async setMode(mode) {
    const key = String(mode).toLowerCase().trim();
    const patterns = GEMINI_MODES[key] || [mode];

    await this.open({ waitReady: true });
    await this.dismissOverlays();

    const opened = await this.page.evaluate(() => {
      const btn =
        document.querySelector('[data-test-id="bard-mode-menu-button"]') ||
        [...document.querySelectorAll('button')].find((b) =>
          /打开模式选择器|Open mode selector|当前模式/i.test(
            b.getAttribute('aria-label') || '',
          ),
        );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!opened) {
      throw new AiWebError('未找到模式选择器', { code: 'MODE_MENU_MISSING' });
    }
    await sleep(900);

    const clicked = await this.page.evaluate((pats) => {
      const items = [...document.querySelectorAll('[role="menuitem"]')];
      const hit = items.find((el) => {
        const t = el.innerText.replace(/\s+/g, ' ').trim();
        return pats.some((p) => t === p || t.includes(p));
      });
      if (!hit) return { ok: false, available: items.map((i) => i.innerText.trim()) };
      hit.click();
      return { ok: true, selected: hit.innerText.replace(/\s+/g, ' ').trim() };
    }, patterns);

    if (!clicked.ok) {
      await this.dismissOverlays();
      throw new AiWebError(
        `未找到模式: ${mode}；可选: ${(clicked.available || []).join(' | ')}`,
        { code: 'MODE_NOT_FOUND' },
      );
    }
    await sleep(600);
    return { ok: true, selected: clicked.selected, current: await this.getCurrentMode() };
  }

  /**
   * 打开「上传和工具」菜单
   * @param {{ expandAll?: boolean }} [opts]
   */
  async openToolsMenu(opts = {}) {
    await this.open({ waitReady: true });
    await this.dismissOverlays();
    await sleep(400);

    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      opened = await this.page.evaluate(() => {
        const match = (b) => {
          const a = (b.getAttribute('aria-label') || '').trim();
          return (
            a === '上传和工具' ||
            a === 'Upload and tools' ||
            a === 'Open upload and tools menu' ||
            a === 'Open tools' ||
            /^上传和工具/.test(a)
          );
        };
        const buttons = [...document.querySelectorAll('button')].filter(match);
        // 取靠近视口底部的输入区按钮
        const btn =
          buttons.sort(
            (a, b) =>
              b.getBoundingClientRect().top - a.getBoundingClientRect().top,
          )[0] || null;
        if (!btn) return false;
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return true;
      });
      if (!opened) {
        await sleep(800);
        // 确保在 app 对话页
        if (!this.page.url().includes('gemini.google.com/app')) {
          await this.page.goto(GEMINI_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60_000,
          });
          await this.waitReady({ timeout: 60_000 });
        }
      }
    }
    if (!opened) {
      const shot = await this.captureError('tools-menu-missing');
      throw new AiWebError('未找到「上传和工具」按钮', {
        code: 'TOOLS_MENU_MISSING',
        screenshot: shot,
      });
    }
    await sleep(1000);

    if (opts.expandAll !== false) {
      // 面板里「制作图片」等常在折叠区，需点开并滚动
      for (let i = 0; i < 3; i++) {
        await this.page.evaluate(() => {
          const clickExact = (lab) => {
            const nodes = [
              ...document.querySelectorAll(
                'button, [role="button"], [role="menuitem"], span, div, a',
              ),
            ];
            const el = nodes.find((e) => {
              const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
              // 只点短标签，避免侧栏长文
              return t === lab && t.length < 20;
            });
            if (el) {
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              return true;
            }
            return false;
          };
          clickExact('更多上传选项');
          clickExact('更多工具');
          clickExact('More upload options');
          clickExact('More tools');
          // 滚动菜单面板
          const pane = document.querySelector(
            '.cdk-overlay-pane [role="menu"], .cdk-overlay-pane, [role="menu"]',
          );
          if (pane) pane.scrollTop = pane.scrollHeight;
        });
        await sleep(500);
      }
    }

    return { ok: true };
  }

  /**
   * 读取当前工具面板内容（需已 openToolsMenu）
   */
  async #readToolsPane() {
    return this.page.evaluate(() => {
      const panes = [...document.querySelectorAll('.cdk-overlay-pane, [role="menu"]')];
      const pane = panes.sort(
        (a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0),
      )[0];
      const paneText = pane?.innerText?.trim() || '';
      const lines = paneText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => ({
        text: el.innerText.replace(/\s+/g, ' ').trim(),
        aria: el.getAttribute('aria-label') || '',
      }));

      // 面板行里也有可点项（制作图片等未必是 menuitem）
      const fromLines = lines
        .filter((t) => t.length < 40)
        .filter(
          (t) =>
            !/更多上传|更多工具|More /i.test(t) ||
            /制作|Create|Canvas|Research|上传|相册|导入|Drive|Photos|Notebook/i.test(t),
        )
        .map((text) => ({ text, aria: '' }));

      const merged = [...items];
      for (const row of fromLines) {
        if (!merged.some((m) => m.text === row.text)) merged.push(row);
      }

      return { paneText, items: merged, lines };
    });
  }

  /**
   * 列出工具菜单项（尽量展开后）
   */
  async listTools() {
    await this.openToolsMenu({ expandAll: true });
    const tools = await this.#readToolsPane();
    await this.dismissOverlays();
    return tools;
  }

  /**
   * 选择工具（制作图片 / 视频 / 音乐 / Deep Research / Canvas / 上传…）
   * @param {string} tool  image|video|music|research|canvas|upload|drive|photos|code|notebooks 或界面原文
   */
  async selectTool(tool) {
    const key = String(tool).toLowerCase().trim();
    const patterns = GEMINI_TOOLS[key] || [tool];

    await this.openToolsMenu({ expandAll: true });
    await sleep(400);

    const clicked = await this.page.evaluate((pats) => {
      const score = (el) => {
        const t = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''}`
          .replace(/\s+/g, ' ')
          .trim();
        if (t.length > 80) return null;
        for (const p of pats) {
          if (t === p) return { el, t, exact: true };
          if (t.includes(p)) return { el, t, exact: false };
        }
        return null;
      };

      const candidates = [
        ...document.querySelectorAll(
          '[role="menuitem"], button, [role="button"], a, div[tabindex], span[tabindex]',
        ),
      ];
      let best = null;
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const hit = score(el);
        if (!hit) continue;
        if (!best || hit.exact) best = hit;
        if (hit.exact) break;
      }

      // 再按可见文本节点点父级
      if (!best) {
        const all = [...document.querySelectorAll('button, [role="menuitem"], div, span')];
        for (const el of all) {
          const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
          if (t.length > 40) continue;
          if (pats.some((p) => t === p || t === p + ' ')) {
            best = { el, t, exact: true };
            break;
          }
        }
      }

      if (!best) {
        const pane = document.querySelector('.cdk-overlay-pane');
        return {
          ok: false,
          available: (pane?.innerText || '')
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 30),
        };
      }
      best.el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { ok: true, selected: best.t };
    }, patterns);

    if (!clicked.ok) {
      await this.dismissOverlays();
      throw new AiWebError(
        `未找到工具: ${tool}；可见: ${(clicked.available || []).join(' | ')}`,
        { code: 'TOOL_NOT_FOUND' },
      );
    }
    await sleep(800);
    return { ok: true, tool: key, selected: clicked.selected };
  }

  /**
   * 上传本地文件（走 input[type=file]，比点菜单更稳）
   * @param {string|string[]} filePaths
   */
  async uploadFiles(filePaths) {
    const paths = (Array.isArray(filePaths) ? filePaths : [filePaths]).map(String);
    await this.open({ waitReady: true });

    // 先尝试已有 file input；没有则点「上传文件」触发
    let input = await this.page.$('input[type="file"]');
    if (!input) {
      await this.selectTool('upload').catch(() => {});
      await sleep(500);
      input = await this.page.$('input[type="file"]');
    }
    if (!input) {
      // 再开一次工具菜单找
      await this.openToolsMenu({ expandAll: true });
      await this.page.evaluate(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
          /上传文件|Upload file/i.test(
            `${el.innerText} ${el.getAttribute('aria-label') || ''}`,
          ),
        );
        item?.click();
      });
      await sleep(600);
      input = await this.page.$('input[type="file"]');
    }
    if (!input) {
      throw new AiWebError('未找到文件上传 input', { code: 'FILE_INPUT_MISSING' });
    }
    await input.uploadFile(...paths);
    await sleep(1000);
    return { ok: true, files: paths };
  }

  /**
   * 快捷：选中工具后发送 prompt 并等待回复
   * @param {'image'|'video'|'music'|'research'|'canvas'|string} tool
   * @param {string} prompt
   * @param {{ timeout?: number, newChat?: boolean }} [opts]
   */
  async generateWithTool(tool, prompt, opts = {}) {
    await this.ensureSession();
    await this.open({ waitReady: true });
    if (opts.newChat) await this.newChat();
    await sleep(800);

    if (this.sessionLog) {
      await this.sessionLog.logUser(prompt, { tool, url: this.page.url() });
      await this.sessionLog.event('select_tool', `tool=${tool}`);
    }

    try {
      // 工具选择失败时重试一次（长任务后菜单偶发空）
      try {
        await this.selectTool(tool);
      } catch {
        await this.dismissOverlays();
        await sleep(1000);
        await this.page.goto(GEMINI_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        await this.waitReady({ timeout: 60_000 });
        await this.selectTool(tool);
      }
      await sleep(800);

      if (tool === 'research') {
        await sleep(500);
      }

      const prev = await this.countResponses();
      await this.typePrompt(prompt);
      await this.clickSend();
      await sleep(1000);

      if (tool === 'research') {
        await this.page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            /开始研究|Start research|确认|继续|开始/i.test(
              `${b.innerText || ''} ${b.getAttribute('aria-label') || ''}`,
            ),
          );
          if (btn && !btn.disabled) btn.click();
        });
      }

      // video 默认给足 10 分钟业务超时；evaluate 单次 15s 限时，避免 protocolTimeout
      const timeout =
        opts.timeout ??
        (tool === 'video'
          ? 600_000
          : tool === 'research'
            ? 600_000
            : tool === 'image' || tool === 'music'
              ? 180_000
              : 120_000);
      const waitOpts =
        tool === 'video'
          ? {
              timeout,
              pollMs: 3000,
              settleMs: 3000,
              evalTimeoutMs: 15_000,
            }
          : { timeout, pollMs: 2000, evalTimeoutMs: 20_000 };

      let reply;
      try {
        reply = await this.waitForResponse(prev, waitOpts);
      } catch (waitErr) {
        // 最后再抢救一次媒体（视频常在超时瞬间其实已就绪）
        const mediaTry = await this.extractMediaFromLastResponse().catch(
          () => null,
        );
        const textTry = await this.getLastResponse().catch(() => '');
        if (
          mediaTry?.videos?.length ||
          mediaTry?.images?.length ||
          mediaTry?.audio?.length ||
          (textTry && /准备就绪|ready|已生成/i.test(textTry))
        ) {
          reply =
            textTry ||
            `[media recovered: vid=${mediaTry?.videos?.length || 0}]`;
        } else {
          throw waitErr;
        }
      }

      const media = await this.extractMediaFromLastResponse();
      if (this.sessionLog) {
        await this.sessionLog.logAssistant(reply, {
          tool,
          media,
          url: this.page.url(),
        });
      }
      return {
        ok: true,
        tool,
        prompt,
        reply,
        url: this.page.url(),
        media,
        session: this.sessionLog?.paths || null,
      };
    } catch (err) {
      // 视频：protocolTimeout 时仍尝试抽取已有 video 节点
      if (tool === 'video') {
        try {
          const media = await this.extractMediaFromLastResponse();
          const text = await this.getLastResponse();
          if (media.videos?.length || /准备就绪|ready/i.test(text || '')) {
            if (this.sessionLog) {
              await this.sessionLog.logAssistant(text || '[video recovered]', {
                tool,
                media,
                recovered: true,
              });
            }
            return {
              ok: true,
              tool,
              prompt,
              reply: text || '[video recovered after timeout]',
              url: this.page.url(),
              media,
              session: this.sessionLog?.paths || null,
              recovered: true,
            };
          }
        } catch {
          // fall through
        }
      }
      if (this.sessionLog) {
        await this.sessionLog.logError(
          err instanceof Error ? err.message : String(err),
          { tool },
        );
      }
      throw err;
    }
  }

  /**
   * 从最后一条回复抽取图片/视频/音频 URL
   */
  async extractMediaFromLastResponse() {
    return this.page.evaluate(() => {
      const models = [...document.querySelectorAll('model-response')];
      const last = models[models.length - 1] || document.body;
      if (!last) return { images: [], videos: [], audio: [], iframes: [] };

      const uniq = (arr) => [...new Set(arr.filter(Boolean))];

      const images = uniq(
        [...last.querySelectorAll('img')]
          .map((img) => img.currentSrc || img.src)
          .filter(
            (s) =>
              s &&
              !s.startsWith('data:image/svg') &&
              !/icon|avatar|logo|sprite/i.test(s) &&
              s.length > 30,
          ),
      );

      const videos = uniq(
        [...last.querySelectorAll('video')].flatMap((v) => [
          v.currentSrc,
          v.src,
          ...[...v.querySelectorAll('source')].map((s) => s.src),
        ]),
      );

      const audio = uniq(
        [...last.querySelectorAll('audio')].flatMap((a) => [
          a.currentSrc,
          a.src,
          ...[...a.querySelectorAll('source')].map((s) => s.src),
        ]),
      );

      // 部分生成结果用 background-image
      const bgImages = uniq(
        [...last.querySelectorAll('[style*="background"]')]
          .map((el) => {
            const m = (el.getAttribute('style') || '').match(
              /url\(["']?(https?:\/\/[^"')]+)/,
            );
            return m?.[1];
          })
          .filter(Boolean),
      );

      const iframes = uniq(
        [...last.querySelectorAll('iframe')].map((f) => f.src).filter(Boolean),
      );

      return {
        images: uniq([...images, ...bgImages]),
        videos,
        audio,
        iframes,
      };
    });
  }

  /**
   * 侧边栏导航
   * @param {'app'|'videos'|'library'|'search'} dest
   */
  async goNav(dest) {
    const map = {
      app: 'https://gemini.google.com/app',
      videos: 'https://gemini.google.com/videos',
      library: 'https://gemini.google.com/library',
      search: 'https://gemini.google.com/search',
    };
    const url = map[dest] || dest;
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await sleep(1500);
    return { ok: true, url: this.page.url() };
  }

  /**
   * 探索当前账号可见能力（模式 + 工具 + 导航）
   * 不发送消息，只读 UI
   */
  async explore() {
    await this.open({ waitReady: true });
    const currentMode = await this.getCurrentMode();
    let modes = [];
    try {
      modes = await this.listModes();
    } catch {
      modes = [];
    }
    let tools = { paneText: '', items: [] };
    try {
      tools = await this.listTools();
    } catch {
      // ignore
    }

    const chrome = await this.page.evaluate(() => {
      const links = [...document.querySelectorAll('a')]
        .map((a) => ({
          text: (a.getAttribute('aria-label') || a.innerText || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40),
          href: a.href || '',
        }))
        .filter((x) =>
          /视频|库|搜索|笔记本|Video|Library|Search|Gems/i.test(x.text) ||
          /\/videos|\/library|\/search|notebook/i.test(x.href),
        );
      const uniq = [];
      const seen = new Set();
      for (const l of links) {
        const k = l.text + l.href;
        if (seen.has(k) || !l.text) continue;
        seen.add(k);
        uniq.push(l);
      }
      const mic = [...document.querySelectorAll('button')].some(
        (b) => (b.getAttribute('aria-label') || '') === '麦克风' || /Microphone/i.test(b.getAttribute('aria-label') || ''),
      );
      const listen = [...document.querySelectorAll('button')].some((b) =>
        /听回答|Listen/i.test(b.getAttribute('aria-label') || ''),
      );
      return { nav: uniq.slice(0, 20), hasMic: mic, hasListenAnswer: listen };
    });

    // 根据菜单文案归类能力
    const blob = `${tools.paneText}\n${tools.items.map((i) => i.text || i.aria).join('\n')}`;
    const capabilities = {
      image: /制作图片|Create image/i.test(blob),
      video: /制作视频|Create video/i.test(blob),
      music: /制作音乐|Create music|Make music/i.test(blob),
      research: /Deep Research|深度研究|深入研究/i.test(blob),
      canvas: /Canvas/i.test(blob),
      upload: /上传文件|Upload file/i.test(blob),
      drive: /云端硬盘|Drive/i.test(blob),
      photos: /相册|Photos/i.test(blob),
      codeImport: /导入代码|Import code/i.test(blob),
      notebooks: /Notebooks|笔记本/i.test(blob),
      voiceInput: chrome.hasMic,
      ttsListen: chrome.hasListenAnswer,
    };

    return {
      ok: true,
      url: this.page.url(),
      currentMode,
      modes,
      tools: tools.items,
      toolsPaneText: tools.paneText,
      nav: chrome.nav,
      capabilities,
      aliases: {
        tools: Object.keys(GEMINI_TOOLS),
        modes: Object.keys(GEMINI_MODES),
      },
    };
  }
}

export default GeminiClient;
