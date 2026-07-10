# ChatGPT 提供方使用指南

| 项 | 值 |
|----|-----|
| Provider id | `chatgpt` |
| 主站 | https://chatgpt.com |
| 生图 | https://chatgpt.com/images/（Images 2.0，**须带尾斜杠**） |
| 实现状态 | ✅ `ChatgptClient`（chat + generateImage） |
| 目录 | `providers/chatgpt/` |

## 前置条件

1. 本机调试 Chrome 已启动：`npm run chrome:start`  
2. 在该 Chrome 中已登录 **chatgpt.com**  
3. CDP 可用：`npm run probe` → `"ok": true`

## 快速开始

### CLI

```bash
# 生图（推荐）
npm run chatgpt:image -- "水彩风格的橘猫坐在窗台"

# 带参考图
npm run cli -- chatgpt image "保持人物一致，换成唐朝服饰" --ref /path/to/face.png

# 主站短对话
npm run chatgpt:chat -- "只回复：ok" --new --new-tab

# 探测 Images 页
npm run cli -- chatgpt explore
```

### 代码

```js
import {
  connectBrowser,
  closeBrowser,
  ChatgptClient,
  runChatgptTool,
} from 'ai-web-tools'; // 或相对路径 '../../index.mjs'

const browser = await connectBrowser();
try {
  const client = await ChatgptClient.attach(browser, {
    forceNewTab: true,
  });

  // Images 2.0 生图
  const img = await client.generateImage(
    '唐代疆域与诸道分布示意地图，标注长安洛阳与各道边界',
    { timeout: 300_000 },
  );
  console.log(img.imagePath, img.width, img.height);

  // 主站对话
  // const chat = await client.chat('你好', { newChat: true });
} finally {
  await closeBrowser(browser); // 只断开连接，不关 Chrome
}
```

### Tool 分发（Bot / 编排）

```js
import { runChatgptTool } from './index.mjs';

await runChatgptTool({
  name: 'chatgpt_image',
  arguments: {
    prompt: '水彩猫',
    timeout_ms: 300000,
  },
});
```

| Tool 名 | 说明 |
|---------|------|
| `chatgpt_chat` | 主站对话 |
| `chatgpt_image` | Images 2.0 生图 |
| `chatgpt_explore` | 探测就绪 |
| `web_image_chatgpt` | 与 `chatgpt_image` 同义（catalog 并列） |

## Client API

| 方法 | 说明 |
|------|------|
| `ChatgptClient.attach(browser, opts)` | CDP 附着；`forceNewTab` 建议 true |
| `open` / `newChat` / `chat` | 主站对话 + SessionLog |
| `openImages` | 打开 `/images/` |
| `generateImage(prompt, opts)` | 生图并下载到 `runtime/media/chatgpt/` |
| `attachReferenceImages(paths)` | 参考图上传 |
| `generateWithTool('image', prompt)` | 与 Gemini 形态对齐的薄封装 |
| `explore` | 能力探测 |
| `healthCheck` / `screenshot` | 健康检查 / 截图 |

### `generateImage` 选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `refImages` | `[]` | 本地参考图路径 |
| `timeout` | `300000` | 等待完成毫秒 |
| `filename` | 自动时间戳 | 不含扩展名 |
| `outputDir` | `runtime/media/chatgpt` | 输出目录 |
| `openImages` | `true` | 是否先打开 `/images/` |

### 返回值（生图）

```json
{
  "ok": true,
  "prompt": "…",
  "imagePath": "/…/runtime/media/chatgpt/chatgpt-image-….png",
  "width": 1536,
  "height": 1024,
  "mime": "image/png",
  "size": 1234567,
  "conversationUrl": "https://chatgpt.com/c/…",
  "session": { "dir": "…", "status": "…" },
  "media": { "path": "…", "kind": "image" }
}
```

## 实现要点

| 点 | 说明 |
|----|------|
| 入口 | 生图用 **`/images/`**，不要只靠主站 Plus 菜单 |
| 完成信号 | `good-image-turn-action-button` + estuary 图加载完成 |
| 下载 | **必须** `page.evaluate(fetch)` 带 cookie；裸 Node fetch 会 401 |
| 输入 | CDP `Input.insertText`，适合长中文 prompt |
| 会话 | `runtime/sessions/chatgpt/<id>/`（phase / conversation） |

## 与 Gemini 对照

| 能力 | Gemini | ChatGPT |
|------|--------|---------|
| chat | ✅ | ✅ |
| 文生图 | `generateWithTool('image')` / `web_image` | `generateImage` / `chatgpt_image` |
| 视频/音乐/研究 | ✅ | ❌（暂不支持） |
| 工具定义 | `GEMINI_TOOL_DEFINITIONS` | `CHATGPT_TOOL_DEFINITIONS` |
| 分发 | `runGeminiTool` | `runChatgptTool` |

## 常见问题

**CDP 连不上** → `npm run chrome:start`，确认独立 user-data-dir 与 9222。  

**未登录** → 在调试 Chrome 里手动打开 chatgpt.com 登录后再跑。  

**生图超时** → 复杂图可能 2–4 分钟；加大 `--timeout`；检查额度/网络。  

**下载失败** → 确认仍在已登录标签上下文中 fetch。  
