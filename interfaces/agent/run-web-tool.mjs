/**
 * 统一 Agent tool 入口
 *
 * Agent / Bot 只应依赖：
 *   listWebTools()  → function-calling schema
 *   runWebTool(call) → AgentToolResult（永远有 content，默认可失败不抛）
 *
 * @module shared/tools/run-web-tool
 */
import { GEMINI_TOOL_DEFINITIONS, runGeminiTool } from '../../providers/gemini/index.mjs';
import {
  CHATGPT_TOOL_DEFINITIONS,
  runChatgptTool,
} from '../../providers/chatgpt/index.mjs';
import { GROK_TOOL_DEFINITIONS, runGrokTool } from '../../providers/grok/index.mjs';
import { XYQ_TOOL_DEFINITIONS, runXyqTool } from '../../providers/xyq/index.mjs';
import {
  QIANWEN_TOOL_DEFINITIONS,
  runQianwenTool,
} from '../../providers/qianwen/index.mjs';
import {
  toAgentResult,
  toAgentError,
} from '../../shared/tools/agent-result.mjs';

/** 全部对外 tool 定义（供 Agent 注册） */
export const WEB_TOOL_DEFINITIONS = Object.freeze([
  ...GEMINI_TOOL_DEFINITIONS,
  ...CHATGPT_TOOL_DEFINITIONS,
  ...GROK_TOOL_DEFINITIONS,
  ...XYQ_TOOL_DEFINITIONS,
  ...QIANWEN_TOOL_DEFINITIONS,
]);

/**
 * @returns {typeof WEB_TOOL_DEFINITIONS}
 */
export function listWebTools() {
  return WEB_TOOL_DEFINITIONS;
}

/**
 * 按 tool name 路由到提供方
 * @param {string} name
 */
export function resolveToolProvider(name) {
  const n = String(name || '');
  if (
    n.startsWith('qianwen_') ||
    n === 'web_research_qianwen' ||
    n === 'web_task_qianwen'
  ) {
    return { provider: 'qianwen', run: runQianwenTool };
  }
  if (n.startsWith('xyq_') || n === 'web_image_xyq') {
    return { provider: 'xyq', run: runXyqTool };
  }
  if (n.startsWith('grok_')) {
    return { provider: 'grok', run: runGrokTool };
  }
  if (
    n.startsWith('chatgpt_') ||
    n === 'web_image_chatgpt'
  ) {
    return { provider: 'chatgpt', run: runChatgptTool };
  }
  if (
    n.startsWith('gemini_') ||
    n.startsWith('web_') ||
    n === 'app_session_status'
  ) {
    return { provider: 'gemini', run: runGeminiTool };
  }
  // 兜底按定义表查
  if (QIANWEN_TOOL_DEFINITIONS.some((t) => t.name === n)) {
    return { provider: 'qianwen', run: runQianwenTool };
  }
  if (XYQ_TOOL_DEFINITIONS.some((t) => t.name === n)) {
    return { provider: 'xyq', run: runXyqTool };
  }
  if (GROK_TOOL_DEFINITIONS.some((t) => t.name === n)) {
    return { provider: 'grok', run: runGrokTool };
  }
  if (CHATGPT_TOOL_DEFINITIONS.some((t) => t.name === n)) {
    return { provider: 'chatgpt', run: runChatgptTool };
  }
  if (GEMINI_TOOL_DEFINITIONS.some((t) => t.name === n)) {
    return { provider: 'gemini', run: runGeminiTool };
  }
  return null;
}

/**
 * 执行 tool 并返回 **Agent 标准结果**
 *
 * @param {{ name: string, arguments?: Record<string, unknown> }} call
 * @param {{
 *   forceNewTab?: boolean,
 *   runtimeDir?: string,
 *   throwOnError?: boolean,
 *   includeRaw?: boolean,
 *   agentFormat?: boolean,
 * }} [opts]
 * @returns {Promise<import('./agent-result.mjs').AgentToolResult|object>}
 *
 * @example
 * const r = await runWebTool({
 *   name: 'qianwen_research',
 *   arguments: { prompt: '调研 RISC-V', timeout_ms: 900000 },
 * });
 * // r.content  → 给 LLM 的主结果
 * // r.text     → 正文
 * // r.files    → [{ path, kind }]
 * // r.imagePath / r.ok
 */
export async function runWebTool(call, opts = {}) {
  const name = call?.name;
  if (!name) {
    const err = toAgentError(new Error('需要 tool name'), { tool: null });
    if (opts.throwOnError) {
      throw new Error(err.content);
    }
    return err;
  }

  const route = resolveToolProvider(name);
  if (!route) {
    const err = toAgentError(new Error(`未知 tool: ${name}`), {
      tool: name,
    });
    if (opts.throwOnError) throw new Error(err.content);
    return err;
  }

  try {
    const raw = await route.run(call, opts);
    // 默认 agent 格式；opts.agentFormat === false 时返回原始结构
    if (opts.agentFormat === false) return raw;
    return toAgentResult(raw, {
      tool: name,
      provider: route.provider,
      includeRaw: !!opts.includeRaw,
    });
  } catch (err) {
    if (opts.throwOnError) throw err;
    return toAgentError(err, { tool: name, provider: route.provider });
  }
}

/**
 * 把 AgentToolResult 收成纯字符串（部分 runtime 只吃 string tool result）
 * @param {import('./agent-result.mjs').AgentToolResult|object} result
 */
export function agentResultToString(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (result.content) return String(result.content);
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}
