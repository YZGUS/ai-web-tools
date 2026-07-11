#!/usr/bin/env node
/**
 * 小云雀 Bot tool 定义 + 分发冒烟（对齐 tests/providers/gemini/bot-tools.mjs）
 *
 *   node tests/providers/xyq/bot-tools.mjs
 *   node tests/providers/xyq/bot-tools.mjs --schema-only
 *   node tests/providers/xyq/bot-tools.mjs --live   # 含 explore / credits（需 CDP）
 */
import {
  XYQ_TOOL_DEFINITIONS,
  runXyqTool,
} from '../../../index.mjs';

const schemaOnly = process.argv.includes('--schema-only');
const live = process.argv.includes('--live');

console.log('══ XYQ_TOOL_DEFINITIONS ══');
console.log(`共 ${XYQ_TOOL_DEFINITIONS.length} 个工具:\n`);
for (const t of XYQ_TOOL_DEFINITIONS) {
  console.log(`  - ${t.name}: ${t.description.slice(0, 72)}…`);
  if (!t.method) {
    console.error(`    ✗ missing method`);
    process.exitCode = 1;
  }
  if (!t.parameters?.type) {
    console.error(`    ✗ missing parameters schema`);
    process.exitCode = 1;
  }
}

const names = new Set(XYQ_TOOL_DEFINITIONS.map((t) => t.name));
for (const req of ['xyq_image', 'web_image_xyq', 'xyq_credits', 'xyq_explore']) {
  if (!names.has(req)) {
    console.error(`缺少必需 tool: ${req}`);
    process.exitCode = 1;
  }
}

if (schemaOnly || process.exitCode) {
  if (schemaOnly) console.log(JSON.stringify(XYQ_TOOL_DEFINITIONS, null, 2));
  process.exit(process.exitCode || 0);
}

if (!live) {
  console.log('\n（默认仅校验 schema。加 --live 会连 Chrome 跑 explore/credits）');
  process.exit(0);
}

console.log('\n▶ xyq_explore');
try {
  const ex = await runXyqTool({ name: 'xyq_explore', arguments: {} });
  console.log(
    JSON.stringify(
      {
        ok: ex.ok,
        provider: ex.provider,
        hasAtMention: ex.hasAtMention,
        hasFileUpload: ex.hasFileUpload,
        credit: ex.credit,
        models: ex.models?.map((m) => m.id),
      },
      null,
      2,
    ),
  );

  console.log('\n▶ xyq_credits');
  const cr = await runXyqTool({ name: 'xyq_credits', arguments: {} });
  console.log(JSON.stringify(cr, null, 2));
  process.exit(ex.ok ? 0 : 1);
} catch (err) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: err?.code,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
