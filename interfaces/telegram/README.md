# interfaces/telegram

## 目标

Telegram Bot 只依赖 **tool 名称 + 参数**，通过 `app/router` 调用，不接触浏览器。

## 规划命令

| 命令 | Tool |
|------|------|
| `/providers` | `app_list_providers` |
| `/ask <provider> <text>` | `web_chat` |
| `/draw <prompt>` | `web_image` |
| `/video <prompt>` | `web_video` |
| `/research <prompt>` | `web_research` |
| `/status` | `app_session_status` |

## 长任务

1. 立即回复 sessionId  
2. 轮询 `runtime/sessions/status-latest.json`  
3. `phase=done` 后回传结果  

实现阶段再补充 adapter 与 `tools.manifest.json` 完整 schema。
