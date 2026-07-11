# providers/

AI **网页提供方**。一站一目录。

| id | 目录 |
|----|------|
| gemini | `gemini/` |
| grok | `grok/` |
| chatgpt | `chatgpt/` |
| xyq | `xyq/`（小云雀 · Seedream 5.0） |
| qianwen | `qianwen/` |
| claude | `claude/` |

每个提供方：

- `client/` — 页面自动化  
- `tools/` — 能力绑定  
- `selectors/` — UI 常量  

详见 [docs/design/providers.md](../docs/design/providers.md)。

## 实现状态

| id | 文档 | 代码 |
|----|------|------|
| gemini | [guides/gemini.md](../docs/guides/gemini.md) | ✅ `GeminiClient` 全量 |
| chatgpt | [guides/chatgpt.md](../docs/guides/chatgpt.md) | ✅ `ChatgptClient`（chat + Images 2.0 生图） |
| grok | [guides/grok.md](../docs/guides/grok.md) | ✅ `GrokImagineClient`（图/视频/多参考图） |
| xyq | [guides/xyq.md](../docs/guides/xyq.md) | ✅ `XyqClient`（仅 Seedream 5.0 Pro/Lite + @ 参考图） |
| qianwen | [guides/qianwen.md](../docs/guides/qianwen.md) | ✅ `QianwenClient`（chat / 研究 / 任务助理，长任务完成检测） |
| claude | [guides/claude.md](../docs/guides/claude.md) | 待实现 |
