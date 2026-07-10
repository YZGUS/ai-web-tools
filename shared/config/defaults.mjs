/**
 * 全局默认配置
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 包根目录：ai-web-tools/ */
export const PKG_ROOT = path.resolve(HERE, '../..');

/** 运行时数据根目录 */
export const RUNTIME_ROOT = path.join(PKG_ROOT, 'runtime');

/** 会话落盘根目录 */
export const SESSIONS_ROOT = path.join(RUNTIME_ROOT, 'sessions');

/** 媒体产物根目录 */
export const MEDIA_ROOT = path.join(RUNTIME_ROOT, 'media');

/**
 * Chrome 远程调试地址
 * @type {string}
 */
export const DEFAULT_CDP_URL =
  process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';

/** 默认页面操作超时（毫秒） */
export const DEFAULT_TIMEOUT_MS = 90_000;

/** 默认等待模型回复超时（毫秒） */
export const DEFAULT_REPLY_TIMEOUT_MS = 120_000;
