# providers/gemini

**状态：已实现**（自 `test/page-automation` 迁移）

## 模块

| 路径 | 说明 |
|------|------|
| `client/gemini-client.mjs` | `GeminiClient` 全量接口 |
| `selectors/ui.mjs` | URL / 编辑器 / 工具与模式别名 |
| `tools/definitions.mjs` | Bot tool schema |
| `tools/dispatch.mjs` | `runGeminiTool` 分发 |

## 快速引用

```js
import { GeminiClient, runGeminiTool } from '../../index.mjs';
```

完整说明见 [docs/guides/gemini.md](../../docs/guides/gemini.md)。
