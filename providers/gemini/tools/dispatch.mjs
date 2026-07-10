/**
 * 将 Bot / CLI tool 调用分发到 GeminiClient
 */
import path from 'node:path';
import {
  connectBrowser,
  closeBrowser,
  SessionLog,
  SESSIONS_ROOT,
  RUNTIME_ROOT,
  AiWebError,
} from '../../../shared/index.mjs';
import { GeminiClient } from '../client/index.mjs';
import { GEMINI_TOOL_DEFINITIONS } from './definitions.mjs';

/**
 * 执行一个 Gemini 相关 tool
 *
 * @param {{ name: string, arguments?: Record<string, unknown> }} call
 * @param {{ forceNewTab?: boolean, runtimeDir?: string }} [opts]
 * @returns {Promise<object>}
 *
 * @example
 * await runGeminiTool({ name: 'gemini_chat', arguments: { prompt: '你好', new_chat: true } });
 * await runGeminiTool({ name: 'web_image', arguments: { prompt: '一只猫' } });
 */
export async function runGeminiTool(call, opts = {}) {
  const name = call.name;
  const args = call.arguments || {};
  const runtimeDir = opts.runtimeDir || RUNTIME_ROOT;

  if (name === 'gemini_status' || name === 'app_session_status') {
    const status = await SessionLog.readLatest(
      path.join(runtimeDir, 'sessions'),
    );
    return { ok: true, status };
  }

  const def = GEMINI_TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) {
    throw new AiWebError(`未知 Gemini tool: ${name}`, {
      code: 'UNKNOWN_TOOL',
      provider: 'gemini',
    });
  }

  const browser = await connectBrowser();
  try {
    const client = await GeminiClient.attach(browser, {
      forceNewTab: opts.forceNewTab !== false,
      runtimeDir,
    });

    switch (def.method) {
      case 'chat':
        return client.chat(String(args.prompt || ''), {
          newChat: !!args.new_chat,
          timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
        });
      case 'generateWithTool': {
        const tool = def.fixedArgs?.tool || args.tool;
        if (!tool || !args.prompt) {
          throw new AiWebError('generate 需要 tool 与 prompt', {
            code: 'BAD_ARGS',
            provider: 'gemini',
          });
        }
        return client.generateWithTool(String(tool), String(args.prompt), {
          newChat: args.new_chat !== false,
          timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
        });
      }
      case 'explore':
        return client.explore();
      case 'setMode':
        return client.setMode(String(args.mode || ''));
      case 'listModes':
        return { ok: true, modes: await client.listModes() };
      case 'listTools':
        return client.listTools();
      default:
        throw new AiWebError(`未实现 method: ${def.method}`, {
          code: 'NOT_IMPLEMENTED',
          provider: 'gemini',
        });
    }
  } finally {
    await closeBrowser(browser);
  }
}

export { GEMINI_TOOL_DEFINITIONS };
