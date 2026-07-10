# 工具目录（AI Web 常用能力）

面向 **用户 / Bot** 的能力清单，与具体网站解耦。  
实现阶段由 `catalog/` + `app/router` 落地。

## 1. 命名规范

```text
# 应用级
app_list_providers
app_list_tools
app_session_status

# 提供方对话
{provider}_chat          # provider = gemini|grok|qianwen|claude|chatgpt

# 常用生成类（默认走 gemini，可后续扩展 provider 参数）
web_chat                 # 通用对话：必填 provider + prompt
web_image                # 文生图
web_video                # 文生视频
web_music                # 文生音乐/音频
web_research             # 深度研究
web_canvas               # 画布/长文档协作（Gemini Canvas 等）

# Gemini 专用（能力最全时保留细粒度）
gemini_explore
gemini_set_mode
```

## 2. 常用工具一览

| Tool | 说明 | 默认 Provider | 优先级 |
|------|------|---------------|--------|
| `web_chat` | 网页端对话 | 参数指定 | P0 |
| `web_image` | 生成图片 | gemini | P0 |
| `web_video` | 生成视频 | gemini | P1 |
| `web_music` | 生成音乐 | gemini | P1 |
| `web_research` | 深度研究 | gemini | P1 |
| `web_canvas` | Canvas 类 | gemini | P2 |
| `app_session_status` | 查询是否完成 | — | P0 |
| `app_list_providers` | 列出提供方 | — | P0 |

## 3. 与 Telegram 的映射（规划）

| 命令示例 | Tool |
|----------|------|
| `/ask gemini 你好` | `web_chat` `{provider:gemini, prompt}` |
| `/ask grok 你好` | `web_chat` `{provider:grok, prompt}` |
| `/draw 一只猫` | `web_image` `{prompt}` |
| `/video …` | `web_video` |
| `/research …` | `web_research` |
| `/status` | `app_session_status` |
| `/providers` | `app_list_providers` |

## 4. 参数约定（摘要）

### web_chat

```text
provider: gemini|grok|qianwen|claude|chatgpt
prompt: string
new_chat?: boolean
timeout_ms?: number
```

### web_image / web_video / web_music / web_research / web_canvas

```text
prompt: string
provider?: string          # 默认 gemini
new_chat?: boolean
timeout_ms?: number
```

### app_session_status

```text
session_id?: string        # 缺省 = 最新
```

返回：`phase`、`preview`、`paths` 等。
