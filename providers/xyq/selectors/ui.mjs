/**
 * 小云雀（xyq.jianying.com）选择器与模型常量
 *
 * 约定：生图仅暴露 Seedream 5.0 Pro / Lite。
 * 默认走 Lite：无会员时 Pro 易触发「仅会员可用」；流程验证用 lite + 1K。
 */

export const XYQ_URL = 'https://xyq.jianying.com/home?tab_name=home';
export const XYQ_ORIGIN = 'https://xyq.jianying.com';
export const XYQ_URL_INCLUDES = 'xyq.jianying.com';

/** 默认生图模型（无会员验证流程） */
export const DEFAULT_SEEDREAM_MODEL = 'lite';

/** 仅允许的生图模型 */
export const SEEDREAM_MODELS = Object.freeze({
  lite: {
    id: 'lite',
    value: 'seedream_5.0',
    label: 'Seedream 5.0 Lite',
    match: /Seedream\s*5\.0\s*Lite/i,
    description: '指令响应与逻辑推理；免费积分可验证流程（配合 1K）',
    membershipRequired: false,
  },
  pro: {
    id: 'pro',
    value: 'seedream_5.0_pro',
    label: 'Seedream 5.0 Pro',
    match: /Seedream\s*5\.0\s*Pro/i,
    description: '交互式编辑，精准改图；当前多需会员',
    membershipRequired: true,
  },
});

export const SEEDREAM_MODEL_IDS = Object.freeze(['lite', 'pro']);

/** 输入框：tiptap ProseMirror */
export const EDITOR_SEL =
  'div.tiptap.ProseMirror[contenteditable="true"], [contenteditable="true"].ProseMirror, [contenteditable="true"]';

/** 隐藏上传：支持多图/视频/音频/文档；生图参考优先 image/* */
export const FILE_INPUT_SEL = 'input.hiddenInput-JzJCuN[type="file"], input[type="file"][accept*="image"]';

/** 发送按钮 */
export const SEND_BTN_SEL = 'button[aria-label="开始生成"]';

/** 积分相关 API（同源） */
export const API = Object.freeze({
  userCredit: '/commerce/v1/benefits/user_credit',
  creditReceive: '/commerce/v1/benefits/credit_receive',
  creditHistory: '/commerce/v1/benefits/user_credit_history',
});
