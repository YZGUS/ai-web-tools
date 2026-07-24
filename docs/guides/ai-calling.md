# AI 调用指南

> 结论：**本项目完整支持 AI / Agent function-calling 调用。**  
> 推荐入口：`listWebTools` + `runWebTool`（不要直接绑各 Provider Client）。

---

## 1. 支持什么

本仓库把各 AI **网页产品**（已登录的浏览器会话）封装成统一 tool，供：

| 调用方 | 状态 | 入口 |
|--------|------|------|
| **Agent / LLM function-calling** | ✅ 就绪 | `listWebTools` / `runWebTool` |
| **CLI / 脚本** | ✅ 就绪 | `npm run cli -- tool …` |
| **编程 Client** | ✅ 就绪 | `GeminiClient` / `ChatgptClient` / … |
| **Telegram Bot** | 📄 部分 | `interfaces/telegram/tools.manifest.json` |
| Claude 网页 | ❌ 未实现 | 仅文档 |

当前可注册 tool：**29 个**（`npm run cli -- tools` 可查看）。

```text
Agent / Bot
  └─ listWebTools() + runWebTool()     ← 推荐唯一集成层
       └─ runGeminiTool / runChatgptTool / runGrokTool / …
            └─ XxxClient（CDP 附着调试 Chrome）
                 └─ runtime/sessions · runtime/media
```

**注意**：这不是官方 REST API，而是本机 Chrome 远程调试（CDP）驱动网页自动化。调用前必须：

1. `npm run chrome:start` 启动调试 Chrome  
2. 在该 profile 中登录目标站点（gemini / chatgpt / grok / xyq / qianwen）  
3. `npm run probe` 确认 CDP 可达  

---

## 2. 前置准备

```bash
cd /Users/cengyi/Desktop/tools/ai-web-tools
npm install
npm run chrome:start    # 启动带远程调试的 Chrome
npm run chrome:check    # 可选：检查端口
npm run probe           # 确认 CDP ok
```

在弹出的 Chrome 里登录要用的 AI 网站，保持窗口运行。

---

## 3. 三种调用方式

### 方式 A：Agent 统一入口（推荐）

适合 Cursor Agent、自研 Agent、任何 function-calling 框架。

```js
import {
  listWebTools,
  runWebTool,
  agentResultToString,
} from 'ai-web-tools'; // 或 './index.mjs'

// ① 注册：把 schema 交给 LLM
const tools = listWebTools();
// tools[i] = { name, description, parameters, method }

// ② 执行：模型返回 tool_call 后
const r = await runWebTool({
  name: 'qianwen_chat',
  arguments: { prompt: '你好', new_chat: true },
});

// ③ 回传：优先用 r.content
r.ok;          // boolean
r.content;     // 给 LLM 的主文案
r.text;        // 对话/研究正文
r.files;       // [{ path, kind: 'image'|'video'|'file' }]
r.imagePath;   // 生图路径
r.error;       // 失败时 { code, message, screenshot? }

// 只接受 string 的 runtime：
agentResultToString(r); // ≈ r.content
```

失败默认**不抛异常**，返回 `{ ok: false, content, error }`，方便 Agent 继续推理：

```js
await runWebTool(call, { throwOnError: true }); // 需要 throw 时
```

**伪代码（接到 tool_call 时）**：

```js
async function handleToolCall(name, args) {
  const r = await runWebTool({ name, arguments: args });
  return { role: 'tool', name, content: r.content };
}
```

最小可运行示例：

```bash
npm run example:agent-result              # 无浏览器，看结果形态
npm run example:agent-result -- --live-chat  # 真实调千问（需已登录）
```

更细的字段约定见 [agent-tools.md](./agent-tools.md)。

---

### 方式 B：CLI（调试 / 脚本）

与 Agent **同构**（内部也走 `runWebTool`）：

```bash
# 列出全部 tool
npm run cli -- tools

# 统一 tool 调用
npm run cli -- tool qianwen_chat --arg prompt=你好
npm run cli -- tool xyq_image --arg prompt=水彩猫 --arg model=lite
npm run cli -- tool web_image --arg prompt=一只猫
npm run cli -- tool grok_imagine_image --arg prompt=水彩猫 --arg ratio=1:1

# 提供方子命令（等价快捷方式）
npm run gemini:chat -- "你好" --new --new-tab
npm run chatgpt:image -- "水彩橘猫"
npm run grok:image -- "水彩橘猫" --ratio 1:1
npm run grok:video -- "海浪拍岸" --resolution 480p --duration 6s
npm run xyq:image -- "水彩橘猫"                    # 默认 lite
npm run xyq:image -- "图1人物" --model lite --ref a.png
npm run qianwen:research -- "简要调研 RISC-V，列三点"
npm run qianwen:task -- "写一份技术周报大纲"
```

输出为 JSON，含 `ok` / `content` / `text` / `files` 等 Agent 标准字段。

---

### 方式 C：直接用 Provider Client（脚本调试）

适合单站联调；**Agent 集成请仍走方式 A**。

```js
import {
  connectBrowser,
  closeBrowser,
  GeminiClient,
  ChatgptClient,
  GrokImagineClient,
  XyqClient,
  QianwenClient,
} from './index.mjs';

const browser = await connectBrowser();
try {
  const g = await GeminiClient.attach(browser, { forceNewTab: true });
  console.log((await g.chat('你好', { newChat: true })).reply);

  const c = await ChatgptClient.attach(browser, { forceNewTab: true });
  console.log((await c.generateImage('水彩橘猫')).imagePath);

  const qw = await QianwenClient.attach(browser, { forceNewTab: true });
  console.log((await qw.research('简要调研 RISC-V')).reply?.slice(0, 120));
} finally {
  await closeBrowser(browser);
}
```

---

## 4. Tool 清单（按提供方）

### Gemini（`gemini_*` / 部分 `web_*`）

| name | 能力 |
|------|------|
| `gemini_chat` | 对话 |
| `gemini_generate` | image / video / music / research / canvas |
| `web_image` / `web_video` / `web_music` / `web_research` / `web_canvas` | 上列能力的快捷别名 |
| `gemini_set_mode` | flash-lite / flash / pro / thinking |
| `gemini_explore` / `gemini_list_modes` / `gemini_list_tools` | 探测 |

### ChatGPT

| name | 能力 |
|------|------|
| `chatgpt_chat` | 对话 |
| `chatgpt_image` / `web_image_chatgpt` | Images 2.0 生图（可 `ref_images`） |
| `chatgpt_explore` | 探测 |

### Grok Imagine

| name | 能力 |
|------|------|
| `grok_imagine_image` | 文生图（ratio / quality / preset / 多参考图） |
| `grok_imagine_video` | 文生视频（480p/720p，6s/10s） |
| `grok_imagine` | 统一入口 `mode=image\|video\|agent` |
| `grok_imagine_explore` | 探测 |

### 小云雀 Seedream（xyq）

| name | 能力 |
|------|------|
| `xyq_image` / `web_image_xyq` | Seedream 5.0；默认 **lite + 1K**（无会员可验） |
| `xyq_credits` | 积分 |
| `xyq_explore` | 探测 |

### 千问

| name | 能力 |
|------|------|
| `qianwen_chat` | 对话；`mode=chat\|think\|research\|task` |
| `qianwen_research` / `web_research_qianwen` | 研究模式（长任务，默认超时 15min） |
| `qianwen_task` / `web_task_qianwen` | 任务助理（长任务） |
| `qianwen_explore` | 探测 |

路由规则（`resolveToolProvider`）：按 name 前缀 / 别名分发到对应 `runXxxTool`。未知 name 返回 `{ ok: false, error }`。

---

## 5. 结果字段约定

| 场景 | 读什么 |
|------|--------|
| 回给 LLM | **`content`**（或 `agentResultToString(r)`） |
| 对话 / 研究正文 | `text` |
| 生图 / 生视频 | `imagePath` / `videoPath` + `files[]` |
| 落盘会话 | `sessionDir`（`runtime/sessions/`） |
| 失败 | `ok === false`，`error.code` / `error.message` |

长正文会截断到约 12_000 字并提示看 session 落盘。

---

## 6. 接到真实 Agent 的最小步骤

1. 启动调试 Chrome 并登录站点  
2. `const tools = listWebTools()` → 转成你用的 schema（OpenAI tools / Anthropic tools / …）  
3. 模型发起 tool_call 时调用 `runWebTool({ name, arguments })`  
4. 把 `r.content` 写回 messages 作为 tool result  
5. 若需要落库媒体，额外读 `r.files`  

CLI 自测通过后再接 Agent：

```bash
npm run cli -- tool gemini_chat --arg prompt=只回复：ok
npm run cli -- tool xyq_image --arg prompt=水彩猫 --arg model=lite
```

---

## 7. 相关文档

| 文档 | 说明 |
|------|------|
| [agent-tools.md](./agent-tools.md) | Agent 结果字段细节 |
| [getting-started.md](./getting-started.md) | 环境与入门 |
| [../design/tools-catalog.md](../design/tools-catalog.md) | 工具命名与产品视角目录 |
| [../design/providers.md](../design/providers.md) | 提供方能力矩阵 |
| 各站指南 | [gemini](./gemini.md) · [chatgpt](./chatgpt.md) · [grok](./grok.md) · [xyq](./xyq.md) · [qianwen](./qianwen.md) |

---

## 8. 一句话总结

**支持 AI 调用。** 先起调试 Chrome 并登录，再用 `listWebTools` 注册、`runWebTool` 执行；CLI 的 `tool` / `tools` 子命令与 Agent 同构，便于联调。
