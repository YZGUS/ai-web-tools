# 千问（Qianwen）使用指南

| 项 | 值 |
|----|-----|
| Provider | `qianwen` / `QianwenClient` |
| 站点 | https://www.qianwen.com/chat |
| 实现状态 | ✅ chat · 思考 · **研究** · **任务助理** |
| 参考 | `sea-queen-sim/providers/qianwen.mjs` 基础对话选择器 |

## 模式

| CLI / API | 页面胶囊 | 时长 | 说明 |
|-----------|----------|------|------|
| `chat` | — | 短 | 普通对话 |
| `think` | 思考 | 中 | 思考模式 |
| **`research`** | **研究** | **长（常约 10min+）** | 深度研究 / 报告 |
| **`task`** | **任务助理** | **长** | 多步骤任务执行 |

工具条为 `button[aria-label][aria-pressed]` 胶囊（如 `aria-label="研究"`）。

## 长任务完成检测（关键）

实测研究模式生命周期：

```text
1) 点「研究」胶囊 → aria-pressed=true
2) 发送问题
3) 流式输出「调研计划」正文（此时有「停止」按钮）
4) 计划 complete、停止消失 —— ⚠ 尚未完成
5) 后台进度：「正在分析…」「正在撰写研究报告中」「正在生成可视化报告中…」
6) 侧栏「研究过程」；UI 提示「大约需要 10 分钟」
7) 进度「正在*」消失 + 多轮稳定 → 才算完成
```

**陷阱**：

| 错误做法 | 原因 |
|----------|------|
| 看到 markdown `complete` 就返回 | 计划阶段已 complete，研究还在后台跑 |
| 用正文「研究完成后我会发送消息」当完成 | 该句在计划里**常驻** |
| 仅看 lastLen 稳定 | 计划长度会长时间不变，后台仍「正在*」 |
| 超时设 60s | 研究/任务助理经常数分钟以上 |

客户端 `waitForLongTask` 策略：

1. 检测活跃进度节点中的 `正在(分析|撰写|生成|…)`  
2. 检测「停止 / 终止任务」与未完成 `.qk-md-text:not(.complete)`  
3. 必须超过 `minWaitMs`（research 默认 45s）  
4. 空闲后连续 `stablePolls`（默认 5 × 3s）状态指纹不变  
5. 默认超时 **900s（15 分钟）**

## CLI

```bash
npm run chrome:start
# 调试 Chrome 登录 qianwen.com

npm run qianwen:explore

# 普通对话
npm run qianwen:chat -- "你好，用一句话介绍你自己"

# 研究模式（长）
npm run qianwen:research -- "简要调研 RISC-V：定义、起源、生态三点"

# 任务助理（长）
npm run qianwen:task -- "写一份技术周报大纲，含本周完成/风险/下周计划"

# 统一 tool
npm run cli -- tool qianwen_research --arg prompt=调研RISC-V
```

## 代码

```js
import {
  connectBrowser,
  closeBrowser,
  QianwenClient,
  runQianwenTool,
} from './index.mjs';

const browser = await connectBrowser();
try {
  const c = await QianwenClient.attach(browser, { forceNewTab: true });

  const chat = await c.chat('你好', { mode: 'chat' });
  console.log(chat.reply);

  // 研究：请预留足够 timeout
  const r = await c.research('简要调研：什么是 RISC-V？三点即可', {
    timeout: 900_000,
  });
  console.log(r.elapsedMs, r.reply.slice(0, 200));

  const t = await c.taskAssistant('整理一份站会纪要模板');
  console.log(t.reply.slice(0, 200));
} finally {
  await closeBrowser(browser);
}
```

## Tools

| name | method |
|------|--------|
| `qianwen_chat` | `chat`（可 mode） |
| `qianwen_research` | `research` |
| `qianwen_task` | `taskAssistant` |
| `web_research_qianwen` | `research` |
| `web_task_qianwen` | `taskAssistant` |
| `qianwen_explore` | `explore` |

## 测试

```bash
npm run test:qianwen:bot -- --schema-only
# 真实研究（长，需登录）：
npm run test:qianwen:research
```

## 输出

- 会话：`runtime/sessions/qianwen/`
- 截图：`runtime/media/qianwen/`
