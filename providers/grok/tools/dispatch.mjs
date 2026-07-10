/**
 * Grok Imagine tool 分发
 */
import path from 'node:path';
import {
  connectBrowser,
  closeBrowser,
  SessionLog,
  RUNTIME_ROOT,
  AiWebError,
} from '../../../shared/index.mjs';
import { GrokImagineClient } from '../client/index.mjs';
import { GROK_TOOL_DEFINITIONS } from './definitions.mjs';

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
export async function runGrokTool(call, opts = {}) {
  const name = call.name;
  const args = call.arguments || {};
  const runtimeDir = opts.runtimeDir || RUNTIME_ROOT;

  if (name === 'grok_status' || name === 'app_session_status') {
    const status = await SessionLog.readLatest(
      path.join(runtimeDir, 'sessions'),
    );
    return { ok: true, status };
  }

  const def = GROK_TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) {
    throw new AiWebError(`未知 Grok tool: ${name}`, {
      code: 'UNKNOWN_TOOL',
      provider: 'grok-imagine',
    });
  }

  const browser = await connectBrowser();
  try {
    const client = await GrokImagineClient.attach(browser, {
      forceNewTab: opts.forceNewTab !== false,
      runtimeDir,
    });

    const common = {
      refImages: parseRefs(args),
      ratio: args.ratio ? String(args.ratio) : undefined,
      quality: args.quality ? String(args.quality) : undefined,
      resolution: args.resolution ? String(args.resolution) : undefined,
      duration: args.duration ? String(args.duration) : undefined,
      preset: args.preset ? String(args.preset) : undefined,
      timeout: args.timeout_ms ? Number(args.timeout_ms) : undefined,
      filename: args.filename ? String(args.filename) : undefined,
    };

    switch (def.method) {
      case 'generateImage':
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'grok-imagine',
          });
        }
        return client.generateImage(String(args.prompt), common);
      case 'generateVideo':
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'grok-imagine',
          });
        }
        return client.generateVideo(String(args.prompt), common);
      case 'generate':
        if (!args.prompt) {
          throw new AiWebError('需要 prompt', {
            code: 'BAD_ARGS',
            provider: 'grok-imagine',
          });
        }
        return client.generate(String(args.prompt), {
          ...common,
          mode: args.mode ? String(args.mode) : 'image',
        });
      case 'explore':
        return client.explore();
      default:
        throw new AiWebError(`未实现 method: ${def.method}`, {
          code: 'NOT_IMPLEMENTED',
          provider: 'grok-imagine',
        });
    }
  } finally {
    await closeBrowser(browser);
  }
}

export { GROK_TOOL_DEFINITIONS };
