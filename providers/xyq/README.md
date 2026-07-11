# providers/xyq — 小云雀 Seedream 5.0

对齐 `gemini` / `grok` / `chatgpt` 的封装形态：

```text
providers/xyq/
  client/          XyqClient（CDP 页面自动化）
  tools/           XYQ_TOOL_DEFINITIONS + runXyqTool
  selectors/       URL / 模型 / DOM 常量
  index.mjs        包入口
```

## 模型

| id | 模型 | 说明 |
|----|------|------|
| **`lite`（默认）** | Seedream 5.0 Lite | 免费积分可验证；配合 **1K** |
| `pro` | Seedream 5.0 Pro | 精准改图；**多需会员** |

参考图：页面 **@引用角色与素材** + `input[type=file]` 多图上传。

## Tools

| name | 说明 |
|------|------|
| `xyq_image` | 文生图 / 多参考图 |
| `web_image_xyq` | 通用别名（并列 web_image） |
| `xyq_credits` | 读积分 |
| `xyq_explore` | 探测（不强制生图） |

## CLI

```bash
npm run xyq:explore
npm run xyq:credits
npm run xyq:image -- "水彩橘猫"                 # 默认 lite
npm run xyq:image -- "图1人物图2场景" --model lite --ref a.png --ref b.png

# 经统一 tool 分发
npm run cli -- tool xyq_image --arg prompt=水彩猫 --arg model=lite
npm run cli -- tool web_image_xyq --arg prompt=水彩猫

# 完整链路 e2e：人物 → 场景 → @ 拼接
npm run test:xyq:e2e
npm run test:xyq:bot
```

## 代码

```js
import {
  XyqClient,
  connectBrowser,
  closeBrowser,
  runXyqTool,
  XYQ_TOOL_DEFINITIONS,
} from '../../index.mjs';

const browser = await connectBrowser();
const c = await XyqClient.attach(browser, { forceNewTab: true });
const img = await c.generateImage('水彩猫'); // 默认 lite + 1K
// await c.generateWithRefs('参考多图…', ['/a.png', '/b.png'], { model: 'lite' });
await closeBrowser(browser);

// Bot / function-calling
// await runXyqTool({ name: 'xyq_image', arguments: { prompt: '…', model: 'lite' } });
```

详见 [docs/guides/xyq.md](../../docs/guides/xyq.md)。
