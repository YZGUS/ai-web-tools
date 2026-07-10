/**
 * ai-web-tools 包入口
 *
 * @example
 * import { connectBrowser, closeBrowser, GeminiClient } from './index.mjs';
 * const browser = await connectBrowser();
 * const gemini = await GeminiClient.attach(browser, { forceNewTab: true });
 * const r = await gemini.chat('你好', { newChat: true });
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
