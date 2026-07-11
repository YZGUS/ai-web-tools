#!/usr/bin/env node
/**
 * 千问研究模式冒烟（真实长任务，默认最长 12 分钟）
 *
 *   node tests/providers/qianwen/research-smoke.mjs
 *   node tests/providers/qianwen/research-smoke.mjs --task
 *   QIANWEN_SMOKE_TIMEOUT_MS=600000 node tests/providers/qianwen/research-smoke.mjs
 *
 * 验证点：
 * - 能打开研究/任务助理胶囊
 * - waitForLongTask 不会在「仅计划」阶段提前返回（依赖「正在*」检测）
 * - 最终有非空 reply
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  connectBrowser,
  closeBrowser,
  QianwenClient,
  PKG_ROOT,
} from '../../../index.mjs';

const isTask = process.argv.includes('--task');
const timeout = Number(
  process.env.QIANWEN_SMOKE_TIMEOUT_MS || 12 * 60_000,
);
const outDir = path.join(PKG_ROOT, 'runtime/media/qianwen/smoke');

const RESEARCH_PROMPT =
  '简要调研：什么是 RISC-V？用不超过 400 字说明定义、起源、生态现状三点。';
const TASK_PROMPT =
  '请作为任务助理，输出一份「技术周报」大纲，包含：本周完成、风险、下周计划；条目式，不超过 300 字。';

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await connectBrowser();
  const mode = isTask ? 'task' : 'research';
  console.log(`[qianwen-smoke] mode=${mode} timeout=${timeout}ms`);

  try {
    const c = await QianwenClient.attach(browser, {
      forceNewTab: true,
      sessionLog: true,
    });
    const started = Date.now();
    const result = isTask
      ? await c.taskAssistant(TASK_PROMPT, {
          timeout,
          newChat: true,
        })
      : await c.research(RESEARCH_PROMPT, {
          timeout,
          newChat: true,
        });

    const reply = result.reply || '';
    const looksComplete =
      reply.length >= 40 ||
      /我已经完成了|请查看研究报告|研究报告|任务完成/.test(reply);

    const report = {
      ok: !!looksComplete,
      mode,
      elapsedMs: result.elapsedMs,
      wallMs: Date.now() - started,
      replyLen: reply.length,
      replyHead: reply.slice(0, 500),
      pageUrl: result.pageUrl,
      state: result.state,
      // 长任务成功关键：耗时远大于「仅计划」误判（通常 > 60s）
      waitedPastPlanPhase: (result.elapsedMs || 0) >= 60_000,
    };
    await fs.writeFile(
      path.join(outDir, `${mode}-report.json`),
      JSON.stringify(report, null, 2),
    );
    await c.screenshot({
      path: path.join(outDir, `${mode}-done.png`),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!looksComplete) {
      console.error('reply missing / incomplete');
      process.exitCode = 1;
    } else if (!report.waitedPastPlanPhase && mode === 'research') {
      console.warn(
        'warn: research finished under 60s — 请确认未在计划阶段误判',
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          mode,
          error: err instanceof Error ? err.message : String(err),
          code: err?.code,
          screenshot: err?.screenshot,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await closeBrowser(browser).catch(() => {});
  }
}

main();
