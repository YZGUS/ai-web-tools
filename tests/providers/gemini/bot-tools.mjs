#!/usr/bin/env node
/**
 * Gemini Bot tool 定义 + 分发冒烟
 *
 * 位置: tests/providers/gemini/bot-tools.mjs
 *
 *   node tests/providers/gemini/bot-tools.mjs
 *   node tests/providers/gemini/bot-tools.mjs --schema-only
 */
import {
  GEMINI_TOOL_DEFINITIONS,
  runGeminiTool,
} from '../../../index.mjs';

const schemaOnly = process.argv.includes('--schema-only');

console.log('══ GEMINI_TOOL_DEFINITIONS ══');
console.log(`共 ${GEMINI_TOOL_DEFINITIONS.length} 个工具:\n`);
for (const t of GEMINI_TOOL_DEFINITIONS) {
  console.log(`  - ${t.name}: ${t.description.slice(0, 60)}…`);
}

if (schemaOnly) {
  console.log(JSON.stringify(GEMINI_TOOL_DEFINITIONS, null, 2));
  process.exit(0);
}

console.log('\n▶ gemini_status / app_session_status');
const st = await runGeminiTool({ name: 'app_session_status', arguments: {} });
console.log(JSON.stringify(st, null, 2));

console.log('\n▶ gemini_chat');
try {
  const chat = await runGeminiTool({
    name: 'gemini_chat',
    arguments: {
      prompt: 'Bot 工具测试：只回复两个字「通过」',
      new_chat: true,
      timeout_ms: 120000,
    },
  });
  console.log(
    JSON.stringify(
      {
        ok: chat.ok,
        reply: chat.reply,
        session: chat.session?.dir,
      },
      null,
      2,
    ),
  );
  process.exit(chat.ok ? 0 : 1);
} catch (err) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
