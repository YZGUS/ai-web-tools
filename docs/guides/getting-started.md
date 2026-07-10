# 快速开始

## 环境

- Node.js ≥ 18  
- macOS / Chrome（远程调试）  
- 调试 profile 中登录目标 AI 网站  

```bash
cd /Users/cengyi/Desktop/tools/ai-web-tools
npm install
npm run chrome:start
npm run chrome:check
```

## 当前已实现

| 提供方 | 状态 |
|--------|------|
| Gemini | ✅ 对话 + 模式 + 多媒体工具 + 落盘 |
| Grok / 千问 / Claude / ChatGPT | 📄 文档就绪，实现待办 |

## 常用命令

```bash
node interfaces/cli/cli.mjs probe
node interfaces/cli/cli.mjs gemini chat "你好" --new --new-tab
node interfaces/cli/cli.mjs gemini gen image "一只猫" --new
node interfaces/cli/cli.mjs status
```

## 文档索引

- [Gemini](./gemini.md)
- [Grok](./grok.md)
- [千问](./qianwen.md)
- [Claude](./claude.md)
- [ChatGPT](./chatgpt.md)
- [架构](../design/architecture.md)
