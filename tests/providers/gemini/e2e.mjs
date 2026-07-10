#!/usr/bin/env node
/**
 * Gemini 标准功能 E2E（对话 / 模式 / 工具点选 / 落盘 / 导航）
 *
 * 位置: tests/providers/gemini/e2e.mjs
 *
 *   npm run chrome:start
 *   node tests/providers/gemini/e2e.mjs
 *   node tests/providers/gemini/e2e.mjs --skip-mode --skip-tools
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectBrowser,
  closeBrowser,
  probeCdp,
  GeminiClient,
  AiWebError,
  RUNTIME_ROOT,
} from '../../../index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'runtime', 'media', 'gemini-tests');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

const flags = {
  skipMode: process.argv.includes('--skip-mode'),
  skipTools: process.argv.includes('--skip-tools'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @type {{ name: string, ok: boolean, ms: number, error?: string, detail?: unknown }[]} */
const steps = [];
const report = {
  suite: 'gemini-e2e',
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  flags,
  steps,
  ok: false,
};

function log(m) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
}

function summarize(d) {
  if (d == null || typeof d !== 'object') return d;
  const o = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === 'reply' && typeof v === 'string') o[k] = v.slice(0, 200);
    else if (k === 'history' && Array.isArray(v)) o[k] = `len=${v.length}`;
    else if (k === 'tools' && Array.isArray(v)) o[k] = `len=${v.length}`;
    else o[k] = v;
  }
  return o;
}

async function step(name, fn) {
  const t0 = Date.now();
  log(`▶ ${name}`);
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    steps.push({ name, ok: true, ms, detail: summarize(detail) });
    log(`✓ ${name} (${ms}ms)`);
    return detail;
  } catch (err) {
    const ms = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    steps.push({ name, ok: false, ms, error });
    log(`✗ ${name}: ${error}`);
    throw err;
  }
}

let browser;
try {
  await fs.mkdir(OUT, { recursive: true });

  await step('1.probeCdp', async () => {
    const p = await probeCdp();
    if (!p.ok) throw new AiWebError(`CDP: ${p.error}`, { code: 'CDP' });
    return p;
  });

  browser = await step('2.connect', () => connectBrowser());

  const gemini = await step('3.attach', () =>
    GeminiClient.attach(browser, {
      forceNewTab: true,
      runtimeDir: RUNTIME_ROOT,
    }),
  );

  await step('4.open', () => gemini.open({ timeout: 120_000 }));

  await step('5.healthCheck', async () => {
    const ok = await gemini.healthCheck();
    if (!ok) throw new AiWebError('healthCheck 失败');
    return { ok };
  });

  const exploration = await step('6.explore', () => gemini.explore());
  report.capabilities = exploration?.capabilities;
  report.modesFromExplore = exploration?.modes;

  if (!flags.skipMode) {
    await gemini.dismissOverlays();
    await sleep(500);
    try {
      await step('7.listModes', () => gemini.listModes());
      await step('8.setMode.flash-lite', () => gemini.setMode('flash-lite'));
      await step('9.setMode.pro', () => gemini.setMode('pro'));
    } catch {
      log('· 模式步骤 soft-skip（explore 已采集 modes）');
      steps.push({
        name: '7-9.modes.soft-skip',
        ok: true,
        ms: 0,
        detail: { modes: exploration?.modes },
      });
    }
  }

  if (!flags.skipTools) {
    try {
      await step('10.listTools', () => gemini.listTools());
      if (exploration?.capabilities?.image !== false) {
        await step('11.selectTool.image', async () => {
          const r = await gemini.selectTool('image');
          await gemini.dismissOverlays();
          return r;
        });
      }
    } catch (err) {
      log(`· 工具步骤 soft-skip: ${err.message}`);
      steps.push({
        name: '10-11.tools.soft-skip',
        ok: true,
        ms: 0,
        detail: { error: err.message },
      });
    }
  }

  const chat = await step('12.chat', () =>
    gemini.chat('E2E 完整测试：请只回复四个字「测试通过」', {
      newChat: true,
      timeout: 120_000,
    }),
  );
  report.chatReply = chat?.reply;
  report.session = chat?.session;

  await step('13.getLastResponse', () => gemini.getLastResponse());
  await step('14.getHistory', () => gemini.getHistory());
  await step('15.screenshot', () =>
    gemini.screenshotChat({
      path: path.join(OUT, `e2e-${RUN_ID}.png`),
      fullPage: false,
    }),
  );
  await step('16.exportConversation', () => gemini.exportConversationToFile());
  await step('17.nav.library+app', async () => {
    await gemini.goNav('library');
    await gemini.goNav('app');
    await gemini.waitReady({ timeout: 60_000 });
    return { url: gemini.page.url() };
  });

  report.ok = steps.every((s) => s.ok);
} catch {
  report.ok = steps.length > 0 && steps.every((s) => s.ok);
  if (!report.ok) report.ok = false;
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = steps.filter((s) => s.ok).length;
  report.failed = steps.filter((s) => !s.ok).length;
  const reportPath = path.join(OUT, `e2e-report-${RUN_ID}.json`);
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await fs.writeFile(
    path.join(OUT, 'e2e-report-latest.json'),
    JSON.stringify(report, null, 2),
  );

  console.log('\n════════ Gemini E2E ════════');
  console.log(report.ok ? 'PASS ✓' : 'FAIL ✗');
  console.log(`${report.passed}/${steps.length} 通过，失败 ${report.failed}`);
  for (const s of steps) {
    console.log(
      `  ${s.ok ? '✓' : '✗'} ${s.name} (${s.ms}ms)${s.error ? ' — ' + s.error : ''}`,
    );
  }
  console.log(`报告: ${reportPath}`);
  if (report.session?.conversationMd) {
    console.log(`对话: ${report.session.conversationMd}`);
  }
  console.log('═══════════════════════════\n');

  await closeBrowser(browser);
  process.exit(report.ok ? 0 : 1);
}
