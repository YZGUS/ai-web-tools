# 千问（Qianwen）提供方文档

| 项 | 值 |
|----|-----|
| Provider id | `qianwen` |
| 站点 | https://www.qianwen.com |
| 实现状态 | **规划中** |
| 目录 | `providers/qianwen/` |

## 规划接口

| 方法 | 说明 |
|------|------|
| `QianwenClient.attach` | CDP 附着 |
| `open` / `newChat` / `chat` | 对话闭环 + 落盘 |
| `healthCheck` | 登录就绪 |

## 参考选择器（实现备忘）

- URL：`https://www.qianwen.com/chat`
- 编辑器：`div[contenteditable="true"], textarea`
- 回复：`.message-select-wrapper-answer .qk-markdown` 等
- 发送：`button[aria-label="发送消息"]`
- 新对话：文案「新建对话」

## 后续扩展

研究模式 / 任务助理（若 UI 仍提供）可映射到 `web_research` 类 tool。

## Bot tool（规划）

- `qianwen_chat` / `web_chat` `{ provider: 'qianwen' }`
