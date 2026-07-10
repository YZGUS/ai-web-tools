# app/

应用编排层。**Bot / CLI 的业务入口应落在这里**（尤其是 `router/`）。

| 子目录 | 职责 |
|--------|------|
| `registry/` | provider 注册 |
| `router/` | tool 名 → 调用链 |
| `jobs/` | 长任务与进度 |
| `errors/` | 稳定错误码 |
