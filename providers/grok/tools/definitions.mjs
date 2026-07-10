/**
 * Grok Imagine 对外 Tool 定义
 */

/** @typedef {{ name: string, description: string, parameters: object, method: string }} ToolDef */

/** @type {ToolDef[]} */
export const GROK_TOOL_DEFINITIONS = [
  {
    name: 'grok_imagine_image',
    description:
      'Grok Imagine 文生图（https://grok.com/imagine/，可选多参考图、宽高比、预设）',
    method: 'generateImage',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        ref_images: {
          type: 'array',
          items: { type: 'string' },
          description: '参考图本地路径，可多张',
        },
        ratio: {
          type: 'string',
          enum: ['2:3', '3:2', '1:1', '9:16', '16:9'],
        },
        quality: { type: 'string', enum: ['speed', 'quality'] },
        preset: { type: 'string', description: '精选模板名，如 Chibi' },
        timeout_ms: { type: 'number' },
        filename: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'grok_imagine_video',
    description:
      'Grok Imagine 文生视频（可选分辨率 480p/720p、时长 6s/10s、参考图）',
    method: 'generateVideo',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        ref_images: { type: 'array', items: { type: 'string' } },
        resolution: { type: 'string', enum: ['480p', '720p'] },
        duration: { type: 'string', enum: ['6s', '10s'] },
        ratio: {
          type: 'string',
          enum: ['2:3', '3:2', '1:1', '9:16', '16:9'],
        },
        timeout_ms: { type: 'number' },
        filename: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'grok_imagine',
    description: 'Grok Imagine 统一入口（mode=image|video|agent）',
    method: 'generate',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        mode: { type: 'string', enum: ['image', 'video', 'agent'] },
        ref_images: { type: 'array', items: { type: 'string' } },
        ratio: { type: 'string' },
        quality: { type: 'string' },
        resolution: { type: 'string' },
        duration: { type: 'string' },
        preset: { type: 'string' },
        timeout_ms: { type: 'number' },
        filename: { type: 'string' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'grok_imagine_explore',
    description: '探测 Grok Imagine 页面能力（不生成）',
    method: 'explore',
    parameters: { type: 'object', properties: {} },
  },
];
