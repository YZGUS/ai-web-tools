/**
 * 千问网页客户端（www.qianwen.com/chat）
 *
 * 能力：
 * - chat：普通对话
 * - research：研究模式（长任务）
 * - task / taskAssistant：任务助理（长任务）
 *
 * 长任务完成检测要点（实测）：
 * 1. 研究/任务会先流式输出「计划」正文，此时 stop 消失、markdown complete，
 *    但后台仍在跑（进度条「正在分析/撰写研究报告中…」）——切勿当作完成。
 * 2. 必须等到活跃进度文案「正在*」消失，且连续多轮稳定，才算完成。
 * 3. 计划正文中的「研究完成后我会发送消息」会常驻 DOM，不能当完成信号。
 * 4. 默认超时 research/task ≈ 15min；minWait 避免计划阶段误判。
 *
 * 参考：sea-queen-sim/providers/qianwen.mjs 的基础 chat 选择器。
 *
 * @module providers/qianwen/client/qianwen-client
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
  QIANWEN_URL,
  QIANWEN_ORIGIN,
  QIANWEN_URL_INCLUDES,
  EDITOR_SEL,
  SEND_BTN_SEL,
  STOP_BTN_RE,
  TERMINATE_TASK_RE,
  ANSWER_SEL,
  ANSWER_MD_SEL,
  MD_INCOMPLETE_SEL,
  QIANWEN_MODES,
  QIANWEN_MODE_IDS,
  RUNNING_PHRASE_RE,
  PLAN_HINT_RE,
} from '../selectors/ui.mjs';

export {
  QIANWEN_URL,
  QIANWEN_ORIGIN,
  EDITOR_SEL,
  QIANWEN_MODES,
  QIANWEN_MODE_IDS,
};

export class QianwenClient {
  static id = 'qianwen';
  static displayName = '千问';
  static url = QIANWEN_URL;
  static origin = QIANWEN_ORIGIN;
  static urlIncludes = QIANWEN_URL_INCLUDES;

  /**
   * @param {import('puppeteer-core').Page} page
   * @param {{ runtimeDir?: string, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   */
  constructor(page, opts = {}) {
    /** @type {import('puppeteer-core').Page} */
    this.page = page;
    this.runtimeDir = opts.runtimeDir || RUNTIME_ROOT;
    this.mediaDir = path.join(this.runtimeDir, 'media', 'qianwen');
    /** @type {SessionLog | null} */
    this.sessionLog = null;
    if (opts.sessionLog instanceof SessionLog) {
      this.sessionLog = opts.sessionLog;
    } else if (opts.sessionLog !== false) {
      this.sessionLog = new SessionLog({
        provider: 'qianwen',
        rootDir: path.join(this.runtimeDir, 'sessions'),
        sessionId: opts.sessionId,
        label: 'qianwen',
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
          urlIncludes: QIANWEN_URL_INCLUDES,
        })) || (await browser.newPage());
    } else {
      page = await browser.newPage();
    }
    await applyStealth(page);
    try {
      await page.setViewport({ width: 1440, height: 900 });
    } catch {
      // ignore
    }
    try {
      const ctx = browser.defaultBrowserContext();
      await ctx.overridePermissions(QIANWEN_ORIGIN, [
        'clipboard-read',
        'clipboard-write',
      ]);
    } catch {
      // ignore
    }
    return new QianwenClient(page, opts);
  }

  async fail(code, message, cause) {
    let shot = null;
    try {
      await fs.mkdir(this.mediaDir, { recursive: true });
      shot = path.join(
        this.mediaDir,
        `${code.toLowerCase()}-${Date.now()}.png`,
      );
      await this.page.screenshot({ path: shot, fullPage: false });
    } catch {
      // ignore
    }
    throw new AiWebError(message, {
      code,
      cause,
      screenshot: shot,
      provider: 'qianwen',
    });
  }

  /** 关闭下载引导等弹层 */
  async dismissModals() {
    await this.page.evaluate(() => {
      const close = [...document.querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') || '') === '关闭',
      );
      close?.click();
    });
    await sleep(200);
  }

  /**
   * @param {{ waitReady?: boolean, timeout?: number, newChat?: boolean }} [opts]
   */
  async open(opts = {}) {
    const waitReady = opts.waitReady !== false;
    const timeout = opts.timeout ?? 120_000;
    await this.page.goto(QIANWEN_URL, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    await sleep(2500);
    await this.dismissModals();
    if (opts.newChat) await this.newChat();
    if (waitReady) await this.waitReady({ timeout: 60_000 });
    return { ok: true, url: this.page.url() };
  }

  async newChat() {
    await this.dismissModals();
    const ok = await this.page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (el) => (el.innerText || '').trim() === '新建对话',
      );
      if (!b) return false;
      b.click();
      return true;
    });
    await sleep(2200);
    await this.dismissModals();
    await this.waitReady({ timeout: 30_000 }).catch(() => {});
    return { ok };
  }

  async waitReady(opts = {}) {
    const timeout = opts.timeout ?? 60_000;
    await this.page.waitForFunction(
      (sel) => {
        const eds = [...document.querySelectorAll(sel)];
        return eds.some((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 40 && r.height > 16;
        });
      },
      { timeout },
      EDITOR_SEL,
    );
    await sleep(300);
    return true;
  }

  async healthCheck() {
    try {
      await this.open({ waitReady: true, timeout: 40_000 });
      return { ok: true, url: this.page.url() };
    } catch {
      return { ok: false };
    }
  }

  /**
   * @param {'chat'|'think'|'research'|'task'|string} mode
   */
  resolveMode(mode = 'chat') {
    const key = String(mode || 'chat').toLowerCase();
    if (key === 'task' || key === 'task_assistant' || key === 'assistant') {
      return QIANWEN_MODES.task;
    }
    if (key === 'research' || key === 'deep_research' || key === 'study') {
      return QIANWEN_MODES.research;
    }
    if (key === 'think' || key === 'thinking' || key === 'reason') {
      return QIANWEN_MODES.think;
    }
    if (key === 'chat' || key === 'default' || key === 'normal') {
      return QIANWEN_MODES.chat;
    }
    return QIANWEN_MODES[key] || null;
  }

  /**
   * 读取工具条胶囊 pressed 状态
   */
  async getModeStates() {
    return this.page.evaluate(() => {
      const names = ['任务助理', '思考', '研究'];
      /** @type {Record<string, string|null>} */
      const out = {};
      for (const n of names) {
        const btns = [...document.querySelectorAll('button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            (b.getAttribute('aria-label') || '').trim() === n
          );
        });
        btns.sort(
          (a, b) =>
            a.getBoundingClientRect().x - b.getBoundingClientRect().x,
        );
        out[n] = btns[0]?.getAttribute('aria-pressed') ?? null;
      }
      return out;
    });
  }

  /**
   * 切换模式胶囊（互斥时由页面自行处理）
   * @param {'chat'|'think'|'research'|'task'} mode
   * @param {{ exclusive?: boolean }} [opts]
   */
  async setMode(mode = 'chat', opts = {}) {
    const cfg = this.resolveMode(mode);
    if (!cfg) await this.fail('INVALID_MODE', `未知 mode: ${mode}`);

    // chat：关闭所有已知长任务模式
    if (cfg.id === 'chat') {
      for (const label of ['研究', '任务助理', '思考']) {
        await this.setCapsule(label, false);
      }
      return { ok: true, mode: 'chat', states: await this.getModeStates() };
    }

    if (opts.exclusive !== false) {
      for (const label of ['研究', '任务助理', '思考']) {
        if (label !== cfg.label) await this.setCapsule(label, false);
      }
    }
    await this.setCapsule(cfg.label, true);
    await sleep(500);
    const states = await this.getModeStates();
    const pressed = states[cfg.label] === 'true';
    if (!pressed) {
      // 重试一次
      await this.setCapsule(cfg.label, true);
      await sleep(400);
    }
    return {
      ok: true,
      mode: cfg.id,
      label: cfg.label,
      states: await this.getModeStates(),
    };
  }

  /**
   * @param {string} label aria-label
   * @param {boolean} on
   */
  async setCapsule(label, on) {
    return this.page.evaluate(
      (label, on) => {
        const btns = [...document.querySelectorAll('button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            (b.getAttribute('aria-label') || '').trim() === label
          );
        });
        btns.sort(
          (a, b) =>
            a.getBoundingClientRect().x - b.getBoundingClientRect().x,
        );
        const btn = btns[0];
        if (!btn) return { ok: false, reason: 'not-found', label };
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        if (pressed !== on) btn.click();
        return {
          ok: true,
          label,
          before: pressed,
          after: btn.getAttribute('aria-pressed'),
        };
      },
      label,
      on,
    );
  }

  async countAnswers() {
    return this.page.evaluate((sel) => {
      return [...document.querySelectorAll(sel)]
        .map((el) => (el.innerText || '').trim())
        .filter(Boolean).length;
    }, ANSWER_SEL);
  }

  async getLastAnswer() {
    return this.page.evaluate((sel) => {
      const list = [...document.querySelectorAll(sel)]
        .map((el) => (el.innerText || '').trim())
        .filter(Boolean);
      return list.at(-1) || '';
    }, ANSWER_SEL);
  }

  /**
   * 长任务结果抽取：合并计划 + 完成通知 + 尽量打开报告卡片
   * 研究完成时常是「请查看研究报告」短通知，正文可能在卡片/侧栏。
   */
  async extractLongTaskResult(prevCount = 0) {
    // 尝试点开完成卡上的报告标题
    await this.page.evaluate(() => {
      const cards = [...document.querySelectorAll('button, a, div, span')].filter(
        (el) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0 || r.height > 80) return false;
          const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
          return (
            (/研究报告|深度研报|文本报告/.test(t) && t.length < 24) ||
            (/简要调研|调研报告/.test(t) &&
              t.length < 40 &&
              r.y > 200 &&
              r.x > 300)
          );
        },
      );
      // 优先「文本报告」
      const prefer =
        cards.find((el) => (el.innerText || '').trim() === '文本报告') ||
        cards.find((el) => /研究报告|深度研报/.test(el.innerText || '')) ||
        cards[0];
      prefer?.click();
    });
    await sleep(1200);

    return this.page.evaluate(
      (answerSel, prev) => {
        const answers = [...document.querySelectorAll(answerSel)]
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean);
        const newer = answers.slice(Math.max(0, prev));
        const pool = newer.length ? newer : answers;
        const isPlan = (t) =>
          /研究过程大约需要|我将按照以下步骤|研究完成后我会发送消息/.test(t);
        const isDoneNotice = (t) =>
          /我已经完成了|请查看研究报告|研究已完成|任务已完成/.test(t);

        // 最长正文优先（排除纯计划时可再放宽）
        const sorted = [...pool].sort((a, b) => b.length - a.length);
        let body =
          sorted.find((t) => !isPlan(t) && t.length > 120) ||
          sorted[0] ||
          '';

        const plan = pool.find(isPlan) || '';
        const notice = [...pool].reverse().find(isDoneNotice) || '';

        // 拼装：通知 + 计划/正文
        const parts = [];
        if (notice && notice !== body) parts.push(notice);
        if (body) parts.push(body);
        if (plan && plan !== body && !body.includes(plan.slice(0, 40))) {
          parts.push('---\n[调研计划]\n' + plan);
        }
        let reply = parts.join('\n\n').trim() || body || notice || '';

        // 补充页面上「基于 N 篇搜索来源」
        const bodyText = document.body?.innerText || '';
        const sources = bodyText.match(/基于\d+篇搜索来源[^\n]*/)?.[0];
        if (sources && !reply.includes(sources)) {
          reply = reply + '\n\n' + sources;
        }

        return {
          reply,
          answerCount: answers.length,
          pieces: {
            notice: notice.slice(0, 200),
            bodyLen: body.length,
            planLen: plan.length,
          },
        };
      },
      ANSWER_SEL,
      prevCount,
    );
  }

  /**
   * 采集运行态（普通 + 长任务）
   * 长任务关键：plan 完成后仍可能有「正在*」进度
   */
  async getRunState() {
    return this.page.evaluate(
      ({
        answerSel,
        mdIncompleteSel,
        stopReSource,
        termReSource,
        runningReSource,
        planReSource,
      }) => {
        const stopRe = new RegExp(stopReSource, 'i');
        const termRe = new RegExp(termReSource);
        const runningRe = new RegExp(runningReSource);
        const planRe = new RegExp(planReSource);

        const buttons = [...document.querySelectorAll('button')].filter(
          (b) => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          },
        );
        const hasStop = buttons.some((b) =>
          stopRe.test(
            `${b.getAttribute('aria-label') || ''}${b.innerText || ''}`,
          ),
        );
        const hasTerminate = buttons.some((b) =>
          termRe.test(
            `${b.getAttribute('aria-label') || ''}${b.innerText || ''}`,
          ),
        );
        // 终止任务有时是非 button
        const hasTerminateAny = hasTerminate ||
          [...document.querySelectorAll('[role="button"], div, span')].some(
            (el) => {
              const r = el.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0 || r.height > 48) return false;
              const t = (el.innerText || el.getAttribute('aria-label') || '')
                .replace(/\s+/g, '')
                .trim();
              return t === '终止任务' || t === '停止任务';
            },
          );

        const incompleteMd = !!document.querySelector(mdIncompleteSel);
        const busy = !!document.querySelector('[aria-busy="true"]');

        // 仅看可见的进度/步骤节点，避免历史正文误触发
        const progressNodes = [
          ...document.querySelectorAll(
            '[class*="progress"],[class*="status"],[class*="step"],[class*="research"],[class*="task"],[class*="plan"], li, p, span, div',
          ),
        ].filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 40 &&
            r.height > 8 &&
            r.height < 160 &&
            r.bottom > 0 &&
            r.top < (window.innerHeight || 900)
          );
        });

        const runningSnippets = [];
        for (const el of progressNodes) {
          const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
          if (!t || t.length > 120) continue;
          if (runningRe.test(t)) runningSnippets.push(t.slice(0, 80));
          if (runningSnippets.length >= 6) break;
        }

        // 侧栏/卡片：研究过程 (n/m)
        const body = document.body?.innerText || '';
        const fracs = body.match(/\((\d+)\s*\/\s*(\d+)\)/g) || [];
        let progressIncomplete = false;
        for (const f of fracs.slice(0, 12)) {
          const m = f.match(/\((\d+)\s*\/\s*(\d+)\)/);
          if (m && Number(m[1]) < Number(m[2])) progressIncomplete = true;
        }

        const answers = [...document.querySelectorAll(answerSel)]
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean);
        const last = answers.at(-1) || '';
        const planInLast = planRe.test(last);
        // 最终报告通常比计划更长，且不再以「我将按照以下步骤」为主体
        const looksLikePlanOnly =
          planInLast &&
          last.length < 800 &&
          /我将(研究|按照以下步骤)|研究过程大约需要/.test(last);

        const send = document.querySelector(
          'button[aria-label="发送消息"]',
        );
        const sendEnabled = !!(send && !send.disabled);

        const running =
          hasStop ||
          hasTerminateAny ||
          incompleteMd ||
          busy ||
          runningSnippets.length > 0;

        return {
          running,
          hasStop,
          hasTerminate: hasTerminateAny,
          incompleteMd,
          busy,
          runningSnippets: [...new Set(runningSnippets)].slice(0, 6),
          progressIncomplete,
          progressFracs: fracs.slice(0, 8),
          answerCount: answers.length,
          lastLen: last.length,
          lastHead: last.slice(0, 160),
          planInLast,
          looksLikePlanOnly,
          sendEnabled,
          researchPanel: /研究过程/.test(body),
          url: location.href,
        };
      },
      {
        answerSel: ANSWER_SEL,
        mdIncompleteSel: MD_INCOMPLETE_SEL,
        stopReSource: STOP_BTN_RE.source,
        termReSource: TERMINATE_TASK_RE.source,
        runningReSource: RUNNING_PHRASE_RE.source,
        planReSource: PLAN_HINT_RE.source,
      },
    );
  }

  /**
   * 普通对话完成：新答案 + 不在生成
   * @param {number} prevCount
   * @param {{ timeout?: number, minWaitMs?: number, pollMs?: number }} [opts]
   */
  async waitForResponse(prevCount, opts = {}) {
    const timeout = opts.timeout ?? 180_000;
    const minWaitMs = opts.minWaitMs ?? 2_000;
    const pollMs = opts.pollMs ?? 1_500;
    const start = Date.now();
    let lastLen = -1;
    let stable = 0;

    while (Date.now() - start < timeout) {
      const elapsed = Date.now() - start;
      const st = await this.getRunState();
      if (this.sessionLog && elapsed % 10_000 < pollMs + 200) {
        await this.sessionLog.logWaiting({
          kind: 'chat',
          elapsedMs: elapsed,
          ...st,
        });
      }

      if (
        elapsed >= minWaitMs &&
        st.answerCount > prevCount &&
        !st.running &&
        st.lastLen > 0
      ) {
        if (st.lastLen === lastLen) stable += 1;
        else {
          lastLen = st.lastLen;
          stable = 0;
        }
        if (stable >= 1) {
          await sleep(800);
          return {
            ok: true,
            reply: await this.getLastAnswer(),
            elapsedMs: Date.now() - start,
            state: st,
          };
        }
      } else {
        lastLen = st.lastLen;
        stable = 0;
      }
      await sleep(pollMs);
    }
    await this.fail(
      'REPLY_TIMEOUT',
      `等待千问回复超时（${timeout / 1000}s）`,
    );
  }

  /**
   * 长任务完成检测（研究 / 任务助理）
   *
   * 阶段：
   * A. 流式计划（hasStop / incompleteMd）
   * B. 后台执行（正在* / 终止任务 / 研究过程）—— 计划正文已 complete，极易误判
   * C. 完成：不再 running，且连续 stablePolls 轮稳定；尽量等最终报告（非 plan-only）
   *
   * @param {number} prevCount
   * @param {{
   *   timeout?: number,
   *   minWaitMs?: number,
   *   pollMs?: number,
   *   stablePolls?: number,
   *   requireFinalReport?: boolean,
   *   mode?: string,
   * }} [opts]
   */
  async waitForLongTask(prevCount, opts = {}) {
    const timeout = opts.timeout ?? 900_000;
    const minWaitMs = opts.minWaitMs ?? 45_000;
    const pollMs = opts.pollMs ?? 3_000;
    const stablePolls = opts.stablePolls ?? 5;
    const requireFinalReport = opts.requireFinalReport !== false;
    const start = Date.now();
    let sawRunning = false;
    let stable = 0;
    let lastFingerprint = '';

    while (Date.now() - start < timeout) {
      const elapsed = Date.now() - start;
      const st = await this.getRunState();
      if (st.running || st.progressIncomplete) sawRunning = true;

      const fingerprint = [
        st.answerCount,
        st.lastLen,
        st.running ? 1 : 0,
        st.runningSnippets.join('|'),
        st.hasTerminate ? 1 : 0,
      ].join(':');

      if (this.sessionLog && elapsed % 15_000 < pollMs + 200) {
        await this.sessionLog.logWaiting({
          kind: 'long-task',
          mode: opts.mode,
          elapsedMs: elapsed,
          sawRunning,
          stable,
          ...st,
        });
      }

      const pastMin = elapsed >= minWaitMs;
      const hasNew = st.answerCount > prevCount || st.lastLen > 40;
      // 完成：不再运行，且已见过运行态（或超过 minWait 且有实质输出）
      const idle =
        !st.running &&
        !st.progressIncomplete &&
        pastMin &&
        hasNew &&
        (sawRunning || elapsed >= minWaitMs + 30_000);

      // 研究：尽量等到不是「仅计划」正文（最终报告通常更长或不再是步骤预告）
      const contentOk =
        !requireFinalReport ||
        !st.looksLikePlanOnly ||
        // 若长时间仍只有计划，但进度已空闲足够久，也接受（短调研可能不再追加）
        (idle && stable >= stablePolls && elapsed >= minWaitMs + 60_000);

      if (idle && contentOk) {
        if (fingerprint === lastFingerprint) stable += 1;
        else {
          lastFingerprint = fingerprint;
          stable = 1;
        }
        if (stable >= stablePolls) {
          await sleep(1500);
          const extracted = await this.extractLongTaskResult(prevCount);
          return {
            ok: true,
            reply: extracted.reply || (await this.getLastAnswer()),
            elapsedMs: Date.now() - start,
            state: await this.getRunState(),
            sawRunning,
            pieces: extracted.pieces,
          };
        }
      } else {
        lastFingerprint = fingerprint;
        stable = 0;
      }
      await sleep(pollMs);
    }

    await this.fail(
      'LONG_TASK_TIMEOUT',
      `等待千问长任务超时（${timeout / 1000}s，mode=${opts.mode || 'long'}）。` +
        `研究/任务助理常需数分钟；请确认页面未停在「正在*」进度。`,
    );
  }

  async typePrompt(text) {
    await this.waitReady({ timeout: 30_000 });
    const focused = await this.page.evaluate((sel) => {
      const eds = [...document.querySelectorAll(sel)];
      const ed = eds.find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 40 && r.height > 16;
      });
      if (!ed) return false;
      ed.focus();
      ed.click();
      return true;
    }, EDITOR_SEL);
    if (!focused) await this.fail('NO_EDITOR', '未找到千问输入框');

    await sleep(120);
    await this.page.keyboard.down('Meta');
    await this.page.keyboard.press('KeyA');
    await this.page.keyboard.up('Meta');
    await this.page.keyboard.press('Backspace');
    await sleep(80);

    const cdp = await this.page.createCDPSession();
    try {
      await cdp.send('Input.insertText', { text });
    } finally {
      await cdp.detach().catch(() => {});
    }
    await sleep(300);
  }

  async clickSend() {
    try {
      await this.page.waitForFunction(
        (sel) => {
          const b = document.querySelector(sel);
          return b && !b.disabled;
        },
        { timeout: 30_000 },
        SEND_BTN_SEL,
      );
    } catch {
      await this.fail(
        'SEND_DISABLED',
        '发送按钮不可用（可能未登录或输入为空）',
      );
    }
    const ok = await this.page.evaluate((sel) => {
      const b = document.querySelector(sel);
      if (!b || b.disabled) return false;
      b.click();
      return true;
    }, SEND_BTN_SEL);
    if (!ok) await this.fail('SEND_FAILED', '点击发送失败');
    await sleep(1200);
  }

  /**
   * 通用发送：可选 mode
   * @param {string} prompt
   * @param {{
   *   mode?: 'chat'|'think'|'research'|'task',
   *   newChat?: boolean,
   *   open?: boolean,
   *   timeout?: number,
   *   minWaitMs?: number,
   *   requireFinalReport?: boolean,
   * }} [opts]
   */
  async chat(prompt, opts = {}) {
    if (!prompt || typeof prompt !== 'string') {
      await this.fail('BAD_ARGS', 'chat 需要 prompt');
    }
    const modeCfg = this.resolveMode(opts.mode || 'chat');
    if (!modeCfg) await this.fail('INVALID_MODE', `未知 mode: ${opts.mode}`);

    await this.ensureSession();
    if (opts.open !== false) {
      await this.open({
        waitReady: true,
        newChat: opts.newChat !== false,
      });
    } else if (opts.newChat) {
      await this.newChat();
    } else {
      await this.waitReady({ timeout: 30_000 });
    }

    if (this.sessionLog) {
      await this.sessionLog.logUser(prompt, {
        mode: modeCfg.id,
        url: this.page.url(),
      });
      await this.sessionLog.setStatus(
        'waiting',
        modeCfg.longRunning ? `long-task ${modeCfg.id}` : 'chat',
      );
    }

    try {
      await this.setMode(modeCfg.id);
      const prev = await this.countAnswers();
      await this.typePrompt(prompt);
      await this.clickSend();

      const timeout =
        opts.timeout ?? modeCfg.defaultTimeoutMs ?? 180_000;
      const minWaitMs = opts.minWaitMs ?? modeCfg.minWaitMs ?? 2_000;

      let result;
      if (modeCfg.longRunning) {
        result = await this.waitForLongTask(prev, {
          timeout,
          minWaitMs,
          stablePolls: modeCfg.stablePolls ?? 5,
          requireFinalReport: opts.requireFinalReport,
          mode: modeCfg.id,
        });
      } else {
        result = await this.waitForResponse(prev, {
          timeout,
          minWaitMs,
        });
      }

      if (this.sessionLog) {
        await this.sessionLog.logAssistant(result.reply, {
          mode: modeCfg.id,
          elapsedMs: result.elapsedMs,
          url: this.page.url(),
        });
      }

      return {
        ok: true,
        prompt,
        mode: modeCfg.id,
        modeLabel: modeCfg.label,
        longRunning: !!modeCfg.longRunning,
        reply: result.reply,
        elapsedMs: result.elapsedMs,
        pageUrl: this.page.url(),
        state: result.state || null,
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

  /** 研究模式 */
  async research(prompt, opts = {}) {
    return this.chat(prompt, { ...opts, mode: 'research' });
  }

  /** 任务助理 */
  async taskAssistant(prompt, opts = {}) {
    return this.chat(prompt, { ...opts, mode: 'task' });
  }

  /** alias */
  async task(prompt, opts = {}) {
    return this.taskAssistant(prompt, opts);
  }

  async explore() {
    await this.open({ waitReady: true, newChat: true });
    const states = await this.getModeStates();
    const ui = await this.page.evaluate(() => {
      const capsules = ['任务助理', '思考', '研究', '千问高考', 'PPT创作']
        .map((n) => {
          const b = [...document.querySelectorAll('button')].find(
            (el) =>
              el.getBoundingClientRect().width > 0 &&
              (el.getAttribute('aria-label') || '') === n,
          );
          return b
            ? {
                name: n,
                pressed: b.getAttribute('aria-pressed'),
              }
            : { name: n, pressed: null, missing: true };
        });
      return {
        url: location.href,
        hasEditor: !!document.querySelector(
          '[contenteditable="true"], textarea',
        ),
        hasSend: !!document.querySelector('button[aria-label="发送消息"]'),
        capsules,
      };
    });
    return {
      ok: true,
      provider: 'qianwen',
      ...ui,
      modeStates: states,
      modes: QIANWEN_MODE_IDS.map((id) => ({
        id,
        ...QIANWEN_MODES[id],
      })),
      capabilities: {
        chat: true,
        think: true,
        research: true,
        taskAssistant: true,
        longRunningModes: ['research', 'task'],
      },
      notes: [
        '研究/任务助理为长任务：先出计划再后台执行，完成检测依赖「正在*」进度消失与多轮稳定',
        '勿用计划正文中的「研究完成后我会发送消息」作为完成信号',
      ],
    };
  }

  async screenshot(opts = {}) {
    await fs.mkdir(this.mediaDir, { recursive: true });
    const file =
      opts.path || path.join(this.mediaDir, `shot-${Date.now()}.png`);
    await this.page.screenshot({ path: file, fullPage: !!opts.fullPage });
    return file;
  }
}

export default QianwenClient;
