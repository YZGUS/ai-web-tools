/**
 * Gemini 页面选择器与文案常量
 * UI 变更时优先只改本文件
 */

/** 应用入口 URL */
export const GEMINI_URL = 'https://gemini.google.com/app';

/** origin，用于权限 override */
export const GEMINI_ORIGIN = 'https://gemini.google.com';

/**
 * 主输入框选择器（中英文 UI 兼容）
 * - rich-textarea Quill 编辑器
 * - contenteditable textarea
 */
export const EDITOR_SEL =
  'rich-textarea .ql-editor, div[contenteditable="true"].textarea, div[contenteditable="true"][role="textbox"]';

/**
 * 「上传和工具」菜单项别名 → 界面可见文案（中/英）
 * 用于 selectTool('image') 等模糊匹配
 */
export const GEMINI_TOOLS = {
  upload: ['上传文件', 'Upload file', 'Upload files'],
  drive: ['从云端硬盘添加', 'Add from Drive'],
  photos: ['相册', 'Google 相册', 'Google Photos', 'Photos'],
  code: ['导入代码', 'Import code'],
  notebooks: ['Notebooks', '笔记本'],
  image: ['制作图片', 'Create image', 'Create images'],
  video: ['制作视频', 'Create video', 'Create videos'],
  music: [
    '制作音乐',
    'Create music',
    'Make music',
    '生成音乐',
    'Music',
    '音乐',
    '音频',
    'Audio',
  ],
  canvas: ['Canvas'],
  research: ['Deep Research', '深度研究', '深入研究'],
};

/**
 * 模型模式别名 → 菜单文案片段
 * setMode('pro') / setMode('thinking') 等
 */
export const GEMINI_MODES = {
  'flash-lite': ['Flash-Lite', '3.1 Flash-Lite', '极速'],
  flash: ['Flash', '3.5 Flash', '全方位'],
  pro: ['Pro', '3.1 Pro', '高等数学'],
  thinking: ['扩展思考', 'Thinking', '复杂问题'],
};
