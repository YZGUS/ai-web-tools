# ai-web-tools

**AI Web 端常用工具** 集成项目：把各 AI 网页产品（对话、生图、生视频、研究等）封装成统一工具，供 CLI / 脚本 / **Telegram Bot** 调用。

| 项 | 值 |
|----|-----|
| 包名 | `ai-web-tools` |
| 路径 | `tools/ai-web-tools` |
| 阶段 | **Gemini / ChatGPT / Grok / 小云雀 / 千问** 已实现；Claude 待办 |

## 解决什么问题

在浏览器里已经登录的 AI 站点上，用自动化执行「常用能力」，并对外暴露稳定接口：

- **对话**：Gemini / ChatGPT（Grok / 千问 / Claude 规划中）  
- **生成类**：Gemini 多模态 · ChatGPT Images · Grok Imagine · **小云雀 Seedream 5.0**  
- **可观测**：任务进行中 / 已完成 / 失败；对话可落盘  
- **Bot 就绪**：上层只认 tool 名与参数，不碰 DOM  

## 设计文档

| 文档 | 说明 |
|------|------|
| [docs/design/architecture.md](./docs/design/architecture.md) | 分层与依赖 |
| [docs/design/directory.md](./docs/design/directory.md) | 目录树与职责 |
| [docs/design/tools-catalog.md](./docs/design/tools-catalog.md) | 工具目录与命名 |
| [docs/design/providers.md](./docs/design/providers.md) | 提供方能力矩阵 |

## 结构速览

```text
ai-web-tools/
  shared/          公共内核（browser / session / types）
  providers/       AI 网页提供方（gemini · grok · chatgpt · xyq · …）
  catalog/         面向用户的「工具目录」定义（chat / image / video…）
  app/             路由：工具 → 提供方能力
  interfaces/      cli · telegram
  tests/           冒烟 · 分提供方 · 集成
  runtime/         运行时 sessions / media / logs（gitignore）
  docs/design/     本阶段文档
```

## 提供方（providers）

| id | 站点 | 首期重点 |
|----|------|----------|
| `gemini` | gemini.google.com | 对话 + 多模态工具 |
| `chatgpt` | chatgpt.com | 对话 + Images 2.0 生图 |
| `grok` | grok.com/imagine | 文生图 / 多参考图 / 视频 |
| `xyq` | xyq.jianying.com | Seedream 5.0 Lite/Pro + @ 参考图 |
| `qianwen` | qianwen.com/chat | 对话 · **研究模式** · **任务助理**（长任务） |
| `claude` | claude.ai | 对话（待实现） |

## 快速开始

```bash
cd /Users/cengyi/Desktop/tools/ai-web-tools
npm install
npm run chrome:start
# 调试 Chrome 登录对应站点

npm run probe

# Gemini
node interfaces/cli/cli.mjs gemini chat "你好" --new --new-tab
node interfaces/cli/cli.mjs gemini gen image "一只猫" --new

# ChatGPT Images 2.0
npm run chatgpt:image -- "水彩橘猫"

# Grok Imagine
npm run grok:image -- "水彩橘猫" --ratio 1:1
npm run grok:video -- "海浪拍岸" --resolution 480p --duration 6s

# 小云雀 Seedream（默认 lite + 1K，无会员可验证）
npm run xyq:image -- "水彩橘猫"
npm run xyq:image -- "图1人物图2场景" --model lite --ref a.png --ref b.png
npm run test:xyq:e2e
npm run test:xyq:bot

# 千问：研究 / 任务助理（长任务，默认超时 15min）
npm run qianwen:research -- "简要调研 RISC-V 生态，列三点"
npm run qianwen:task -- "写一份技术周报大纲"
npm run test:qianwen:bot -- --schema-only

npm run status
```

代码：

```js
import {
  connectBrowser,
  closeBrowser,
  GeminiClient,
  ChatgptClient,
  GrokImagineClient,
  XyqClient,
  QianwenClient,
  runXyqTool,
} from './index.mjs';

const browser = await connectBrowser();
try {
  const g = await GeminiClient.attach(browser, { forceNewTab: true });
  console.log((await g.chat('你好', { newChat: true })).reply);

  const c = await ChatgptClient.attach(browser, { forceNewTab: true });
  console.log((await c.generateImage('水彩橘猫')).imagePath);

  const gi = await GrokImagineClient.attach(browser, { forceNewTab: true });
  console.log((await gi.generateImage('水彩橘猫', { ratio: '1:1' })).filePath);

  const xyq = await XyqClient.attach(browser, { forceNewTab: true });
  console.log((await xyq.generateImage('水彩橘猫')).imagePath); // 默认 lite

  const qw = await QianwenClient.attach(browser, { forceNewTab: true });
  console.log((await qw.research('简要调研 RISC-V')).reply?.slice(0, 120));
} finally {
  await closeBrowser(browser);
}

// 统一 tool 分发（Bot 同构）
// await runXyqTool({ name: 'xyq_image', arguments: { prompt: '…', model: 'lite' } });
```

## 文档

| 文档 | 说明 |
|------|------|
| [docs/guides/getting-started.md](./docs/guides/getting-started.md) | 入门 |
| **[docs/guides/agent-tools.md](./docs/guides/agent-tools.md)** | **Agent 如何注册 tool / 拿结果（推荐）** |
| [docs/guides/gemini.md](./docs/guides/gemini.md) | Gemini 完整能力 |
| [docs/guides/chatgpt.md](./docs/guides/chatgpt.md) | ChatGPT 对话 + 生图 |
| [docs/guides/grok.md](./docs/guides/grok.md) | Grok Imagine |
| [docs/guides/xyq.md](./docs/guides/xyq.md) | 小云雀 Seedream 5.0 |
| [docs/guides/qianwen.md](./docs/guides/qianwen.md) | 千问 |
| [docs/guides/claude.md](./docs/guides/claude.md) | Claude |

## 实现状态

| 模块 | 状态 |
|------|------|
| `shared/` browser · session · types | ✅ |
| `providers/gemini` | ✅ 全量接口 |
| `providers/chatgpt` | ✅ chat + Images 2.0 生图 |
| `providers/grok` | ✅ Imagine 图/视频/多参考图 |
| `providers/xyq` | ✅ Seedream 5.0 Lite/Pro + @ 参考图 |
| `providers/qianwen` | ✅ chat / 研究 / 任务助理（长任务完成检测） |
| `interfaces/cli` | ✅ gemini / chatgpt / grok / xyq / qianwen 子命令 |
| Telegram adapter | 📄 manifest 部分 ready |
| Claude | 📄 文档 / 待实现 |
