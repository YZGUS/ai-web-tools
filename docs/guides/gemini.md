# Gemini 使用指南

实现位置：`providers/gemini/`（自 page-automation 完整迁移）。

## 能力一览

| 方法 | 说明 |
|------|------|
| `GeminiClient.attach(browser)` | 附着 CDP Chrome |
| `open()` / `waitReady()` / `healthCheck()` | 打开与就绪 |
| `newChat()` | 新对话 |
| `chat(prompt, { newChat, timeout })` | 发送并等待回复 |
| `send` / `typePrompt` / `clickSend` / `waitForResponse` | 底层步骤 |
| `listModes` / `setMode` / `getCurrentMode` | 模型模式 |
| `listTools` / `selectTool` / `openToolsMenu` | 上传和工具菜单 |
| `generateWithTool(tool, prompt)` | image/video/music/research/canvas |
| `uploadFiles(paths)` | 上传本地文件 |
| `explore()` | 探测账号能力 |
| `extractMediaFromLastResponse()` | 抽取媒体 URL |
| `goNav` / `screenshotChat` / `exportConversationToFile` | 导航与导出 |

## 快速开始

```bash
cd /Users/cengyi/Desktop/tools/ai-web-tools
npm install
npm run chrome:start
# 调试 Chrome 中登录 gemini.google.com

node interfaces/cli/cli.mjs gemini chat "你好" --new --new-tab
node interfaces/cli/cli.mjs gemini explore
node interfaces/cli/cli.mjs gemini gen image "一只水彩猫" --new
node interfaces/cli/cli.mjs status
```

## 代码

```js
import {
  connectBrowser,
  closeBrowser,
  GeminiClient,
  runGeminiTool,
} from 'ai-web-tools'; // 或相对路径 ../../index.mjs

const browser = await connectBrowser();
try {
  const g = await GeminiClient.attach(browser, { forceNewTab: true });
  await g.open();
  const r = await g.chat('你好', { newChat: true });
  console.log(r.reply, r.session);
} finally {
  await closeBrowser(browser);
}

// Bot 风格
await runGeminiTool({
  name: 'web_image',
  arguments: { prompt: '一只猫', new_chat: true },
});
```

## 会话落盘

```text
runtime/sessions/gemini/<sessionId>/
  status.json          # phase: idle|running|waiting|done|error
  events.jsonl
  conversation.jsonl
  conversation.md
runtime/sessions/status-latest.json
runtime/media/gemini/  # 截图
```

**完成判定**：`phase === "done"`。

## 选择器

`providers/gemini/selectors/ui.mjs` — UI 变更优先改此处。
