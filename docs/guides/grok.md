# Grok Imagine 使用指南

| 项 | 值 |
|----|-----|
| Provider | `grok-imagine`（`GrokImagineClient`） |
| 站点 | https://grok.com/imagine/ |
| 实现状态 | ✅ 文生图 / 多参考图 / 文生视频 / 代理模式 |
| 目录 | `providers/grok/` |

主站 **对话** chat 仍待独立封装；当前正式能力是 **Imagine 多媒体生成**。

## 前置

1. `npm run chrome:start`  
2. 调试 Chrome 登录 **grok.com**  
3. `npm run probe` → ok  

## 页面能力（CDP 实测）

| 能力 | 支持 | UI |
|------|------|-----|
| 普通提示词生图 | ✅ | 模式 **图片** + 输入 + 提交 |
| 多参考图 | ✅ | `input[name=files]` **multiple**，jpeg/png/gif/webp/bmp/tiff |
| 生视频 | ✅ | 模式 **视频**，480p/720p，6s/10s |
| 代理模式 | ✅ | 模式 **代理**（复杂生成） |
| 宽高比 | ✅ | 2:3 / 3:2 / 1:1 / 9:16 / 16:9 |
| 图片质量 | ✅ | **速度** / **质量** radio |
| 精选模板 | ✅ | Chibi、Comic Book、80s Anime… |

### 完成与下载

- 新 UI 可能**不跳转** URL，在「探索」结果网格展示 4 图 +「生成更多」  
- 或跳转 `/imagine/post/<uuid>` 并出现「下载」  
- 完成判定：出现 **新的** `assets.grok.com/.../generated/...` 资源（相对提交前 diff）  
- 资源下载须 **cookie**（`page.evaluate(fetch)`）  
- 提交按钮须 **真实鼠标 pointer 链**（`page.click` 不可靠）

## CLI

```bash
# 1) 普通文生图
npm run grok:image -- "水彩风格的橘猫" --ratio 1:1 --quality quality

# 2) 多参考图（人物 + 画风）
npm run cli -- grok image "保留第一张人物身份，采用第二张的画风与配色" \
  --ref /path/to/person.png \
  --ref /path/to/style.png \
  --ratio 3:2

# 3) 生视频
npm run grok:video -- "镜头缓慢推进的赛博朋克夜景街道，霓虹倒影" \
  --resolution 480p --duration 6s --ratio 16:9

# 探测
npm run grok:explore
```

## 代码

```js
import {
  connectBrowser,
  closeBrowser,
  GrokImagineClient,
} from './index.mjs';

const browser = await connectBrowser();
try {
  const c = await GrokImagineClient.attach(browser, { forceNewTab: true });

  // 文生图
  const img = await c.generateImage('水彩橘猫', {
    ratio: '1:1',
    quality: 'quality',
  });
  console.log(img.filePath);

  // 多参考图
  // await c.generateWithRefs('参考图1人物，图2画风', ['/a.png', '/b.png'], {
  //   ratio: '3:2',
  // });

  // 视频
  // await c.generateVideo('海浪拍岸', {
  //   resolution: '720p',
  //   duration: '6s',
  //   ratio: '16:9',
  // });
} finally {
  await closeBrowser(browser);
}
```

## Tool 名

| name | 说明 |
|------|------|
| `grok_imagine_image` | 生图 |
| `grok_imagine_video` | 生视频 |
| `grok_imagine` | 统一 `mode` |
| `grok_imagine_explore` | 探测 |

```js
import { runGrokTool } from './index.mjs';
await runGrokTool({
  name: 'grok_imagine_image',
  arguments: { prompt: '猫', ratio: '1:1', ref_images: ['/a.png'] },
});
```

## 输出

默认目录：`runtime/media/grok-imagine/`  
会话：`runtime/sessions/grok-imagine/<id>/`

## 与 ChatGPT / Gemini 生图对照

| | Grok Imagine | ChatGPT Images | Gemini |
|--|--------------|----------------|--------|
| 入口 | `/imagine/` | `/images/` | 工具菜单「制作图片」 |
| 多参考图 | ✅ multiple | ✅ | 上传文件 |
| 视频 | ✅ 原生 | ❌（本封装） | ✅ |
| 提交方式 | 鼠标 pointer 链 | send-button click | 工具流 |

## 提示：多图参考写法

页面上传多图后，提示词中说明角色即可，例如：

```text
使用第一张图作为人物身份参考，第二张图作为画风与光影参考，
生成该人物在雨夜街头的肖像，保持脸部一致。
```

（若 UI 对每张图支持 @ 标注，以当前页面交互为准；自动化侧以 **上传顺序 + 文案指定** 为准。）
