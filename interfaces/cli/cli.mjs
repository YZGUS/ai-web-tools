#!/usr/bin/env node
/**
 * ai-web-tools CLI
 *
 *   node interfaces/cli/cli.mjs probe
 *   node interfaces/cli/cli.mjs status
 *   node interfaces/cli/cli.mjs gemini chat "你好" --new --new-tab
 *   node interfaces/cli/cli.mjs gemini gen image "一只猫" --new
 *   node interfaces/cli/cli.mjs chatgpt image "水彩橘猫"
 *   node interfaces/cli/cli.mjs grok image "水彩猫" --ratio 1:1
 *   node interfaces/cli/cli.mjs grok video "海浪" --resolution 480p --duration 6s
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectBrowser,
  closeBrowser,
  probeCdp,
  SessionLog,
  SESSIONS_ROOT,
  RUNTIME_ROOT,
  AiWebError,
  GeminiClient,
  runGeminiTool,
  ChatgptClient,
  runChatgptTool,
  GrokImagineClient,
  runGrokTool,
} from '../../index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function usage() {
  console.log(`
ai-web-tools CLI

  probe                         检查 Chrome CDP
  status                        读最新会话 phase

  gemini open [--new-tab]
  gemini chat "<prompt>" [--new] [--new-tab] [--timeout ms]
  gemini gen <image|video|music|research|canvas> "<prompt>" [--new] [--timeout ms]
  gemini explore | modes | mode <name> | tools | tool <name>
  gemini last | history | export | screenshot | health | nav <dest>

  chatgpt open | images | health [--new-tab]
  chatgpt chat "<prompt>" [--new] [--new-tab] [--timeout ms]
  chatgpt image "<prompt>" [--new-tab] [--timeout ms] [--out name] [--ref path]
  chatgpt explore | screenshot [--out path]

  grok open | health | explore [--new-tab]
  grok image "<prompt>" [--ratio 1:1] [--quality quality|speed] [--preset Chibi]
            [--ref path]... [--out name] [--timeout ms]
  grok video "<prompt>" [--resolution 480p|720p] [--duration 6s|10s]
            [--ratio 16:9] [--ref path]... [--out name] [--timeout ms]
  grok gen <image|video|agent> "<prompt>" [同上选项]

  tool <name> --arg key=val     经各 provider dispatch 分发

示例:
  node interfaces/cli/cli.mjs gemini gen image "水彩橘猫" --new
  node interfaces/cli/cli.mjs chatgpt image "唐代疆域分布图"
  node interfaces/cli/cli.mjs grok image "水彩橘猫" --ratio 1:1
  node interfaces/cli/cli.mjs grok video "镜头推进的赛博城市" --resolution 480p --duration 6s
  node interfaces/cli/cli.mjs grok image "参考人物改成唐朝服饰" --ref a.png --ref b.png
`);
}

function parseArgs(argv) {
  /** @type {Record<string, any>} */
  const a = {
    _: [],
    args: {},
    refs: [],
    ratio: undefined,
    quality: undefined,
    resolution: undefined,
    duration: undefined,
    preset: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--timeout') a.timeout = Number(argv[++i]);
    else if (x === '--new') a.new = true;
    else if (x === '--new-tab') a.newTab = true;
    else if (x === '--out') a.out = argv[++i];
    else if (x === '--ref') a.refs.push(argv[++i]);
    else if (x === '--ratio') a.ratio = argv[++i];
    else if (x === '--quality') a.quality = argv[++i];
    else if (x === '--resolution') a.resolution = argv[++i];
    else if (x === '--duration') a.duration = argv[++i];
    else if (x === '--preset') a.preset = argv[++i];
    else if (x === '--arg') {
      const [k, ...rest] = (argv[++i] || '').split('=');
      a.args[k] = rest.join('=');
    } else if (x === '--help' || x === '-h') a.help = true;
    else if (!x.startsWith('--')) a._.push(x);
  }
  return a;
}

async function withGemini(args, fn) {
  const browser = await connectBrowser();
  try {
    const client = await GeminiClient.attach(browser, {
      forceNewTab: !!args.newTab,
      runtimeDir: RUNTIME_ROOT,
    });
    return await fn(client);
  } finally {
    await closeBrowser(browser);
  }
}

async function withChatgpt(args, fn) {
  const browser = await connectBrowser();
  try {
    const client = await ChatgptClient.attach(browser, {
      forceNewTab: args.newTab !== false,
      runtimeDir: RUNTIME_ROOT,
    });
    return await fn(client);
  } finally {
    await closeBrowser(browser);
  }
}

async function withGrok(args, fn) {
  const browser = await connectBrowser();
  try {
    const client = await GrokImagineClient.attach(browser, {
      forceNewTab: args.newTab !== false,
      runtimeDir: RUNTIME_ROOT,
    });
    return await fn(client);
  } finally {
    await closeBrowser(browser);
  }
}

function grokGenerateOpts(args) {
  return {
    timeout: args.timeout,
    filename: args.out,
    ratio: args.ratio,
    quality: args.quality,
    resolution: args.resolution,
    duration: args.duration,
    preset: args.preset,
    refImages: args.refs.length
      ? args.refs.map((p) => path.resolve(p))
      : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || args.help) {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  try {
    if (cmd === 'probe') {
      const info = await probeCdp();
      console.log(JSON.stringify(info, null, 2));
      process.exit(info.ok ? 0 : 1);
    }
    if (cmd === 'status') {
      const status = await SessionLog.readLatest(SESSIONS_ROOT);
      console.log(
        JSON.stringify({ ok: true, status, root: SESSIONS_ROOT }, null, 2),
      );
      return;
    }
    if (cmd === 'tool') {
      const name = args._[1];
      if (!name) throw new AiWebError('需要 tool name');
      const payload = {
        name,
        arguments: {
          ...args.args,
          prompt: args.args.prompt || args._.slice(2).join(' '),
          new_chat: args.new || args.args.new_chat === 'true',
          timeout_ms: args.timeout,
          ref_images: args.refs.length
            ? args.refs
            : args.args.ref_images
              ? String(args.args.ref_images).split(',')
              : undefined,
          filename: args.out || args.args.filename,
        },
      };
      const isChatgpt =
        name.startsWith('chatgpt_') || name === 'web_image_chatgpt';
      const isGrok = name.startsWith('grok_');
      const result = isGrok
        ? await runGrokTool(payload)
        : isChatgpt
          ? await runChatgptTool(payload)
          : await runGeminiTool(payload);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (cmd === 'gemini') {
      const sub = args._[1] || 'health';
      const rest = args._.slice(2).join(' ').trim();
      const result = await withGemini(args, async (g) => {
        switch (sub) {
          case 'open':
            return g.open({ timeout: args.timeout });
          case 'health':
            return { ok: await g.healthCheck(), url: g.page.url() };
          case 'chat': {
            if (!rest) throw new AiWebError('需要 prompt');
            return g.chat(rest, {
              newChat: !!args.new,
              timeout: args.timeout,
            });
          }
          case 'gen':
          case 'generate': {
            const tool = args._[2];
            const prompt = args._.slice(3).join(' ').trim();
            if (!tool || !prompt) {
              throw new AiWebError('用法: gemini gen image|video|… "prompt"');
            }
            return g.generateWithTool(tool, prompt, {
              newChat: !!args.new,
              timeout: args.timeout,
            });
          }
          case 'explore':
            return g.explore();
          case 'modes':
            return {
              ok: true,
              current: await g.getCurrentMode(),
              modes: await g.listModes(),
            };
          case 'mode': {
            if (!args._[2]) throw new AiWebError('需要 mode');
            return g.setMode(args._[2]);
          }
          case 'tools':
            return g.listTools();
          case 'tool': {
            if (!args._[2]) throw new AiWebError('需要 tool 名');
            return g.selectTool(args._[2]);
          }
          case 'last':
            await g.open();
            return { ok: true, reply: await g.getLastResponse() };
          case 'history':
            await g.open();
            return { ok: true, history: await g.getHistory() };
          case 'export':
            return g.exportConversationToFile();
          case 'screenshot': {
            await g.open().catch(() => {});
            const p = await g.screenshotChat({
              path: args.out ? path.resolve(args.out) : undefined,
            });
            return { ok: true, path: p };
          }
          case 'nav':
            return g.goNav(args._[2] || 'app');
          case 'new-chat':
            await g.open();
            return g.newChat();
          default:
            throw new AiWebError(`未知 gemini 子命令: ${sub}`);
        }
      });
      console.log(JSON.stringify({ ok: result?.ok !== false, ...result }, null, 2));
      return;
    }
    if (cmd === 'chatgpt') {
      const sub = args._[1] || 'health';
      const rest = args._.slice(2).join(' ').trim();
      const result = await withChatgpt(args, async (c) => {
        switch (sub) {
          case 'open':
            return c.open({ timeout: args.timeout });
          case 'images':
          case 'open-images':
            return c.openImages({ timeout: args.timeout });
          case 'health':
            return { ok: await c.healthCheck(), url: c.page.url() };
          case 'chat': {
            if (!rest) throw new AiWebError('需要 prompt');
            return c.chat(rest, {
              newChat: !!args.new,
              timeout: args.timeout,
            });
          }
          case 'image':
          case 'gen':
          case 'generate': {
            const prompt = rest || args.args.prompt;
            if (!prompt) {
              throw new AiWebError('用法: chatgpt image "<prompt>" [--ref path]');
            }
            return c.generateImage(prompt, {
              timeout: args.timeout,
              filename: args.out,
              refImages: args.refs.length ? args.refs.map((p) => path.resolve(p)) : undefined,
            });
          }
          case 'explore':
            return c.explore();
          case 'screenshot': {
            await c.openImages().catch(() => c.open().catch(() => {}));
            const p = await c.screenshot({
              path: args.out ? path.resolve(args.out) : undefined,
            });
            return { ok: true, path: p };
          }
          case 'new-chat':
            await c.open();
            return c.newChat();
          default:
            throw new AiWebError(`未知 chatgpt 子命令: ${sub}`);
        }
      });
      console.log(JSON.stringify({ ok: result?.ok !== false, ...result }, null, 2));
      return;
    }
    if (cmd === 'grok') {
      const sub = args._[1] || 'health';
      const rest = args._.slice(2).join(' ').trim();
      const result = await withGrok(args, async (c) => {
        switch (sub) {
          case 'open':
            return c.open({ timeout: args.timeout });
          case 'health':
            return { ok: await c.healthCheck(), url: c.page.url() };
          case 'explore':
            return c.explore();
          case 'image':
          case 'img': {
            if (!rest) throw new AiWebError('用法: grok image "<prompt>"');
            return c.generateImage(rest, grokGenerateOpts(args));
          }
          case 'video': {
            if (!rest) throw new AiWebError('用法: grok video "<prompt>"');
            return c.generateVideo(rest, grokGenerateOpts(args));
          }
          case 'gen':
          case 'generate': {
            const mode = args._[2] || 'image';
            const prompt = args._.slice(3).join(' ').trim();
            if (!prompt) {
              throw new AiWebError(
                '用法: grok gen image|video|agent "<prompt>"',
              );
            }
            return c.generate(prompt, {
              ...grokGenerateOpts(args),
              mode,
            });
          }
          case 'screenshot': {
            await c.open().catch(() => {});
            const p = await c.screenshot({
              path: args.out ? path.resolve(args.out) : undefined,
            });
            return { ok: true, path: p };
          }
          default:
            throw new AiWebError(`未知 grok 子命令: ${sub}`);
        }
      });
      console.log(JSON.stringify({ ok: result?.ok !== false, ...result }, null, 2));
      return;
    }
    throw new AiWebError(`未知命令: ${cmd}`);
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: err instanceof AiWebError ? err.code : undefined,
          screenshot:
            err instanceof AiWebError ? err.screenshot : undefined,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main();
