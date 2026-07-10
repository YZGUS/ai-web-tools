# 目录树与职责

```text
ai-web-tools/                         # 包名：ai-web-tools
│
├── README.md
├── package.json                      # name: "ai-web-tools"
├── .gitignore
│
├── docs/
│   ├── design/                       # 设计（当前阶段）
│   │   ├── architecture.md
│   │   ├── directory.md              # 本文件
│   │   ├── tools-catalog.md
│   │   └── providers.md
│   └── guides/                       # 使用手册（实现后）
│
├── shared/                           # 与具体 AI 站无关
│   ├── browser/                      # CDP connect / tab
│   ├── session/                      # 状态机与对话落盘
│   ├── types/                        # 公共类型、错误码
│   ├── config/                       # 环境变量、默认超时
│   └── util/
│
├── providers/                        # AI 网页提供方
│   ├── gemini/
│   │   ├── client/                   # 页面自动化（实现阶段）
│   │   ├── tools/                    # 该提供方暴露的能力实现绑定
│   │   └── selectors/                # 选择器与 UI 文案常量
│   ├── grok/
│   │   ├── client/
│   │   ├── tools/
│   │   └── selectors/
│   ├── qianwen/
│   │   ├── client/
│   │   ├── tools/
│   │   └── selectors/
│   ├── claude/
│   │   ├── client/
│   │   ├── tools/
│   │   └── selectors/
│   └── chatgpt/
│       ├── client/
│       ├── tools/
│       └── selectors/
│
├── catalog/                          # 工具目录（产品层定义）
│                                     # 定义 chat/image/video… 的名称、参数、默认 provider
│
├── app/                              # 应用编排
│   ├── registry/                     # provider id → 模块
│   ├── router/                       # tool 调用入口（Bot 只调这里）
│   ├── jobs/                         # 长任务与进度
│   └── errors/                       # 错误码 → 提示文案
│
├── interfaces/                       # 对外接入
│   ├── cli/
│   └── telegram/                     # manifest + 适配（实现后）
│
├── scripts/                          # chrome-start / chrome-check
├── tests/
│   ├── smoke/
│   ├── providers/<id>/
│   └── integration/
├── examples/
│
└── runtime/                          # 运行时（gitignore）
    ├── sessions/
    ├── media/
    └── logs/
```

## 职责表

| 路径 | 一句话 |
|------|--------|
| `shared/` | 浏览器与会话基础设施 |
| `providers/*/` | 某个 AI 网站怎么点、怎么等 |
| `catalog/` | 用户侧有哪些「常用工具」 |
| `app/router/` | 把 tool 请求派到具体 provider |
| `interfaces/` | CLI / Telegram 薄适配 |
| `runtime/` | 状态、对话、媒体、日志 |
| `docs/design/` | 先于代码的约定 |

## 包名与路径

| 项 | 值 |
|----|-----|
| npm / 包名 | `ai-web-tools` |
| 磁盘路径 | `/Users/cengyi/Desktop/tools/ai-web-tools` |
| 旧名 | `web-auto`（已删除） |
