# tests/

## 脚本位置一览

| 路径 | 用途 |
|------|------|
| `smoke/cdp.mjs` | CDP 连通冒烟 |
| `providers/gemini/e2e.mjs` | Gemini 标准功能（对话/模式/工具/落盘/导航） |
| `providers/gemini/media.mjs` | Gemini 多媒体真实生成（图/视频/音乐/研究/Canvas） |
| `providers/gemini/bot-tools.mjs` | Bot tool 定义与分发 |
| `providers/gemini/full-suite.mjs` | **一键跑完整套件** |
| `providers/xyq/e2e-combo.mjs` | 小云雀：人物图 → 场景图 → @ 拼接（Lite+1K） |
| `providers/xyq/bot-tools.mjs` | 小云雀 tool schema / 可选 live explore |
| `providers/qianwen/bot-tools.mjs` | 千问 tool schema |
| `providers/qianwen/research-smoke.mjs` | 千问研究/任务助理真实长任务冒烟 |
| `providers/grok|claude|chatgpt/` | 其他提供方（部分已实现 / 待补测试） |

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

# 小云雀 Seedream
npm run test:xyq:bot
npm run test:xyq:bot -- --schema-only
npm run test:xyq:e2e

# 千问（研究/任务助理为长任务）
npm run test:qianwen:bot -- --schema-only
npm run test:qianwen:research
npm run test:qianwen:research -- --task
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
