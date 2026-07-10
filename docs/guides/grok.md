# Grok 提供方文档

| 项 | 值 |
|----|-----|
| Provider id | `grok` |
| 站点 | https://grok.com |
| 实现状态 | **规划中**（目录已建，client 未实现） |
| 目录 | `providers/grok/` |

## 规划接口（与 Gemini 对齐的最小集）

实现时需提供与下列方法等价的 API（注释与 GeminiClient 同级）：

| 方法 | 说明 |
|------|------|
| `GrokClient.attach(browser, opts)` | CDP 附着 |
| `open()` | 打开并等输入框 |
| `newChat()` | 新对话（侧栏「新建聊天」或 ⌘J） |
| `chat(prompt, opts)` | 发送 + 等待 + SessionLog |
| `send` / `waitForResponse` | 底层 |
| `healthCheck()` | 是否已登录可用 |

## 参考选择器（实现备忘）

- 编辑器：`div.tiptap.ProseMirror[contenteditable="true"]`
- 助手消息：`[data-testid="assistant-message"]`
- 停止：`button[aria-label="停止模型响应"]`
- 发送：aria `提交` / Send / Submit

## 登录

调试 Chrome profile 中登录 grok.com；国内可能需代理（`CHROME_PROXY`）。

## Bot tool（规划）

- `grok_chat` → `web_chat` `{ provider: 'grok', prompt }`
