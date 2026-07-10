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
