# providers/chatgpt

**状态：已实现**（主站 chat + Images 2.0 生图）

## 模块

| 路径 | 说明 |
|------|------|
| `client/chatgpt-client.mjs` | `ChatgptClient` |
| `selectors/ui.mjs` | URL / 选择器 |
| `tools/definitions.mjs` | Bot tool schema |
| `tools/dispatch.mjs` | `runChatgptTool` |

## 快速引用

```js
import {
  connectBrowser,
  closeBrowser,
  ChatgptClient,
  runChatgptTool,
} from '../../index.mjs';

const browser = await connectBrowser();
const c = await ChatgptClient.attach(browser, { forceNewTab: true });
const img = await c.generateImage('水彩橘猫', {});
console.log(img.imagePath);
await closeBrowser(browser);

// 或 tool 分发
await runChatgptTool({
  name: 'chatgpt_image',
  arguments: { prompt: '水彩橘猫' },
});
```

## CLI

```bash
npm run chatgpt:image -- "水彩橘猫"
npm run chatgpt:chat -- "只回复ok" --new --new-tab
npm run cli -- chatgpt explore
```

完整说明见 [docs/guides/chatgpt.md](../../docs/guides/chatgpt.md)。
