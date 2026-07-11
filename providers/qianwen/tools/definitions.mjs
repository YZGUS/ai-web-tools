/**
 * 千问对外 Tool 定义（CLI / Bot / function-calling）
 *
 * 对齐 Gemini / Grok：
 * - qianwen_chat / qianwen_research / qianwen_task
 * - web_research_qianwen / web_task_qianwen 通用别名
 */

/** @typedef {{ name: string, description: string, parameters: object, method: string }} ToolDef */

/** @type {ToolDef[]} */
export const QIANWEN_TOOL_DEFINITIONS = [
  {
    name: 'qianwen_chat',
    description:
      '千问网页对话（qianwen.com/chat）。mode=chat|think|research|task；research/task 为长任务（可达十余分钟）。',
    method: 'chat',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '用户消息 / 任务描述' },
        mode: {
          type: 'string',
          enum: ['chat', 'think', 'research', 'task'],
          description:
            'chat 普通；think 思考；research 研究模式（长）；task 任务助理（长）',
        },
        new_chat: { type: 'boolean', description: '是否新建对话，默认 true' },
        timeout_ms: {
          type: 'number',
          description: '超时毫秒；research/task 建议 ≥ 600000',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'qianwen_research',
    description:
      '千问研究模式：深度调研并生成研究报告。执行很长（常约 10 分钟+），完成检测会等待「正在*」进度结束，勿过早打断。',
    method: 'research',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '研究主题 / 问题' },
        new_chat: { type: 'boolean' },
        timeout_ms: {
          type: 'number',
          description: '默认 900000（15 分钟）',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'qianwen_task',
    description:
      '千问任务助理：多步骤执行复杂任务。执行时间很长，完成检测会等待进度「正在*」结束。',
    method: 'taskAssistant',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '任务描述' },
        new_chat: { type: 'boolean' },
        timeout_ms: {
          type: 'number',
          description: '默认 900000（15 分钟）',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_research_qianwen',
    description: '网页深度研究（千问研究模式，与 gemini web_research 并列）',
    method: 'research',
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
    name: 'web_task_qianwen',
    description: '网页任务助理（千问任务助理）',
    method: 'taskAssistant',
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
    name: 'qianwen_explore',
    description: '探测千问页面：模式胶囊、编辑器、长任务能力（不发送）',
    method: 'explore',
    parameters: { type: 'object', properties: {} },
  },
];
