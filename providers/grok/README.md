# providers/grok

**状态：已实现 Imagine**（图片 / 视频 / 多参考图 / 代理）

## 模块

| 路径 | 说明 |
|------|------|
| `client/grok-imagine-client.mjs` | `GrokImagineClient` |
| `selectors/ui.mjs` | Imagine URL 与选择器 |
| `tools/` | `runGrokTool` + schema |

## 快速引用

```js
import { GrokImagineClient, connectBrowser, closeBrowser } from '../../index.mjs';

const browser = await connectBrowser();
const c = await GrokImagineClient.attach(browser, { forceNewTab: true });
const img = await c.generateImage('水彩猫', { ratio: '1:1' });
// 多参考图
// await c.generateWithRefs('参考图1人物 + 图2画风', ['/a.png', '/b.png']);
// 视频
// await c.generateVideo('镜头推进的赛博城市', { resolution: '720p', duration: '6s' });
await closeBrowser(browser);
```

## CLI

```bash
npm run grok:image -- "水彩橘猫" --ratio 1:1
npm run grok:video -- "海浪拍岸" --resolution 480p --duration 6s
npm run cli -- grok explore
```

详见 [docs/guides/grok.md](../../docs/guides/grok.md)。
