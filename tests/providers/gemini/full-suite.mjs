#!/usr/bin/env node
/**
 * Gemini 完整测试套件入口（顺序执行）
 *
 * 位置: tests/providers/gemini/full-suite.mjs
 *
 *   node tests/providers/gemini/full-suite.mjs
 *   node tests/providers/gemini/full-suite.mjs --quick          # 不含多媒体生成
 *   node tests/providers/gemini/full-suite.mjs --media-only image,music
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../..');
const quick = process.argv.includes('--quick');
const mediaOnlyIdx = process.argv.indexOf('--media-only');
const mediaOnly =
  mediaOnlyIdx >= 0 ? process.argv[mediaOnlyIdx + 1] : null;

function run(script, extraArgs = []) {
  return new Promise((resolve) => {
    console.log(`\n########## ${path.relative(ROOT, script)} ${extraArgs.join(' ')} ##########\n`);
    const child = spawn(process.execPath, [script, ...extraArgs], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

const results = [];

// 1. smoke CDP
results.push({
  name: 'smoke/cdp',
  code: await run(path.join(ROOT, 'tests/smoke/cdp.mjs')),
});

// 2. e2e 标准
results.push({
  name: 'gemini/e2e',
  code: await run(path.join(DIR, 'e2e.mjs')),
});

// 3. bot tools schema + chat
results.push({
  name: 'gemini/bot-tools',
  code: await run(path.join(DIR, 'bot-tools.mjs')),
});

// 4. media（可选）
if (!quick) {
  const mediaArgs = mediaOnly
    ? ['--only', mediaOnly]
    : []; // 全量 image,video,music,research,canvas
  results.push({
    name: 'gemini/media',
    code: await run(path.join(DIR, 'media.mjs'), mediaArgs),
  });
} else {
  console.log('\n[full-suite] --quick: 跳过多媒体生成\n');
}

console.log('\n════════ 完整套件汇总 ════════');
let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${r.name} (exit ${r.code})`);
}
console.log(failed === 0 ? '全部通过 ✓' : `失败 ${failed} 项 ✗`);
console.log('══════════════════════════════\n');
process.exit(failed === 0 ? 0 : 1);
