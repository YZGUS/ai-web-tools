/**
 * ai-web-tools 统一错误类型
 */

/**
 * 工具 / 提供方执行失败时抛出
 */
export class AiWebError extends Error {
  /**
   * @param {string} message - 人类可读错误信息
   * @param {{ code?: string, cause?: unknown, screenshot?: string, provider?: string }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = 'AiWebError';
    /** @type {string} 稳定错误码，供 Bot 分支处理 */
    this.code = opts.code || 'AI_WEB_ERROR';
    /** @type {string|undefined} 失败时截图路径 */
    this.screenshot = opts.screenshot;
    /** @type {string|undefined} 提供方 id，如 gemini */
    this.provider = opts.provider;
  }
}

/** @deprecated 兼容别名 */
export const PageToolError = AiWebError;
