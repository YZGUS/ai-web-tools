/**
 * 小云雀 tool 分发（对齐 runGrokTool / runGeminiTool）
 */
import path from 'node:path';
import {
  connectBrowser,
  closeBrowser,
  SessionLog,
  RUNTIME_ROOT,
  AiWebError,
} from '../../../shared/index.mjs';
import { XyqClient, DEFAULT_SEEDREAM_MODEL } from '../client/index.mjs';
import { XYQ_TOOL_DEFINITIONS } from './definitions.mjs';

function parseRefs(args) {
  if (Array.isArray(args.ref_images)) return args.ref_images.map(String);
  if (typeof args.ref_images === 'string' && args.ref_images) {
    return args.ref_images
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * @param {{ name: string, arguments?: Record<string, unknown> }} call
 * @param {{ forceNewTab?: boolean, runtimeDir?: string }} [opts]
 */
export async function runXyqTool(call, opts = {}) {
  const name = call.name;
  const args = call.arguments || {};
  const runtimeDir = opts.runtimeDir || RUNTIME_ROOT;

  if (name === 'xyq_status' || name === 'app_session_status') {
    const status = await SessionLog.readLatest(
      path.join(runtimeDir, 'sessions'),
    );
    return { ok: true, status };
  }

  const def = XYQ_TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) {
    throw new AiWebError(`未知小云雀 tool: ${name}`, {
      code: 'UNKNOWN_TOOL',
      provider: 'xyq',
    });
  }

  const browser = await connectBrowser();
  try {
    const client = await XyqClient.attach(browser, {
      forceNewTab: opts.forceNewTab !== false,
      runtimeDir,
    });

    switch (def.method) {
      case 'generateImage': {
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'xyq',
          });
        }
        return client.generateImage(String(args.prompt), {
          model: args.model
            ? String(args.model)
            : DEFAULT_SEEDREAM_MODEL,
          refImages: parseRefs(args),
          timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
          filename: args.filename ? String(args.filename) : undefined,
        });
      }
      case 'getCredits':
        await client.open({ waitReady: true }).catch(() => {});
        return { ok: true, credit: await client.getCredits() };
      case 'explore':
        return client.explore();
      default:
        throw new AiWebError(`未实现 method: ${def.method}`, {
          code: 'NOT_IMPLEMENTED',
          provider: 'xyq',
        });
    }
  } finally {
    await closeBrowser(browser);
  }
}

export { XYQ_TOOL_DEFINITIONS };
