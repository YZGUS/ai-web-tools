# 提供方（Providers）

## 清单

| id | 显示名 | 站点 | 首期 |
|----|--------|------|------|
| `gemini` | Gemini | https://gemini.google.com | P0 全能力 |
| `grok` | Grok | https://grok.com | P1 对话 |
| `qianwen` | 千问 | https://www.qianwen.com | P1 对话 |
| `claude` | Claude | https://claude.ai | P1 对话 |
| `chatgpt` | ChatGPT | https://chatgpt.com | P1 对话 |

## 能力矩阵（规划）

| 能力 | gemini | grok | qianwen | claude | chatgpt |
|------|--------|------|---------|--------|---------|
| chat | ✅ | ✅ | ✅ | ✅ | ✅ |
| image | ✅ | ⬜ | ⬜ | — | ⬜ |
| video | ✅ | ⬜ | — | — | ⬜ |
| music | ✅ | — | — | — | — |
| research | ✅ | — | ⬜ | — | ⬜ |
| canvas | ✅ | — | — | ⬜ | — |
| mode switch | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| explore | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| session 落盘 | ✅ | ✅ | ✅ | ✅ | ✅ |

## 每提供方目录约定

```text
providers/<id>/
  client/       # 打开、发送、等待、生成…
  tools/        # 绑定到 catalog 的实现钩子
  selectors/    # CSS / aria 文案，与逻辑分离
```

（实现阶段再放源码；当前仅占位。）
