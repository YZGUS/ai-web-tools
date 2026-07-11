#!/usr/bin/env node
/**
 * 千问 Bot tool 定义冒烟
 *
 *   node tests/providers/qianwen/bot-tools.mjs
 *   node tests/providers/qianwen/bot-tools.mjs --schema-only
 *   node tests/providers/qianwen/bot-tools.mjs --live
 */
import {
  QIANWEN_TOOL_DEFINITIONS,
  runQianwenTool,
} from '../../../index.mjs';

const schemaOnly = process.argv.includes('--schema-only');
const live = process.argv.includes('--live');

console.log('══ QIANWEN_TOOL_DEFINITIONS ══');
console.log(`共 ${QIANWEN_TOOL_DEFINITIONS.length} 个工具:\n`);
for (const t of QIANWEN_TOOL_DEFINITIONS) {
  console.log(`  - ${t.name}: ${t.description.slice(0, 72)}…`);
  if (!t.method || !t.parameters?.type) {
    console.error('    ✗ schema incomplete');
    process.exitCode = 1;
  }
}

const names = new Set(QIANWEN_TOOL_DEFINITIONS.map((t) => t.name));
for (const req of [
  'qianwen_chat',
  'qianwen_research',
  'qianwen_task',
  'web_research_qianwen',
  'web_task_qianwen',
  'qianwen_explore',
]) {
  if (!names.has(req)) {
    console.error(`缺少 tool: ${req}`);
    process.exitCode = 1;
  }
}

if (schemaOnly || process.exitCode) {
  if (schemaOnly) console.log(JSON.stringify(QIANWEN_TOOL_DEFINITIONS, null, 2));
  process.exit(process.exitCode || 0);
}

if (!live) {
  console.log('\n（默认仅 schema。加 --live 会连 Chrome 跑 explore）');
  process.exit(0);
}

console.log('\n▶ qianwen_explore');
try {
  const ex = await runQianwenTool({ name: 'qianwen_explore', arguments: {} });
  console.log(
    JSON.stringify(
      {
        ok: ex.ok,
        capsules: ex.capsules,
        capabilities: ex.capabilities,
        notes: ex.notes,
      },
      null,
      2,
    ),
  );
  process.exit(ex.ok ? 0 : 1);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
