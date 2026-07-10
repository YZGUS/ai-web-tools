# Claude 提供方文档

| 项 | 值 |
|----|-----|
| Provider id | `claude` |
| 站点 | https://claude.ai |
| 实现状态 | **规划中** |
| 目录 | `providers/claude/` |

## 规划接口

| 方法 | 说明 |
|------|------|
| `ClaudeClient.attach` | CDP 附着 |
| `open` / `newChat` / `chat` | 对话 + SessionLog |
| `healthCheck` | 登录就绪 |

## 参考选择器（实现备忘）

- URL：`https://claude.ai/new`
- 编辑器：`div.tiptap.ProseMirror[contenteditable="true"]`
- 回复：`.standard-markdown`（过滤 Thought for…）
- 发送：aria 含 Send message；可 Meta+Enter 兜底
- 流式：`[data-is-streaming="true"]` / Stop 按钮

## Bot tool（规划）

- `claude_chat` / `web_chat` `{ provider: 'claude' }`
