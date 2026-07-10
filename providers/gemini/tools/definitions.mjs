/**
 * Gemini 对外 Tool 定义（供 app/router、Telegram、function-calling 注册）
 *
 * 命名与 catalog 对齐，实现绑定到 GeminiClient 方法。
 */

/** @typedef {{ name: string, description: string, parameters: object, method: string }} ToolDef */

/** @type {ToolDef[]} */
export const GEMINI_TOOL_DEFINITIONS = [
  {
    name: 'gemini_chat',
    description: '向 Gemini 网页发送消息并等待完整回复（需本机调试 Chrome 已登录）',
    method: 'chat',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '用户消息' },
        new_chat: { type: 'boolean', description: '是否新开对话' },
        timeout_ms: { type: 'number', description: '等待超时毫秒' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'gemini_generate',
    description:
      'Gemini 工具生成：image 图片 / video 视频 / music 音乐 / research 研究 / canvas 画布',
    method: 'generateWithTool',
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: ['image', 'video', 'music', 'research', 'canvas'],
        },
        prompt: { type: 'string' },
        new_chat: { type: 'boolean' },
        timeout_ms: { type: 'number' },
      },
      required: ['tool', 'prompt'],
    },
  },
  {
    name: 'gemini_explore',
    description: '探测当前账号可见模式、工具菜单与多媒体能力（不发送消息）',
    method: 'explore',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'gemini_set_mode',
    description: '切换模型模式：flash-lite | flash | pro | thinking',
    method: 'setMode',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['flash-lite', 'flash', 'pro', 'thinking'],
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'gemini_list_modes',
    description: '列出可用模型模式',
    method: 'listModes',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'gemini_list_tools',
    description: '列出「上传和工具」菜单项',
    method: 'listTools',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'web_image',
    description: '文生图（Gemini 制作图片）',
    method: 'generateWithTool',
    fixedArgs: { tool: 'image' },
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        new_chat: { type: 'boolean' },
        timeout_ms: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_video',
    description: '文生视频（Gemini 制作视频）',
    method: 'generateWithTool',
    fixedArgs: { tool: 'video' },
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        new_chat: { type: 'boolean' },
        timeout_ms: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_music',
    description: '生成音乐（Gemini / Lyria）',
    method: 'generateWithTool',
    fixedArgs: { tool: 'music' },
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        new_chat: { type: 'boolean' },
        timeout_ms: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_research',
    description: 'Deep Research 深度研究',
    method: 'generateWithTool',
    fixedArgs: { tool: 'research' },
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        new_chat: { type: 'boolean' },
        timeout_ms: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_canvas',
    description: 'Gemini Canvas',
    method: 'generateWithTool',
    fixedArgs: { tool: 'canvas' },
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        new_chat: { type: 'boolean' },
        timeout_ms: { type: 'number' },
      },
      required: ['prompt'],
    },
  },
];
