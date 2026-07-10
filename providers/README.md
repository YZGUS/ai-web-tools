# providers/

AI **网页提供方**。一站一目录。

| id | 目录 |
|----|------|
| gemini | `gemini/` |
| grok | `grok/` |
| qianwen | `qianwen/` |
| claude | `claude/` |
| chatgpt | `chatgpt/` |

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
| grok | [guides/grok.md](../docs/guides/grok.md) | 待实现 |
| qianwen | [guides/qianwen.md](../docs/guides/qianwen.md) | 待实现 |
| claude | [guides/claude.md](../docs/guides/claude.md) | 待实现 |
