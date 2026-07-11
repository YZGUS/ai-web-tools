/**
 * 千问（qianwen.com/chat）选择器与模式常量
 *
 * 重点能力：
 * - 普通对话
 * - 研究模式（aria-label=研究，长任务 ~10min+）
 * - 任务助理（aria-label=任务助理，长任务）
 */

export const QIANWEN_URL = 'https://www.qianwen.com/chat';
export const QIANWEN_ORIGIN = 'https://www.qianwen.com';
export const QIANWEN_URL_INCLUDES = 'qianwen.com';

/** 输入框 */
export const EDITOR_SEL =
  'div[contenteditable="true"], textarea, [role="textbox"][contenteditable="true"]';

/** 发送 / 停止 */
export const SEND_BTN_SEL = 'button[aria-label="发送消息"]';
export const STOP_BTN_RE = /停止|Stop/i;
export const TERMINATE_TASK_RE = /终止任务|停止任务|取消任务/;

/** 回复容器（sea-queen-sim 已验证） */
export const ANSWER_SEL =
  '.message-select-wrapper-answer, .chat-answers-card-wrap';
export const ANSWER_MD_SEL =
  '.message-select-wrapper-answer .qk-markdown, .chat-answers-card-wrap .qk-markdown, .qk-markdown';
export const MD_TEXT_SEL = '.qk-md-text';
export const MD_INCOMPLETE_SEL = '.qk-md-text:not(.complete)';

/**
 * 工具条胶囊模式（button[aria-label][aria-pressed]）
 * 研究 / 任务助理 执行时间很长，完成检测见 client waitForLongTask
 */
export const QIANWEN_MODES = Object.freeze({
  chat: {
    id: 'chat',
    label: null,
    description: '普通对话',
    longRunning: false,
    defaultTimeoutMs: 180_000,
    minWaitMs: 2_000,
  },
  think: {
    id: 'think',
    label: '思考',
    description: '思考模式',
    longRunning: false,
    defaultTimeoutMs: 300_000,
    minWaitMs: 3_000,
  },
  research: {
    id: 'research',
    label: '研究',
    description: '研究模式：先出调研计划，后台执行约 10 分钟，侧栏「研究过程」',
    longRunning: true,
    defaultTimeoutMs: 900_000,
    minWaitMs: 45_000,
    stablePolls: 5,
  },
  task: {
    id: 'task',
    label: '任务助理',
    description: '任务助理：多步骤执行长任务',
    longRunning: true,
    defaultTimeoutMs: 900_000,
    minWaitMs: 30_000,
    stablePolls: 5,
  },
});

export const QIANWEN_MODE_IDS = Object.freeze(
  Object.keys(QIANWEN_MODES),
);

/** 仍在执行的进度文案（长任务专用，勿用全文「研究完成」子串误判） */
export const RUNNING_PHRASE_RE =
  /正在(分析|评估|撰写|生成|检索|研究|阅读|执行|搜集|调研|搜索|整理|汇总|规划|处理|运行|计算|编写|制作|可视化)/;

export const PLAN_HINT_RE =
  /研究过程大约需要|研究完成后我会发送消息|任务完成后我会|你可以继续向我提问或离开对话/;
