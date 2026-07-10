/**
 * 将 Bot / CLI tool 调用分发到 ChatgptClient
 */
import path from 'node:path';
import {
  connectBrowser,
  closeBrowser,
  SessionLog,
  RUNTIME_ROOT,
  AiWebError,
} from '../../../shared/index.mjs';
import { ChatgptClient } from '../client/index.mjs';
import { CHATGPT_TOOL_DEFINITIONS } from './definitions.mjs';

/**
 * 执行一个 ChatGPT 相关 tool
 *
 * @param {{ name: string, arguments?: Record<string, unknown> }} call
 * @param {{ forceNewTab?: boolean, runtimeDir?: string }} [opts]
 * @returns {Promise<object>}
 *
 * @example
 * await runChatgptTool({ name: 'chatgpt_image', arguments: { prompt: '水彩猫' } });
 * await runChatgptTool({ name: 'chatgpt_chat', arguments: { prompt: '你好', new_chat: true } });
 */
export async function runChatgptTool(call, opts = {}) {
  const name = call.name;
  const args = call.arguments || {};
  const runtimeDir = opts.runtimeDir || RUNTIME_ROOT;

  if (name === 'chatgpt_status' || name === 'app_session_status') {
    const status = await SessionLog.readLatest(
      path.join(runtimeDir, 'sessions'),
    );
    return { ok: true, status };
  }

  const def = CHATGPT_TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) {
    throw new AiWebError(`未知 ChatGPT tool: ${name}`, {
      code: 'UNKNOWN_TOOL',
      provider: 'chatgpt',
    });
  }

  const browser = await connectBrowser();
  try {
    const client = await ChatgptClient.attach(browser, {
      forceNewTab: opts.forceNewTab !== false,
      runtimeDir,
    });

    switch (def.method) {
      case 'chat':
        return client.chat(String(args.prompt || ''), {
          newChat: !!args.new_chat,
          timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
        });
      case 'generateImage': {
        if (!args.prompt) {
          throw new AiWebError('generateImage 需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'chatgpt',
          });
        }
        /** @type {string[]} */
        let refImages = [];
        if (Array.isArray(args.ref_images)) {
          refImages = args.ref_images.map(String);
        } else if (typeof args.ref_images === 'string' && args.ref_images) {
          refImages = args.ref_images.split(',').map((s) => s.trim()).filter(Boolean);
        }
        return client.generateImage(String(args.prompt), {
          refImages,
          timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
          filename: args.filename ? String(args.filename) : undefined,
        });
      }
      case 'explore':
        return client.explore();
      default:
        throw new AiWebError(`未实现 method: ${def.method}`, {
          code: 'NOT_IMPLEMENTED',
          provider: 'chatgpt',
        });
    }
  } finally {
    await closeBrowser(browser);
  }
}

export { CHATGPT_TOOL_DEFINITIONS };
