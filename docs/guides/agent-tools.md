# 给 Agent 用的 Web Tools

本仓库所有网页自动化能力，最终形态是 **Agent function-calling tools**。  
Agent 侧**不要**直接 import 各 Client，应使用统一入口拿结果。

## 入口

```js
import {
  listWebTools,   // schema 列表，注册到 Agent
  runWebTool,     // 执行 tool，返回标准结果
  agentResultToString,
} from 'ai-web-tools'; // 或 './index.mjs'
```

## 注册 tools

```js
const tools = listWebTools();
// tools[i] = { name, description, parameters, method }
// 转成 OpenAI / Anthropic / 自研 schema 即可
```

CLI 查看：

```bash
npm run cli -- tools
```

## 执行并拿结果

```js
const r = await runWebTool({
  name: 'qianwen_research',
  arguments: {
    prompt: '调研 RISC-V 生态，列三点',
    timeout_ms: 900_000,
  },
});

// ── Agent 应优先读这些字段 ──
r.ok          // boolean
r.content     // string：给 LLM 的主文案（已拼好）
r.text        // string|null：对话/研究正文
r.files       // [{ path, kind: 'image'|'video'|'file', mime? }]
r.imagePath   // 生图时的本地路径
r.videoPath
r.error       // 失败时 { code, message, screenshot? }

// 可选
r.sessionDir  // 完整会话落盘目录
r.elapsedMs
r.model
r.credit
r.data        // 其它精简字段
```

### 只接受 string 的 runtime

```js
const toolResultString = agentResultToString(r);
// 等价于 r.content（失败时也是可读错误句）
```

### 失败默认不抛

`runWebTool` **默认**把错误收成 `{ ok: false, content, error }`，方便 Agent 继续推理。

```js
// 需要 throw 时：
await runWebTool(call, { throwOnError: true });
```

## 结果类型对照

| tool 类型 | `content` 里有什么 | 结构化字段 |
|-----------|-------------------|------------|
| 对话 / 研究 / 任务 | 正文 | `text` |
| 生图 | 路径说明 | `imagePath` + `files[]` |
| 生视频 | 路径说明 | `videoPath` + `files[]` |
| 积分 / explore | 摘要 | `credit` / `data` |
| 失败 | `工具调用失败：…` | `error` |

## Agent 伪代码

```js
async function handleToolCall(name, args) {
  const r = await runWebTool({ name, arguments: args });
  // 原样塞回 messages 作为 tool result
  return {
    role: 'tool',
    name,
    content: r.content, // 或 JSON.stringify(r)
  };
}
```

推荐：`content: r.content` 给模型读；若上层还要落库图片，用 `r.files` / `r.imagePath`。

## 与底层 Client 的关系

```text
Agent
  └─ runWebTool / listWebTools     ← 只用这一层
       └─ runGeminiTool / runXyqTool / …
            └─ XxxClient（CDP 页面自动化）
                 └─ SessionLog + runtime/media
```

直接 `QianwenClient.chat()` 仍可用（脚本调试），但 **Agent 集成请走 `runWebTool`**，保证结果形态统一。

## CLI 调试

```bash
# Agent 同构调用
npm run cli -- tool qianwen_chat --arg prompt=你好
npm run cli -- tool xyq_image --arg prompt=水彩猫 --arg model=lite
npm run cli -- tool web_image --arg prompt=一只猫

# 结果 JSON 含 content / text / files
```
