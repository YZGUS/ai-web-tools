# providers/qianwen — 千问

对齐 `gemini` / `grok` / `xyq`：

```text
providers/qianwen/
  client/          QianwenClient
  tools/           QIANWEN_TOOL_DEFINITIONS + runQianwenTool
  selectors/       URL / 模式 / 完成检测常量
```

站点：https://www.qianwen.com/chat

## 模式

| id | 胶囊 | 说明 |
|----|------|------|
| `chat` | — | 普通对话 |
| `think` | 思考 | 思考模式 |
| **`research`** | **研究** | 深度研究（**长任务**，常约 10 分钟+） |
| **`task`** | **任务助理** | 多步骤任务（**长任务**） |

### 长任务完成检测（重要）

研究 / 任务助理会：

1. 先流式输出**计划**正文 → stop 消失、markdown 变 complete  
2. 后台继续跑 → UI 显示「正在分析 / 正在撰写研究报告中 / 正在生成可视化报告中…」  
3. 计划里的「研究完成后我会发送消息」**会常驻 DOM**，不能当完成信号  

客户端 `waitForLongTask` 必须等到：

- 无「正在*」活跃进度  
- 无停止/终止任务  
- 无未完成 markdown  
- 连续多轮状态稳定（默认 5 次 × 3s）  
- 超过 `minWaitMs`（research 默认 45s）  

## Tools

| name | 说明 |
|------|------|
| `qianwen_chat` | 对话，可带 mode |
| `qianwen_research` | 研究模式 |
| `qianwen_task` | 任务助理 |
| `web_research_qianwen` | 通用别名 |
| `web_task_qianwen` | 通用别名 |
| `qianwen_explore` | 探测 |

## CLI

```bash
npm run qianwen:explore
npm run qianwen:chat -- "你好"
npm run qianwen:research -- "调研 RISC-V 生态现状，列三点"
npm run qianwen:task -- "整理一份会议纪要模板大纲"
npm run test:qianwen:bot -- --schema-only
```

## 代码

```js
import { QianwenClient, connectBrowser, closeBrowser } from '../../index.mjs';

const browser = await connectBrowser();
const c = await QianwenClient.attach(browser, { forceNewTab: true });
const r = await c.research('简要调研：什么是 RISC-V？三点即可');
// const t = await c.taskAssistant('写一份技术周报大纲');
console.log(r.reply, r.elapsedMs);
await closeBrowser(browser);
```

详见 [docs/guides/qianwen.md](../../docs/guides/qianwen.md)。
