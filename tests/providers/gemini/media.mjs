#!/usr/bin/env node
/**
 * Gemini 多媒体真实生成测试
 *
 * 位置: tests/providers/gemini/media.mjs
 *
 *   node tests/providers/gemini/media.mjs
 *   node tests/providers/gemini/media.mjs --only image,music
 *   node tests/providers/gemini/media.mjs --skip video,research
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectBrowser,
  closeBrowser,
  probeCdp,
  GeminiClient,
  RUNTIME_ROOT,
} from '../../../index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'runtime', 'media', 'gemini-tests', 'media');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const ALL = ['image', 'video', 'music', 'research', 'canvas'];

const PROMPTS = {
  image: '生成一张图片：极简扁平图标，橙色小猫坐在蓝色圆上，白底，无文字。',
  video: '生成很短视频：窗台橘猫打哈欠，约3秒，写实。',
  music: '生成约10秒轻快钢琴短旋律，C大调，无歌词。',
  research: 'Deep Research：端到端测试是什么？定义一句话+3要点，200字内。',
  canvas: 'Canvas：Markdown 大纲「E2E 清单」含准备/执行/报告 3 条。',
};

const TIMEOUTS = {
  image: 240_000,
  /** 视频业务等待 10 分钟；CDP protocolTimeout 已 600s，evaluate 单次 15s 限时 */
  video: 600_000,
  music: 240_000,
  research: 600_000,
  canvas: 180_000,
};

function parseTools() {
  let only = null;
  let skip = new Set();
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--only') {
      only = process.argv[++i].split(',').map((s) => s.trim());
    }
    if (process.argv[i] === '--skip') {
      skip = new Set(process.argv[++i].split(',').map((s) => s.trim()));
    }
  }
  return (only || ALL).filter((t) => ALL.includes(t) && !skip.has(t));
}

function log(m) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
}

const tools = parseTools();
await fs.mkdir(OUT, { recursive: true });

const report = {
  suite: 'gemini-media',
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  tools,
  results: [],
  ok: false,
};

const cdp = await probeCdp();
if (!cdp.ok) {
  console.error('请先 npm run chrome:start');
  process.exit(1);
}
log(`CDP: ${cdp.browser}`);
log(`将测试: ${tools.join(', ')}`);

const browser = await connectBrowser();
try {
  const gemini = await GeminiClient.attach(browser, {
    forceNewTab: true,
    runtimeDir: RUNTIME_ROOT,
  });
  await gemini.open({ timeout: 120_000 });
  const exploration = await gemini.explore();
  report.capabilities = exploration.capabilities;
  log(`capabilities: ${JSON.stringify(exploration.capabilities)}`);

  for (const tool of tools) {
    const item = { tool, ok: false, ms: 0 };
    const t0 = Date.now();
    log(`════════ ${tool} ════════`);
    try {
      if (exploration.capabilities?.[tool] === false) {
        item.skipped = true;
        item.ok = true;
        item.reason = 'capability false';
        log(`skip ${tool}`);
      } else {
        const result = await gemini.generateWithTool(tool, PROMPTS[tool], {
          newChat: true,
          timeout: TIMEOUTS[tool],
        });
        item.ok = true;
        item.replyPreview = String(result.reply || '').slice(0, 300);
        item.media = result.media;
        item.session = result.session;
        const shot = path.join(OUT, `${tool}-${RUN_ID}.png`);
        await gemini.screenshotChat({ path: shot, fullPage: true });
        item.screenshot = shot;

        if (tool === 'image' && !result.media?.images?.length && !result.reply) {
          item.ok = false;
          item.error = '无图片且无文案';
        }
        if (tool === 'video' && !result.media?.videos?.length && !result.reply) {
          item.ok = false;
          item.error = '无视频';
        }
        if (
          tool === 'music' &&
          !(result.media?.videos?.length || result.media?.audio?.length) &&
          !result.reply
        ) {
          item.ok = false;
          item.error = '无音乐媒体';
        }
        if (!result.reply && tool !== 'image' && tool !== 'video' && tool !== 'music') {
          // research/canvas 至少要有文本
          if (!result.reply) {
            item.ok = false;
            item.error = '无回复文本';
          }
        }

        const av = [
          ...(result.media?.videos || []),
          ...(result.media?.audio || []),
        ].filter((u) => String(u).startsWith('http'));
        if (av[0]) {
          try {
            const res = await fetch(av[0]);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              const fp = path.join(OUT, `${tool}-asset-${RUN_ID}.mp4`);
              await fs.writeFile(fp, buf);
              item.downloaded = fp;
              item.downloadedBytes = buf.length;
            }
          } catch (e) {
            item.downloadError = String(e.message || e);
          }
        }
        log(
          `${item.ok ? '✓' : '✗'} ${tool} img=${result.media?.images?.length || 0} vid=${result.media?.videos?.length || 0} aud=${result.media?.audio?.length || 0}`,
        );
      }
    } catch (err) {
      item.ok = false;
      item.error = err instanceof Error ? err.message : String(err);
      log(`✗ ${tool}: ${item.error}`);
      try {
        item.screenshot = await gemini.screenshotChat({
          path: path.join(OUT, `${tool}-fail-${RUN_ID}.png`),
        });
      } catch {
        // ignore
      }
    }
    item.ms = Date.now() - t0;
    report.results.push(item);
  }

  report.ok = report.results.every((r) => r.ok);
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = report.results.filter((r) => r.ok).length;
  report.failed = report.results.filter((r) => !r.ok).length;
  const rp = path.join(OUT, `media-report-${RUN_ID}.json`);
  await fs.writeFile(rp, JSON.stringify(report, null, 2));
  await fs.writeFile(
    path.join(OUT, 'media-report-latest.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('\n════════ Gemini Media E2E ════════');
  console.log(
    report.ok ? 'PASS ✓' : 'FAIL ✗',
    `${report.passed}/${report.results.length}`,
  );
  for (const r of report.results) {
    console.log(
      `  ${r.ok ? '✓' : '✗'} ${r.tool} (${r.ms}ms)${r.skipped ? ' [skip]' : ''}${r.error ? ' — ' + r.error : ''}`,
    );
  }
  console.log(`报告: ${rp}\n`);
  await closeBrowser(browser);
  process.exit(report.ok ? 0 : 1);
}
