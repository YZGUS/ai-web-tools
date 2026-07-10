/**
 * shared 公共导出
 */
export { AiWebError, PageToolError } from './types/errors.mjs';
export {
  PKG_ROOT,
  RUNTIME_ROOT,
  SESSIONS_ROOT,
  MEDIA_ROOT,
  DEFAULT_CDP_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_REPLY_TIMEOUT_MS,
} from './config/defaults.mjs';
export { sleep } from './util/sleep.mjs';
export {
  probeCdp,
  connectBrowser,
  closeBrowser,
  getPage,
  getOrCreatePage,
  applyStealth,
} from './browser/connect.mjs';
export { SessionLog } from './session/session-log.mjs';
