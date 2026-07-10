# ChatGPT 提供方文档

| 项 | 值 |
|----|-----|
| Provider id | `chatgpt` |
| 站点 | https://chatgpt.com |
| 实现状态 | **规划中** |
| 目录 | `providers/chatgpt/` |

## 规划接口

| 方法 | 说明 |
|------|------|
| `ChatGptClient.attach` | CDP 附着 |
| `open` / `newChat` / `chat` | 对话 + 落盘 |
| `healthCheck` | 登录就绪 |
| （后续）生图 | 可映射 `web_image` |

## 参考选择器（实现备忘）

- 编辑器：`#prompt-textarea, div.ProseMirror[contenteditable="true"]`
- 助手消息：`[data-message-author-role="assistant"]`
- 发送：`[data-testid="send-button"]`
- 停止：`[data-testid="stop-button"]`
- 新聊天：文案 New chat / 新聊天

## Bot tool（规划）

- `chatgpt_chat` / `web_chat` `{ provider: 'chatgpt' }`
