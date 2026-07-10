/**
 * ChatGPT 对外 Tool 定义（供 CLI / Bot / function-calling 注册）
 */

/** @typedef {{ name: string, description: string, parameters: object, method: string, fixedArgs?: object }} ToolDef */

/** @type {ToolDef[]} */
export const CHATGPT_TOOL_DEFINITIONS = [
  {
    name: 'chatgpt_chat',
    description:
      '向 ChatGPT 网页发送消息并等待完整回复（需本机调试 Chrome 已登录 chatgpt.com）',
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
    name: 'chatgpt_image',
    description:
      'ChatGPT Images 2.0 文生图（打开 https://chatgpt.com/images/，可选参考图）',
    method: 'generateImage',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '生图描述' },
        ref_images: {
          type: 'array',
          items: { type: 'string' },
          description: '参考图本地路径列表（可选）',
        },
        timeout_ms: {
          type: 'number',
          description: '生图等待超时毫秒，默认 300000',
        },
        filename: {
          type: 'string',
          description: '保存文件名（不含扩展名）',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'chatgpt_explore',
    description: '探测 ChatGPT Images / 对话页是否就绪（不发送消息）',
    method: 'explore',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'web_image_chatgpt',
    description: '文生图（ChatGPT Images 2.0，与 gemini 的 web_image 并列）',
    method: 'generateImage',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        ref_images: {
          type: 'array',
          items: { type: 'string' },
        },
        timeout_ms: { type: 'number' },
        filename: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
];
