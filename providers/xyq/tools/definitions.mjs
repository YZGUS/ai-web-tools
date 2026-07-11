/**
 * 小云雀对外 Tool 定义（供 CLI / Bot / function-calling 注册）
 *
 * 对齐 Gemini / Grok / ChatGPT：
 * - 提供方专用：xyq_*
 * - 通用别名：web_image_xyq（与 web_image / web_image_chatgpt 并列）
 *
 * 约定：默认 model=lite + 分辨率 1K（无会员验证流程）；pro 多需会员。
 */

/** @typedef {{ name: string, description: string, parameters: object, method: string, fixedArgs?: object }} ToolDef */

/** @type {ToolDef[]} */
export const XYQ_TOOL_DEFINITIONS = [
  {
    name: 'xyq_image',
    description:
      '小云雀 Seedream 5.0 文生图（xyq.jianying.com）。仅 pro/lite，默认 lite+1K。支持多参考图（@ 引用 / 上传）。无会员请用 lite。',
    method: 'generateImage',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '生图描述；多图时可写明「第一张人物、第二张场景」等顺序',
        },
        model: {
          type: 'string',
          enum: ['lite', 'pro'],
          description:
            '默认 lite。lite=Seedream 5.0 Lite（免费积分可验证）；pro=Seedream 5.0 Pro（多需会员）',
        },
        ref_images: {
          type: 'array',
          items: { type: 'string' },
          description: '本地参考图路径（多图，对应页面上传 / @ 素材）',
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
    name: 'web_image_xyq',
    description:
      '文生图（小云雀 Seedream 5.0，与 gemini 的 web_image / chatgpt 的 web_image_chatgpt 并列）',
    method: 'generateImage',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string', enum: ['lite', 'pro'] },
        ref_images: { type: 'array', items: { type: 'string' } },
        timeout_ms: { type: 'number' },
        filename: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'xyq_credits',
    description: '读取小云雀积分余额（free_credits / 总额等）',
    method: 'getCredits',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'xyq_explore',
    description:
      '探测小云雀生图页：积分、Pro/Lite 是否可见、@ 引用与上传能力（不强制生图）',
    method: 'explore',
    parameters: { type: 'object', properties: {} },
  },
];
