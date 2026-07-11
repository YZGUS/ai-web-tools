/**
 * ai-web-tools 包入口
 *
 * @example
 * import { connectBrowser, closeBrowser, GeminiClient } from './index.mjs';
 * const browser = await connectBrowser();
 * const gemini = await GeminiClient.attach(browser, { forceNewTab: true });
 * const r = await gemini.chat('你好', { newChat: true });
 * await closeBrowser(browser);
 *
 * @example ChatGPT 生图
 * import { ChatgptClient, connectBrowser, closeBrowser } from './index.mjs';
 * const browser = await connectBrowser();
 * const c = await ChatgptClient.attach(browser, { forceNewTab: true });
 * const img = await c.generateImage('水彩猫');
 * await closeBrowser(browser);
 */
export * from './shared/index.mjs';
export {
  GeminiClient,
  GEMINI_TOOLS,
  GEMINI_MODES,
  GEMINI_URL,
  EDITOR_SEL,
  GEMINI_TOOL_DEFINITIONS,
  runGeminiTool,
} from './providers/gemini/index.mjs';
export {
  ChatgptClient,
  CHATGPT_URL,
  CHATGPT_ORIGIN,
  CHATGPT_IMAGES_URL,
  EDITOR_SEL as CHATGPT_EDITOR_SEL,
  CHATGPT_TOOL_DEFINITIONS,
  runChatgptTool,
} from './providers/chatgpt/index.mjs';
export {
  GrokImagineClient,
  IMAGINE_MODES,
  GROK_URL,
  GROK_ORIGIN,
  GROK_IMAGINE_URL,
  IMAGINE_MODE_LABELS,
  IMAGINE_RATIOS,
  GROK_TOOL_DEFINITIONS,
  runGrokTool,
} from './providers/grok/index.mjs';
export {
  XyqClient,
  XYQ_URL,
  XYQ_ORIGIN,
  DEFAULT_SEEDREAM_MODEL,
  SEEDREAM_MODELS,
  SEEDREAM_MODEL_IDS,
  EDITOR_SEL as XYQ_EDITOR_SEL,
  XYQ_TOOL_DEFINITIONS,
  runXyqTool,
} from './providers/xyq/index.mjs';
export {
  QianwenClient,
  QIANWEN_URL,
  QIANWEN_ORIGIN,
  QIANWEN_MODES,
  QIANWEN_MODE_IDS,
  EDITOR_SEL as QIANWEN_EDITOR_SEL,
  QIANWEN_TOOL_DEFINITIONS,
  runQianwenTool,
} from './providers/qianwen/index.mjs';
