/**
 * ChatGPT 网页选择器与 URL 常量
 * 实测：主站对话 + https://chatgpt.com/images/（Images 2.0）
 */

export const CHATGPT_URL = 'https://chatgpt.com/';
export const CHATGPT_ORIGIN = 'https://chatgpt.com';
export const CHATGPT_IMAGES_URL = 'https://chatgpt.com/images/';

/** 主站与 Images 共用输入框 */
export const EDITOR_SEL =
  '#prompt-textarea, div.ProseMirror[contenteditable="true"]';

export const SEND_BTN_SEL = '[data-testid="send-button"]';
export const STOP_BTN_SEL = '[data-testid="stop-button"]';
export const PLUS_BTN_SEL = '[data-testid="composer-plus-btn"]';

/** 助手消息（主站 chat） */
export const ASSISTANT_MSG_SEL = '[data-message-author-role="assistant"]';

/** Images 会话轮次 */
export const CONVERSATION_TURN_SEL = '[data-testid^="conversation-turn-"]';

/** 生图完成反馈按钮（喜欢图片） */
export const GOOD_IMAGE_BTN_SEL =
  '[data-testid="good-image-turn-action-button"]';

/** Images 参考图上传（主 input） */
export const IMAGES_FILE_INPUT_SEL =
  'input[name="images-app-drop-container-input"]';

/** 备用参考图 input */
export const UPLOAD_PHOTOS_SEL =
  'input[data-testid="upload-photos-input"], #upload-photos';

/**
 * 生成图 URL 特征：需带登录 cookie 下载
 * 形如 /backend-api/estuary/content?id=file_…
 */
export const GENERATED_IMG_SRC_RE = /estuary\/content/i;
export const GENERATED_IMG_ALT_RE = /已生成图片|Generated/i;
