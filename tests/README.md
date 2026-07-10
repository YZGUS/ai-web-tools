# tests/

## 脚本位置一览

| 路径 | 用途 |
|------|------|
| `smoke/cdp.mjs` | CDP 连通冒烟 |
| `providers/gemini/e2e.mjs` | Gemini 标准功能（对话/模式/工具/落盘/导航） |
| `providers/gemini/media.mjs` | Gemini 多媒体真实生成（图/视频/音乐/研究/Canvas） |
| `providers/gemini/bot-tools.mjs` | Bot tool 定义与分发 |
| `providers/gemini/full-suite.mjs` | **一键跑完整套件** |
| `providers/grok|qianwen|claude|chatgpt/` | 其他提供方（待实现） |

## 运行

```bash
cd /Users/cengyi/Desktop/tools/ai-web-tools
npm run chrome:start

# 一键完整测试（含多媒体，较久）
npm run test:gemini

# 仅标准 E2E + bot，不含生图视频等
npm run test:gemini:quick

# 单项
npm run test:gemini:e2e
npm run test:gemini:media
npm run test:gemini:media -- --only image,music
npm run test:gemini:bot
npm run test:smoke
```

## 报告产物

```text
runtime/media/gemini-tests/
  e2e-report-latest.json
  e2e-*.png
  media/
    media-report-latest.json
    image-*.png / video-*.png / …
```
