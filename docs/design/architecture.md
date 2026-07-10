# 架构设计

## 1. 定位

**ai-web-tools** = 面向「AI 网页产品」的常用能力集成层。

- 输入：自然语言 / 结构化 tool 调用  
- 执行：本机调试 Chrome（CDP）附着已登录会话  
- 输出：文本回复、媒体路径、会话状态  

## 2. 分层

```text
┌─────────────────────────────────────────────────┐
│  interfaces/     人机入口                         │
│  cli · telegram · (future: http / mcp)          │
├─────────────────────────────────────────────────┤
│  app/            编排                             │
│  router · registry · jobs · errors              │
├─────────────────────────────────────────────────┤
│  catalog/        「有哪些工具」（产品视角）           │
│  chat · image · video · research · …            │
├─────────────────────────────────────────────────┤
│  providers/      「谁来做」（站点视角）               │
│  gemini · grok · qianwen · claude · chatgpt     │
├─────────────────────────────────────────────────┤
│  shared/         基础设施                         │
│  browser · session · types · config · util      │
├─────────────────────────────────────────────────┤
│  runtime/        运行时数据（不进 Git）              │
└─────────────────────────────────────────────────┘
```

### 依赖规则

```text
interfaces  →  app  →  catalog + providers  →  shared
```

- `providers/*` **不得** import `interfaces/*`  
- `catalog` 只描述工具契约，不直接操作 DOM  
- `app/router` 负责：tool 请求 → 选 provider → 调 client  

## 3. 两个正交概念

| 概念 | 含义 | 例子 |
|------|------|------|
| **Tool（工具）** | 用户/Bot 想做的事 | chat、image、video、research |
| **Provider（提供方）** | 哪个 AI 网页来执行 | gemini、chatgpt、grok |

同一 Tool 未来可路由到不同 Provider（如 `image` → gemini 或 chatgpt）。  
首期：`image/video/music/research` 默认 `gemini`；`chat` 按参数指定 provider。

## 4. 会话与进度

所有执行写 `runtime/sessions/`：

| phase | 含义 |
|-------|------|
| `idle` | 已创建 |
| `running` | 已发请求 |
| `waiting` | 等待网页结果 |
| `done` | 成功 |
| `error` | 失败 |

Bot 用 `app_session_status` 或读 `status-latest.json` 判断是否完成。

## 5. 实现顺序（结构确认后）

1. `shared/`（browser + session）  
2. `providers/gemini/`（完整常用工具）  
3. `catalog/` + `app/router`  
4. `interfaces/cli`  
5. `interfaces/telegram`  
6. 其余 provider 的 chat  
7. 测试  
