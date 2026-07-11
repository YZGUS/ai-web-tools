/**
 * 小云雀网页客户端（xyq.jianying.com）
 *
 * 范围（按产品约定收窄）：
 * - 生图模型：仅 Seedream 5.0 Pro / Lite
 * - 参考图：支持 @ 引用入口 + input[type=file] 多图上传
 * - 积分：读取 free_credits（每日约 68，当日清零）
 *
 * @module providers/xyq/client/xyq-client
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
  XYQ_URL,
  XYQ_ORIGIN,
  XYQ_URL_INCLUDES,
  DEFAULT_SEEDREAM_MODEL,
  SEEDREAM_MODELS,
  SEEDREAM_MODEL_IDS,
  EDITOR_SEL,
  FILE_INPUT_SEL,
  API,
} from '../selectors/ui.mjs';

export {
  XYQ_URL,
  XYQ_ORIGIN,
  DEFAULT_SEEDREAM_MODEL,
  SEEDREAM_MODELS,
  SEEDREAM_MODEL_IDS,
  EDITOR_SEL,
};

export class XyqClient {
  static id = 'xyq';
  static displayName = '小云雀';
  static url = XYQ_URL;
  static origin = XYQ_ORIGIN;
  static urlIncludes = XYQ_URL_INCLUDES;

  /**
   * @param {import('puppeteer-core').Page} page
   * @param {{ runtimeDir?: string, sessionLog?: boolean|SessionLog, sessionId?: string }} [opts]
   */
  constructor(page, opts = {}) {
    /** @type {import('puppeteer-core').Page} */
    this.page = page;
    this.runtimeDir = opts.runtimeDir || RUNTIME_ROOT;
    this.mediaDir = path.join(this.runtimeDir, 'media', 'xyq');
    /** @type {SessionLog | null} */
    this.sessionLog = null;
    if (opts.sessionLog instanceof SessionLog) {
      this.sessionLog = opts.sessionLog;
    } else if (opts.sessionLog !== false) {
      this.sessionLog = new SessionLog({
        provider: 'xyq',
        rootDir: path.join(this.runtimeDir, 'sessions'),
        sessionId: opts.sessionId,
        label: 'xyq-seedream',
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
          urlIncludes: XYQ_URL_INCLUDES,
        })) || (await browser.newPage());
    } else {
      page = await browser.newPage();
    }
    await applyStealth(page);
    try {
      const ctx = browser.defaultBrowserContext();
      await ctx.overridePermissions(XYQ_ORIGIN, [
        'clipboard-read',
        'clipboard-write',
      ]);
    } catch {
      // ignore
    }
    return new XyqClient(page, opts);
  }

  async fail(code, message, cause) {
    let shot = null;
    try {
      await fs.mkdir(this.mediaDir, { recursive: true });
      shot = path.join(this.mediaDir, `${code.toLowerCase()}-${Date.now()}.png`);
      await this.page.screenshot({ path: shot, fullPage: false });
    } catch {
      // ignore
    }
    throw new AiWebError(message, {
      code,
      cause,
      screenshot: shot,
      provider: 'xyq',
    });
  }

  /**
   * 打开首页并进入「生成图片」模式
   * @param {{ waitReady?: boolean, timeout?: number }} [opts]
   */
  async open(opts = {}) {
    const waitReady = opts.waitReady !== false;
    const timeout = opts.timeout ?? 120_000;
    await this.page.goto(XYQ_URL, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    await sleep(3000);
    await this.enterImageMode();
    if (waitReady) await this.waitReady({ timeout });
    return { ok: true, url: this.page.url(), mode: 'image' };
  }

  /** 点击「生成图片」快捷入口 */
  async enterImageMode() {
    const clicked = await this.page.evaluate(() => {
      const hit = [...document.querySelectorAll('button, div, a')].find((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const t = (el.innerText || el.getAttribute('aria-label') || '')
          .replace(/\s+/g, '');
        return t === '生成图片' || /^生成图片/.test(t);
      });
      if (!hit) return false;
      /** @type {HTMLElement} */ (hit).click();
      return true;
    });
    await sleep(1200);
    return { ok: clicked };
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
    await sleep(400);
    return true;
  }

  async healthCheck() {
    try {
      await this.open({ waitReady: true, timeout: 40_000 });
      const credit = await this.getCredits().catch(() => null);
      return { ok: true, credit };
    } catch {
      return { ok: false };
    }
  }

  // ─── 积分 ───────────────────────────────────────────────

  /**
   * 读取积分余额（页面内 fetch，带 cookie）
   * @returns {Promise<{ free: number, vip: number, gift: number, purchase: number, total: number }>}
   */
  async getCredits() {
    // 1) 优先 commerce API（需登录 cookie；部分会话需 msToken，失败则回退 UI）
    try {
      const data = await this.page.evaluate(async (apiPath) => {
        const res = await fetch(`${location.origin}${apiPath}`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }, API.userCredit);

      let payload = data?.response ?? data?.data ?? data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          // keep
        }
      }
      const c = payload?.credit || payload || {};
      if (c.free_credits != null || c.vip_credit != null) {
        const free = Number(c.free_credits ?? 0);
        const vip = Number(c.vip_credit ?? 0);
        const gift = Number(c.gift_credit ?? 0);
        const purchase = Number(c.purchase_credit ?? 0);
        return {
          free,
          vip,
          gift,
          purchase,
          total: free + vip + gift + purchase,
          source: 'api',
          raw: data,
        };
      }
    } catch {
      // fall through to UI
    }

    // 2) UI：顶栏「68 优惠开会员」旁数字
    const ui = await this.page.evaluate(() => {
      const nodes = [...document.querySelectorAll('button, span, div, a')].filter(
        (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < 120;
        },
      );
      for (const el of nodes) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(\d{1,5})\s*优惠开会员/) || t.match(/^(\d{1,5})$/);
        if (m && el.closest('button, a, div')) {
          // 单独的 68 数字按钮
          if (/^\d{1,5}$/.test(t)) return Number(t);
        }
      }
      // 全文「数字 + 优惠开会员」
      const body = document.body?.innerText || '';
      const m2 = body.match(/(\d{1,5})\s*\n?\s*优惠开会员/);
      if (m2) return Number(m2[1]);
      return null;
    });

    if (ui == null) {
      await this.fail('CREDITS_UNAVAILABLE', '无法读取积分（API/UI）');
    }
    return {
      free: ui,
      vip: 0,
      gift: 0,
      purchase: 0,
      total: ui,
      source: 'ui',
      raw: null,
    };
  }

  /**
   * 领取每日免费积分（若尚未领取）
   */
  async receiveDailyCredits() {
    const data = await this.page.evaluate(async (apiPath) => {
      const res = await fetch(`${location.origin}${apiPath}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }, API.creditReceive);

    let payload = data?.response ?? data?.data ?? data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // keep
      }
    }
    return {
      ok: data?.ret === '0' || data?.errmsg === 'success',
      receiveQuota: payload?.receive_quota,
      curTotal: payload?.cur_total_credits,
      isFirst: payload?.is_first_receive,
      raw: data,
    };
  }

  // ─── 模型（仅 Pro / Lite） ──────────────────────────────

  /**
   * @param {'pro'|'lite'|string} model
   */
  /**
   * 默认 lite：免费积分可走；Pro（seedream_5.0_pro）当前多需会员。
   * @param {'pro'|'lite'|string} [model]
   */
  resolveModel(model = DEFAULT_SEEDREAM_MODEL) {
    const key = String(model ?? DEFAULT_SEEDREAM_MODEL).toLowerCase();
    // pro 优先匹配，避免 "seedream_5.0_pro".includes('pro') 误伤前先处理 pro
    if (
      key === 'pro' ||
      key === 'seedream_5.0_pro' ||
      key === 'seedream_5_0_pro' ||
      /seedream.*pro/i.test(key)
    ) {
      return SEEDREAM_MODELS.pro;
    }
    if (
      key === 'lite' ||
      key === 'seedream_5.0' ||
      key === 'seedream_5.0_lite' ||
      key === 'seedream_5_0' ||
      key.includes('lite')
    ) {
      return SEEDREAM_MODELS.lite;
    }
    // 裸 "seedream" / 未知 → lite（流程验证默认）
    if (key === 'seedream' || key === 'seedream_5' || key === 'default') {
      return SEEDREAM_MODELS.lite;
    }
    return null;
  }

  /** 打开模型选择面板（优先点 composer 工具条上的 Seedream 按钮，避开顶栏广告） */
  async openModelPicker() {
    const ok = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      // 工具条：精确「Seedream 5.0 Pro/Lite」
      const hit =
        btns.find((b) =>
          /^Seedream\s*5\.0\s*(Pro|Lite)$/i.test(
            (b.innerText || '').replace(/\s+/g, ' ').trim(),
          ),
        ) ||
        btns.find((b) => {
          const t = (b.innerText || '').replace(/\s+/g, ' ').trim();
          return (
            /Seedream\s*5\.0/i.test(t) &&
            t.length < 40 &&
            !/全网|首发|限免|尝鲜/.test(t)
          );
        }) ||
        btns.find(
          (b) =>
            /模型/.test(b.innerText || '') &&
            (b.innerText || '').trim().length < 12,
        );
      if (!hit) return false;
      hit.click();
      return true;
    });
    if (!ok) await this.fail('MODEL_PICKER', '未找到模型选择按钮');
    await sleep(800);
    return { ok: true };
  }

  /**
   * 读取首页 composer 工具条当前模型 / 分辨率 / 单价文案
   * @returns {Promise<{ modelLabel: string|null, resolution: string|null, costText: string|null }>}
   */
  async readComposerSettings() {
    return this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const modelBtn = btns.find((b) =>
        /^Seedream\s*5\.0\s*(Pro|Lite)$/i.test(
          (b.innerText || '').replace(/\s+/g, ' ').trim(),
        ),
      );
      const resBtn = btns.find((b) =>
        /^(1K|2K|4K)$/i.test((b.innerText || '').trim()),
      );
      // 「0/张」「6/张」「11/张」
      const costEl = [...document.querySelectorAll('button, span, div')].find(
        (el) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height > 40) return false;
          return /^\d+\/张$/.test((el.innerText || '').trim());
        },
      );
      return {
        modelLabel: modelBtn
          ? (modelBtn.innerText || '').replace(/\s+/g, ' ').trim()
          : null,
        resolution: resBtn ? (resBtn.innerText || '').trim() : null,
        costText: costEl ? (costEl.innerText || '').trim() : null,
      };
    });
  }

  /**
   * 尽量切到 1K（非会员常见免费档：实测 1K≈0 积分/张，2K≈11 且易触发会员墙）
   */
  async setResolution1K() {
    const clicked = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      // 工具条上当前分辨率按钮（如 2K）
      const cur = btns.find((b) =>
        /^(1K|2K|4K)$/i.test((b.innerText || '').trim()),
      );
      if (cur && /^1K$/i.test((cur.innerText || '').trim())) {
        return { ok: true, already: true };
      }
      if (cur) cur.click();
      return { ok: !!cur, opened: !!cur };
    });
    if (!clicked.ok) return { ok: false, reason: 'no-res-btn' };
    if (clicked.already) return { ok: true, already: true };
    await sleep(500);
    // 下拉为 lv-dropdown，选项 role=menuitem，文本精确为 1K / 2K
    const picked = await this.page.evaluate(() => {
      const items = [
        ...document.querySelectorAll(
          '[role="menuitem"], .lv-dropdown-menu-item, [role="option"]',
        ),
      ];
      const hit = items.find((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        return t === '1K';
      });
      if (!hit) return false;
      hit.click();
      return true;
    });
    await sleep(400);
    // 校验工具条已变为 1K
    const confirmed = await this.page.evaluate(() => {
      const cur = [...document.querySelectorAll('button')].find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && /^(1K|2K|4K)$/i.test((b.innerText || '').trim());
      });
      return cur ? (cur.innerText || '').trim() : null;
    });
    await this.page.keyboard.press('Escape').catch(() => {});
    return { ok: !!picked && confirmed === '1K', confirmed };
  }

  /**
   * 切换到 Seedream 5.0 Pro 或 Lite（默认 lite，无会员时用 lite 验证流程）
   * @param {'pro'|'lite'} model
   */
  async setModel(model = DEFAULT_SEEDREAM_MODEL) {
    const cfg = this.resolveModel(model);
    if (!cfg) {
      await this.fail(
        'INVALID_MODEL',
        `仅支持 Seedream 5.0 Pro/Lite，收到: ${model}`,
      );
    }

    // 1) 工具条已显示目标模型名则跳过
    const already = await this.page.evaluate((label) => {
      const b = [...document.querySelectorAll('button')].find((el) => {
        const r = el.getBoundingClientRect();
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        return r.width > 0 && t === label;
      });
      return !!b;
    }, cfg.label);
    if (already) {
      return { ok: true, model: cfg.id, label: cfg.label, already: true };
    }

    // 2) 打开模型菜单再选
    await this.openModelPicker();
    await sleep(600);

    const clicked = await this.page.evaluate((label) => {
      // 优先菜单项（下拉/列表），避免点中顶栏广告或整块容器
      const prefer = [
        ...document.querySelectorAll(
          '[role="menuitem"], [role="option"], .lv-dropdown-menu-item, li',
        ),
      ];
      const rest = [
        ...document.querySelectorAll('button, div'),
      ];
      const candidates = [...prefer, ...rest].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || r.height > 120) return false;
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 80) return false;
        if (/全网|首发|限免|尝鲜|即将/.test(t)) return false;
        return true;
      });
      let hit = candidates.find((el) => {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        return t === label || t.startsWith(label + ' ');
      });
      if (!hit) {
        hit = candidates.find((el) => {
          const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
          return t.includes(label);
        });
      }
      // Lite 可能显示为「Seedream 5.0」无 Lite 后缀
      if (!hit && /Lite/i.test(label)) {
        hit = candidates.find((el) => {
          const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
          return (
            /^Seedream\s*5\.0$/i.test(t) ||
            (/Seedream\s*5\.0/i.test(t) &&
              /Lite|指令|推理/i.test(t) &&
              !/Pro/i.test(t))
          );
        });
      }
      if (!hit) return { ok: false };
      hit.click();
      return { ok: true, text: (hit.innerText || '').slice(0, 80) };
    }, cfg.label);

    if (!clicked.ok) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.fail(
        'MODEL_NOT_FOUND',
        `模型面板中未找到 ${cfg.label}`,
      );
    }
    await sleep(600);
    await this.page.keyboard.press('Escape').catch(() => {});
    return { ok: true, model: cfg.id, label: cfg.label, picked: clicked.text };
  }

  /**
   * 列出允许的模型（固定两档，附当前页面是否可见）
   */
  async listModels() {
    await this.openModelPicker().catch(() => {});
    await sleep(500);
    const visible = await this.page.evaluate(() => {
      const text = document.body?.innerText || '';
      return {
        pro: /Seedream\s*5\.0\s*Pro/i.test(text),
        lite: /Seedream\s*5\.0\s*Lite/i.test(text),
      };
    });
    await this.page.keyboard.press('Escape').catch(() => {});
    return {
      ok: true,
      allowed: SEEDREAM_MODEL_IDS.map((id) => {
        const m = SEEDREAM_MODELS[id];
        return {
          id: m.id,
          value: m.value,
          label: m.label,
          description: m.description,
          visible: !!visible[id],
        };
      }),
    };
  }

  // ─── @ 引用 / 参考图 ────────────────────────────────────

  /**
   * 打开「@引用角色与素材」面板
   */
  async openAtMention() {
    const ok = await this.page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [role="button"]')].filter(
        (b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        },
      );
      const hit =
        btns.find((b) => /@引用角色与素材/.test(b.innerText || b.getAttribute('aria-label') || '')) ||
        btns.find((b) => (b.innerText || '').trim() === '@') ||
        btns.find((b) => (b.getAttribute('aria-label') || '').includes('@'));
      if (!hit) return false;
      hit.click();
      return true;
    });
    await sleep(800);
    return { ok };
  }

  /**
   * 通过隐藏 file input 上传参考图（多图）
   * 对应页面：上传参考素材 / @ 引用后的本地文件
   *
   * @param {string[]} imagePaths
   */
  async attachReferenceImages(imagePaths) {
    if (!imagePaths?.length) return { ok: true, count: 0 };
    const abs = [];
    for (const p of imagePaths) {
      const a = path.resolve(p);
      try {
        await fs.access(a);
      } catch {
        await this.fail('REF_NOT_FOUND', `参考图不存在: ${a}`);
      }
      abs.push(a);
    }

    // 确保进入图片模式且有 file input
    await this.enterImageMode().catch(() => {});
    await this.waitReady({ timeout: 20_000 }).catch(() => {});

    // 尝试点「上传参考素材」以挂载 input
    await this.page.evaluate(() => {
      const hit = [...document.querySelectorAll('button')].find((b) => {
        const r = b.getBoundingClientRect();
        if (r.width <= 0) return false;
        return /上传参考|上传素材/.test(
          b.innerText || b.getAttribute('aria-label') || '',
        );
      });
      hit?.click();
    });
    await sleep(500);

    // 也点一次 @ 面板（部分流程把上传藏在 mention 里）
    await this.openAtMention().catch(() => {});

    let input = await this.page.$(FILE_INPUT_SEL);
    if (!input) {
      input = await this.page.$('input[type="file"][accept*="image"]');
    }
    if (!input) {
      // 任意 multiple file
      input = await this.page.$('input[type="file"][multiple]');
    }
    if (!input) {
      await this.fail('UPLOAD_INPUT_MISSING', '未找到参考图 file input');
    }

    await input.uploadFile(...abs);
    await sleep(Math.min(12_000, 2000 + abs.length * 1500));
    return { ok: true, count: abs.length, paths: abs };
  }

  /**
   * 在输入框插入文本（支持长中文）；可附带「@参考」说明
   * @param {string} text
   */
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
    if (!focused) await this.fail('NO_EDITOR', '未找到输入框');

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
  }

  /**
   * 点击「开始生成」按钮（composer 工具条右侧圆形）
   * 实测：aria-label="开始生成"；无内容时 disabled
   */
  async clickSend() {
    const SEND_ARIA = '开始生成';
    // 等按钮可点
    try {
      await this.page.waitForFunction(
        (label) => {
          const b = [...document.querySelectorAll('button')].find(
            (el) => el.getAttribute('aria-label') === label,
          );
          return b && !b.disabled && b.getBoundingClientRect().width > 0;
        },
        { timeout: 30_000 },
        SEND_ARIA,
      );
    } catch {
      await this.fail(
        'SEND_DISABLED',
        '「开始生成」按钮不可用（可能未写入提示词或额度不足）',
      );
    }

    const box = await this.page.evaluate((label) => {
      const b = [...document.querySelectorAll('button')].find(
        (el) => el.getAttribute('aria-label') === label,
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        disabled: b.disabled,
        aria: label,
      };
    }, SEND_ARIA);

    if (!box) await this.fail('SEND_MISSING', '未找到「开始生成」按钮');

    await this.page.mouse.move(box.x, box.y);
    await this.page.mouse.down();
    await sleep(50);
    await this.page.mouse.up();
    await sleep(2500);
  }

  /**
   * 等待生成结果
   *
   * 实测：点「开始生成」后 URL 会切到
   *   /home?tab_name=integrated-agent&thread_id=...&agent_name=pippit_nest_agent
   * 结果图在 agent 会话内，CDN 多为 p*-xiaoyunque.byteimg.com
   *
   * @param {{ timeout?: number, beforeUrls?: string[], minWaitMs?: number }} [opts]
   */
  async waitForImageResult(opts = {}) {
    const timeout = opts.timeout ?? 300_000;
    const minWaitMs = opts.minWaitMs ?? 5_000;
    const before = new Set(opts.beforeUrls || []);
    const start = Date.now();
    let sawThread = false;

    while (Date.now() - start < timeout) {
      const elapsed = Date.now() - start;
      const st = await this.page.evaluate((beforeList) => {
        const beforeSet = new Set(beforeList);
        const url = location.href;
        const onAgentThread =
          /thread_id=/.test(url) || /integrated-agent/.test(url);

        const isGoodSrc = (src) => {
          if (!src || !/^https?:\/\//i.test(src)) return false;
          if (/avatar|icon|logo|emoji|sprite|favicon|data:image/i.test(src)) {
            return false;
          }
          return true;
        };
        // 优先小云雀 CDN
        const score = (src, w) => {
          let s = w || 0;
          if (/xiaoyunque\.byteimg|byteimg\.com|tos-cn-i-men/i.test(src)) {
            s += 50_000;
          }
          if (/seedream|aigc|generate/i.test(src)) s += 10_000;
          return s;
        };

        const imgs = [...document.querySelectorAll('img')]
          .filter((i) => i.complete && i.naturalWidth >= 200)
          .map((i) => ({
            src: i.src,
            base: (i.src || '').split('?')[0],
            w: i.naturalWidth,
            h: i.naturalHeight,
            _s: score(i.src, i.naturalWidth),
          }))
          .filter((i) => isGoodSrc(i.src));

        const newImgs = imgs
          .filter((i) => i.base && !beforeSet.has(i.base))
          .sort((a, b) => b._s - a._s);

        const body = document.body?.innerText || '';
        const loading = /生成中|排队中|加载中|处理中|正在生成|思考中/i.test(
          body,
        );
        const membershipMsg =
          /哎呀[，,]?\s*本次任务使用了仅会员可用|仅会员可用功能|需开通会员使用/.test(
            body,
          ) ||
          (/仅会员可用|需开通会员/.test(body) &&
            /本次任务|购买会员/.test(body));

        // 工具调用失败卡：.toolCallGroup / .itemStatusError / 「生成图像」
        const errCards = [
          ...document.querySelectorAll(
            '[class*="itemStatusError"], [class*="toolCallGroup"] [class*="itemStatusError"], [class*="groupItem"][class*="Error"]',
          ),
        ];
        let toolError = null;
        for (const card of errCards) {
          const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
          if (!/生成图像|OutputPath|Model:/.test(text)) continue;
          const model =
            text.match(/Model:\s*([a-zA-Z0-9_./-]+)/i)?.[1] || null;
          const prompt =
            text.match(/Prompt:\s*(.+?)(?:，Output|，Model|$)/i)?.[1] || null;
          toolError = {
            kind: 'tool_call_error',
            model,
            prompt: prompt ? prompt.slice(0, 80) : null,
            text: text.slice(0, 240),
          };
          break;
        }
        // 无 error class 时，meta 行 + 邻近会员文案
        if (!toolError) {
          const metas = [
            ...document.querySelectorAll('[class*="itemMetaText"]'),
          ];
          for (const m of metas) {
            const t = (m.innerText || '').replace(/\s+/g, ' ').trim();
            if (!/Model:\s*seedream/i.test(t)) continue;
            const parent = m.closest(
              '[class*="toolCallGroup"], [class*="groupItem"], [class*="itemOutput"]',
            );
            const block = (parent?.innerText || t).replace(/\s+/g, ' ');
            if (
              /仅会员|需开通会员|itemStatusError|失败/.test(block) ||
              membershipMsg
            ) {
              toolError = {
                kind: 'tool_meta_membership',
                model: t.match(/Model:\s*([a-zA-Z0-9_./-]+)/i)?.[1] || null,
                text: t.slice(0, 240),
              };
              break;
            }
          }
        }

        const top = newImgs[0]
          ? { src: newImgs[0].src, w: newImgs[0].w, h: newImgs[0].h }
          : null;

        return {
          url,
          onAgentThread,
          newCount: newImgs.length,
          loading,
          membership: membershipMsg,
          toolError,
          top,
          cdnCount: newImgs.filter((i) =>
            /xiaoyunque\.byteimg|byteimg\.com/i.test(i.src),
          ).length,
        };
      }, [...before]);

      if (st.onAgentThread) sawThread = true;

      // 工具调用失败 / 会员墙：agent 已回复且无新图
      if (
        elapsed >= 6_000 &&
        !st.loading &&
        !st.top &&
        (st.onAgentThread || sawThread) &&
        (st.membership || st.toolError)
      ) {
        const modelHint = st.toolError?.model
          ? ` agent Model=${st.toolError.model}`
          : '';
        await this.fail(
          'MEMBERSHIP_REQUIRED',
          `生成图像工具失败/会员墙${modelHint}。无会员请用 UI 选 Seedream 5.0 Lite + 分辨率 1K（避免 2K/高清档）。` +
            (st.toolError?.text ? ` 详情: ${st.toolError.text.slice(0, 120)}` : ''),
        );
      }

      // 成功：已进入 agent 线程，且有新的大图（优先 CDN）
      const ready =
        elapsed >= minWaitMs &&
        st.top &&
        st.top.w >= 200 &&
        !st.loading &&
        (st.onAgentThread || st.cdnCount > 0 || sawThread);

      if (ready) {
        await sleep(2000);
        return {
          ok: true,
          image: st.top,
          elapsedMs: Date.now() - start,
          url: st.url,
        };
      }

      if (this.sessionLog && elapsed % 10_000 < 1600) {
        await this.sessionLog.logWaiting({
          elapsedMs: elapsed,
          onAgentThread: st.onAgentThread,
          newCount: st.newCount,
          loading: st.loading,
          url: st.url,
        });
      }
      await sleep(1500);
    }
    await this.fail(
      'IMAGE_TIMEOUT',
      `等待小云雀生图超时（${timeout / 1000}s）。若未进入 agent 会话，请检查「开始生成」是否点中。`,
    );
  }

  async collectImageSrcs() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((i) => i.src && i.naturalWidth >= 64 && /^https?:/i.test(i.src))
        .map((i) => i.src.split('?')[0]),
    );
  }

  /**
   * 下载结果图。byteimg CDN 常对页面内 fetch 做 CORS 拦截，故多层回退：
   * 1) 页面 fetch  2) Node fetch + cookie/referer  3) 已加载 img → canvas
   * 4) 对目标 img 元素截图
   */
  async downloadBuffer(src) {
    if (!src || !/^https?:\/\//i.test(src)) {
      await this.fail(
        'BAD_IMAGE_URL',
        `非法图片 URL: ${String(src).slice(0, 80)}`,
      );
    }

    const fromB64 = (base64, type, size) => ({
      buffer: Buffer.from(base64, 'base64'),
      mime: type || 'image/png',
      size: size || Buffer.from(base64, 'base64').length,
    });

    // 1) page fetch
    try {
      const r = await this.page.evaluate(async (u) => {
        const res = await fetch(u, {
          credentials: 'include',
          mode: 'cors',
          cache: 'force-cache',
        });
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
      if (r?.base64) return fromB64(r.base64, r.type, r.size);
    } catch {
      // continue
    }

    // 2) Node-side fetch with browser cookies + Referer
    try {
      const cookies = await this.page.cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const res = await fetch(src, {
        headers: {
          Cookie: cookieHeader,
          Referer: 'https://xyq.jianying.com/',
          'User-Agent':
            (await this.page.evaluate(() => navigator.userAgent)) || '',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        const buffer = Buffer.from(ab);
        const mime = res.headers.get('content-type') || 'image/png';
        return { buffer, mime, size: buffer.length };
      }
    } catch {
      // continue
    }

    // 3) canvas from already-displayed <img>
    try {
      const r = await this.page.evaluate((u) => {
        const base = (u || '').split('?')[0];
        const img = [...document.querySelectorAll('img')].find((i) => {
          const s = i.currentSrc || i.src || '';
          return (
            s === u ||
            s.split('?')[0] === base ||
            (base && s.includes(base.slice(-40)))
          );
        });
        if (!img || img.naturalWidth < 32) return null;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        return {
          base64,
          type: 'image/png',
          size: Math.floor((base64.length * 3) / 4),
          w: img.naturalWidth,
          h: img.naturalHeight,
        };
      }, src);
      if (r?.base64) return fromB64(r.base64, r.type, r.size);
    } catch {
      // continue
    }

    // 4) element screenshot
    try {
      const handle = await this.page.evaluateHandle((u) => {
        const base = (u || '').split('?')[0];
        return (
          [...document.querySelectorAll('img')].find((i) => {
            const s = i.currentSrc || i.src || '';
            return (
              s === u ||
              s.split('?')[0] === base ||
              (base && s.includes(base.slice(-40)))
            );
          }) || null
        );
      }, src);
      const el = handle.asElement();
      if (el) {
        const buffer = await el.screenshot({ type: 'png' });
        await handle.dispose().catch(() => {});
        return {
          buffer,
          mime: 'image/png',
          size: buffer.length,
        };
      }
      await handle.dispose().catch(() => {});
    } catch {
      // continue
    }

    await this.fail('DOWNLOAD_FAILED', `下载图片失败: ${String(src).slice(0, 120)}`);
  }

  static extFromMime(mime) {
    if (/png/i.test(mime || '')) return '.png';
    if (/webp/i.test(mime || '')) return '.webp';
    if (/jpe?g/i.test(mime || '')) return '.jpg';
    if (/gif/i.test(mime || '')) return '.gif';
    return '.png';
  }

  /**
   * Seedream 5.0 文生图 / 参考图生图
   *
   * @param {string} prompt
   * @param {{
   *   model?: 'pro'|'lite',
   *   refImages?: string[],
   *   timeout?: number,
   *   filename?: string,
   *   outputDir?: string,
   *   open?: boolean,
   * }} [opts]
   */
  async generateImage(prompt, opts = {}) {
    if (!prompt || typeof prompt !== 'string') {
      await this.fail('BAD_ARGS', 'generateImage 需要 prompt');
    }
    // 默认 lite：Pro 需会员；无会员先走 Lite 验证流程
    const model = this.resolveModel(opts.model || DEFAULT_SEEDREAM_MODEL);
    if (!model) {
      await this.fail(
        'INVALID_MODEL',
        `仅支持 pro|lite，收到: ${opts.model}`,
      );
    }

    await this.ensureSession();
    if (opts.open !== false) {
      await this.open({ waitReady: true });
    } else {
      await this.enterImageMode();
      await this.waitReady({ timeout: 30_000 });
    }

    if (this.sessionLog) {
      await this.sessionLog.logUser(prompt, {
        model: model.id,
        refImages: opts.refImages || [],
        url: this.page.url(),
      });
      await this.sessionLog.setStatus('waiting', `seedream ${model.id}`);
    }

    try {
      // 确保生成图片模式（首页 composer）
      await this.enterImageMode();
      await this.waitReady({ timeout: 30_000 });
      await this.setModel(model.id);
      await sleep(500);
      // 关闭可能残留的下拉，保证分辨率按钮可见
      await this.page.keyboard.press('Escape').catch(() => {});
      await sleep(200);
      // 非会员必须 1K：2K 会让 agent 工具调用走会员档（itemStatusError + 仅会员可用）
      if (opts.resolution !== '2K' && opts.resolution !== '4K') {
        let res = await this.setResolution1K().catch(() => ({ ok: false }));
        if (!res?.ok) {
          await this.enterImageMode().catch(() => {});
          await sleep(400);
          res = await this.setResolution1K().catch(() => ({ ok: false }));
        }
        if (!res?.ok && this.sessionLog) {
          await this.sessionLog.logWaiting({
            warn: 'setResolution1K failed',
            res,
          });
        }
      }
      // 发送前校验工具条：必须是 Lite + 1K（无会员路径）
      if (model.id === 'lite' && opts.resolution !== '2K') {
        const bar = await this.readComposerSettings().catch(() => null);
        if (this.sessionLog && bar) {
          await this.sessionLog.logWaiting({ composer: bar });
        }
        if (bar?.resolution && bar.resolution !== '1K') {
          await this.setResolution1K().catch(() => {});
        }
        if (bar?.modelLabel && /Pro/i.test(bar.modelLabel) && !/Lite/i.test(bar.modelLabel)) {
          await this.setModel('lite').catch(() => {});
          await this.setResolution1K().catch(() => {});
        }
      }
      await sleep(400);

      if (opts.refImages?.length) {
        await this.attachReferenceImages(opts.refImages);
        // 提示词中说明 @ 参考顺序（页面支持 @ 引用语义）
        const refHint =
          opts.refImages.length === 1
            ? '（使用 @ 引用的参考图）'
            : `（使用 @ 引用的 ${opts.refImages.length} 张参考图，按上传顺序）`;
        await this.typePrompt(`${prompt}\n${refHint}`);
      } else {
        await this.typePrompt(prompt);
      }

      // 确认 prompt 已写入
      const typed = await this.page.evaluate((sel) => {
        const ed = [...document.querySelectorAll(sel)].find(
          (e) => e.getBoundingClientRect().width > 40,
        );
        return (ed?.innerText || '').trim().slice(0, 20);
      }, EDITOR_SEL);
      if (!typed) await this.fail('PROMPT_EMPTY', '输入框为空，未写入提示词');

      const before = await this.collectImageSrcs();
      await this.clickSend();

      // 快速检测会员墙
      await sleep(2500);
      const paywall = await this.page.evaluate(() => {
        const t = document.body?.innerText || '';
        if (/仅会员可用|开通会员|购买会员/.test(t)) {
          return t.match(/.{0,40}(仅会员可用|开通会员|购买会员).{0,40}/)?.[0] || t.slice(0, 80);
        }
        return null;
      });
      if (paywall) {
        await this.fail(
          'MEMBERSHIP_REQUIRED',
          `小云雀会员墙: ${paywall}（可改用 model=lite 或 1K 分辨率）`,
        );
      }

      const result = await this.waitForImageResult({
        timeout: opts.timeout ?? 300_000,
        beforeUrls: before,
        minWaitMs: 5_000,
      });

      // 再次检测会员墙（生成卡片内）
      const paywall2 = await this.page.evaluate(() => {
        const t = document.body?.innerText || '';
        return /仅会员可用|购买会员/.test(t);
      });
      if (paywall2) {
        await this.fail(
          'MEMBERSHIP_REQUIRED',
          '生成结果为会员墙，未产出图片（Pro/高清可能仅会员）',
        );
      }

      const src = result.image?.src;
      if (!src) await this.fail('EXTRACT_FAILED', '未得到结果图片 URL');

      const { buffer, mime, size } = await this.downloadBuffer(src);
      const outDir = opts.outputDir || this.mediaDir;
      await fs.mkdir(outDir, { recursive: true });
      const ext = XyqClient.extFromMime(mime);
      const base =
        opts.filename ||
        `xyq-${model.id}-${new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .replace('T', '_')
          .slice(0, 19)}`;
      const imagePath = path.join(outDir, `${base}${ext}`);
      await fs.writeFile(imagePath, buffer);

      const media = {
        path: imagePath,
        kind: 'image',
        mime,
        width: result.image.w,
        height: result.image.h,
      };

      if (this.sessionLog) {
        await this.sessionLog.logAssistant(
          `[seedream ${model.id}] ${result.image.w}x${result.image.h}`,
          { media, url: this.page.url(), src: src.slice(0, 200) },
        );
      }

      const credit = await this.getCredits().catch(() => null);

      return {
        ok: true,
        prompt,
        model: model.id,
        modelLabel: model.label,
        modelValue: model.value,
        imagePath,
        width: result.image.w,
        height: result.image.h,
        mime,
        size,
        url: src,
        pageUrl: this.page.url(),
        refImages: opts.refImages || [],
        credit,
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
   * 多参考图：等同 generateImage + refImages
   * 页面侧通过上传 + 提示词中的 @ 语义说明顺序
   */
  async generateWithRefs(prompt, refImages, opts = {}) {
    return this.generateImage(prompt, { ...opts, refImages });
  }

  async explore() {
    await this.open({ waitReady: true });
    const credit = await this.getCredits().catch(() => null);
    const models = await this.listModels();
    const ui = await this.page.evaluate(() => {
      const hasAt = [...document.querySelectorAll('button')].some((b) =>
        /@引用|@/.test(b.innerText || b.getAttribute('aria-label') || ''),
      );
      const hasUpload = !!document.querySelector(
        'input[type="file"][accept*="image"]',
      );
      return {
        url: location.href,
        hasAtMention: hasAt,
        hasFileUpload: hasUpload,
        hasEditor: !!document.querySelector(
          '[contenteditable="true"], textarea',
        ),
      };
    });
    return {
      ok: true,
      provider: 'xyq',
      ...ui,
      credit,
      models: models.allowed,
      capabilities: {
        image: true,
        seedreamPro: true,
        seedreamLite: true,
        atMention: true,
        multiRefUpload: true,
        onlySeedream50: true,
      },
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

export default XyqClient;
