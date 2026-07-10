/**
 * Chrome CDP 连接层
 *
 * 通过 puppeteer.connect 附着到**已开启远程调试**的本机 Chrome，
 * 不启动/不关闭浏览器进程，便于复用登录态。
 *
 * 前置：`scripts/chrome-start.sh` 或手动
 *   --remote-debugging-port=9222 --user-data-dir=独立目录
 */
import puppeteer from 'puppeteer-core';
import { DEFAULT_CDP_URL } from '../config/defaults.mjs';
import { AiWebError } from '../types/errors.mjs';

/**
 * 探测 CDP 端点是否可用
 * @param {string} [cdpUrl] - 默认 DEFAULT_CDP_URL
 * @returns {Promise<{ ok: boolean, browser?: string, webSocketDebuggerUrl?: string, error?: string }>}
 */
export async function probeCdp(cdpUrl = DEFAULT_CDP_URL) {
  const base = cdpUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/json/version`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const info = await res.json();
    return {
      ok: true,
      browser: info.Browser,
      webSocketDebuggerUrl: info.webSocketDebuggerUrl,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 连接到本地调试 Chrome
 * @param {{ cdpUrl?: string, defaultViewport?: { width: number, height: number } | null }} [opts]
 * @returns {Promise<import('puppeteer-core').Browser>}
 */
export async function connectBrowser(opts = {}) {
  const cdpUrl = opts.cdpUrl || DEFAULT_CDP_URL;
  const probe = await probeCdp(cdpUrl);
  if (!probe.ok) {
    throw new AiWebError(
      `无法连接 Chrome CDP (${cdpUrl}): ${probe.error}。请先 npm run chrome:start`,
      { code: 'CDP_UNAVAILABLE' },
    );
  }
  // defaultViewport: null 保留真实窗口尺寸，避免 AI 网页布局被缩放
  // protocolTimeout：视频等长任务 evaluate 可能超过默认 180s
  return puppeteer.connect({
    browserURL: cdpUrl.replace(/\/$/, ''),
    defaultViewport:
      opts.defaultViewport === undefined ? null : opts.defaultViewport,
    protocolTimeout: opts.protocolTimeout ?? 600_000,
  });
}

/**
 * 获取或新建 Page
 * @param {import('puppeteer-core').Browser} browser
 * @param {{ reuse?: boolean, urlIncludes?: string }} [opts]
 *   - reuse + urlIncludes：匹配已有标签，无匹配返回 null
 *   - reuse 无 urlIncludes：返回最后一个标签或 null
 *   - 默认：browser.newPage()
 * @returns {Promise<import('puppeteer-core').Page | null>}
 */
export async function getPage(browser, opts = {}) {
  if (opts.reuse) {
    const pages = await browser.pages();
    if (opts.urlIncludes) {
      const hit = pages.find((p) => p.url().includes(opts.urlIncludes));
      return hit || null;
    }
    if (pages.length > 0) return pages[pages.length - 1];
    return null;
  }
  return browser.newPage();
}

/**
 * 复用匹配 URL 的标签，否则新建
 * @param {import('puppeteer-core').Browser} browser
 * @param {string} urlIncludes - URL 子串，如 'gemini.google.com'
 * @returns {Promise<import('puppeteer-core').Page>}
 */
export async function getOrCreatePage(browser, urlIncludes) {
  const existing = await getPage(browser, { reuse: true, urlIncludes });
  if (existing) return existing;
  return browser.newPage();
}

/**
 * 断开 puppeteer 连接（**不关闭**用户 Chrome 进程）
 * @param {import('puppeteer-core').Browser | null | undefined} browser
 */
export async function closeBrowser(browser) {
  if (!browser) return;
  try {
    browser.disconnect();
  } catch {
    // ignore
  }
}

/**
 * 降低自动化指纹（在 goto 前调用）
 * @param {import('puppeteer-core').Page} page
 */
export async function applyStealth(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}
