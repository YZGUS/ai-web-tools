/**
 * Agent 如何拿到 tool 结果 — 最小示例（不发起真实浏览器长任务）
 *
 *   node examples/agent-tool-result.mjs
 *   node examples/agent-tool-result.mjs --live-chat
 */
import {
  listWebTools,
  runWebTool,
  agentResultToString,
  toAgentResult,
} from '../index.mjs';

console.log('══ 可注册 tools 数量 ══');
const tools = listWebTools();
console.log(tools.length);
console.log(tools.map((t) => t.name).join(', '));

console.log('\n══ 规范化示例（无浏览器）══');
const fakeChat = toAgentResult(
  {
    ok: true,
    reply: '这是模型回复正文。',
    model: 'demo',
    elapsedMs: 1234,
    session: { dir: '/tmp/sessions/demo' },
  },
  { tool: 'qianwen_chat', provider: 'qianwen' },
);
console.log(JSON.stringify(fakeChat, null, 2));
console.log('agentResultToString →', agentResultToString(fakeChat));

const fakeImage = toAgentResult(
  {
    ok: true,
    imagePath: '/tmp/cat.png',
    width: 512,
    height: 512,
    mime: 'image/png',
    model: 'lite',
  },
  { tool: 'xyq_image', provider: 'xyq' },
);
console.log('\n生图 content:\n', fakeImage.content);
console.log('files:', fakeImage.files);

const fakeErr = toAgentResult(
  {
    ok: false,
    error: { code: 'MEMBERSHIP_REQUIRED', message: '需要会员' },
  },
  { tool: 'xyq_image', provider: 'xyq' },
);
console.log('\n失败 content:', fakeErr.content);

if (process.argv.includes('--live-chat')) {
  console.log('\n══ live: qianwen_chat ══');
  const r = await runWebTool({
    name: 'qianwen_chat',
    arguments: { prompt: '只回复两个字：通过', new_chat: true },
  });
  console.log(JSON.stringify(r, null, 2));
  console.log('→ 回传 Agent:', agentResultToString(r));
}
