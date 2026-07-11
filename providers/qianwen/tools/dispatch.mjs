/**
 * 千问 tool 分发（对齐 runGrokTool / runXyqTool）
 */
import path from 'node:path';
import {
  connectBrowser,
  closeBrowser,
  SessionLog,
  RUNTIME_ROOT,
  AiWebError,
} from '../../../shared/index.mjs';
import { QianwenClient } from '../client/index.mjs';
import { QIANWEN_TOOL_DEFINITIONS } from './definitions.mjs';

/**
 * @param {{ name: string, arguments?: Record<string, unknown> }} call
 * @param {{ forceNewTab?: boolean, runtimeDir?: string }} [opts]
 */
export async function runQianwenTool(call, opts = {}) {
  const name = call.name;
  const args = call.arguments || {};
  const runtimeDir = opts.runtimeDir || RUNTIME_ROOT;

  if (name === 'qianwen_status' || name === 'app_session_status') {
    const status = await SessionLog.readLatest(
      path.join(runtimeDir, 'sessions'),
    );
    return { ok: true, status };
  }

  const def = QIANWEN_TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) {
    throw new AiWebError(`未知千问 tool: ${name}`, {
      code: 'UNKNOWN_TOOL',
      provider: 'qianwen',
    });
  }

  const browser = await connectBrowser();
  try {
    const client = await QianwenClient.attach(browser, {
      forceNewTab: opts.forceNewTab !== false,
      runtimeDir,
    });

    const common = {
      newChat: args.new_chat !== false && args.new_chat !== 'false',
      timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
    };

    switch (def.method) {
      case 'chat': {
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'qianwen',
          });
        }
        return client.chat(String(args.prompt), {
          ...common,
          mode: args.mode ? String(args.mode) : 'chat',
        });
      }
      case 'research': {
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'qianwen',
          });
        }
        return client.research(String(args.prompt), common);
      }
      case 'taskAssistant': {
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'qianwen',
          });
        }
        return client.taskAssistant(String(args.prompt), common);
      }
      case 'explore':
        return client.explore();
      default:
        throw new AiWebError(`未实现 method: ${def.method}`, {
          code: 'NOT_IMPLEMENTED',
          provider: 'qianwen',
        });
    }
  } finally {
    await closeBrowser(browser);
  }
}

export { QIANWEN_TOOL_DEFINITIONS };
