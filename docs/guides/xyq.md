# 小云雀 Seedream 5.0 使用指南

| 项 | 值 |
|----|-----|
| 站点 | https://xyq.jianying.com/home |
| Provider | `xyq` / `XyqClient` |
| **生图模型** | **仅 Seedream 5.0 Pro / Lite** |
| **默认** | **`lite` + 1K**（无会员验证流程） |
| 参考图 | **@ 引用** + 本地上传（多图） |
| 积分 | 每日约 **68** `free_credits`，当日清零 |

## 模型约定

| CLI / API | 内部 value | 会员 | 说明 |
|-----------|------------|------|------|
| **`lite`（默认）** | `seedream_5.0` | 否（推荐） | 指令响应 / 逻辑推理；流程验证用这个 |
| `pro` | `seedream_5.0_pro` | **是** | 交互改图；无会员会触发「仅会员可用」 |

**分辨率**：默认切 **1K**。2K 常触发会员墙或高积分消耗。

### Agent「生成图像」失败卡

会话里若出现红色 **生成图像** 工具调用（DOM：`itemStatusError` / `toolCallGroup`），meta 类似：

```text
OutputPath: ./assets/….png，OutputRatio: 3:4，Prompt: …高清，Model: seedream_5.0
```

并伴随文案「本次任务使用了仅会员可用功能」——常见原因：

1. 首页工具条仍是 **2K**（或 Pro），agent 继承高规格  
2. 提示词含 **高清** 等词，agent 抬升参数  
3. **Pro / 会员能力**  

客户端会识别该错误卡并抛 `MEMBERSHIP_REQUIRED`。无会员请固定 **Lite + 1K**，prompt 避免「高清」。

**不封装** 4.x、V2-Flash、Nano Banana、GPT Image 等其它模型。

## @ 图片交互

页面文案：

> 描述你的想法，可用 **@ 引用图片、文本、音频或视频** 作为参考。

工具条：

| 控件 | 作用 |
|------|------|
| **@引用角色与素材** | 打开 mention / 素材面板 |
| **上传参考素材** | 触发 `input[type=file]`（multiple，含 image/*） |
| **参考** | 参考相关入口 |

自动化路径：

1. `attachReferenceImages(paths)` → 对隐藏 file input `uploadFile`（多图）  
2. 提示词中写明顺序，例如：  
   `使用第一张参考图作为人物，第二张作为画风`  
3. 发送生成  

（浏览器内真实 @ 选资产依赖账号历史素材；本地文件以上传为准，语义用 prompt 对齐 @。）

## 前置

```bash
npm run chrome:start
# 调试 Chrome 登录 xyq.jianying.com
npm run probe
```

## CLI

```bash
# 探测（积分 + Pro/Lite 是否可见 + @/上传）
npm run xyq:explore

# 文生图（默认 lite，无会员）
npm run xyq:image -- "水彩风格的橘猫"

# 显式 Lite + 双参考图
npm run cli -- xyq image "第一张是人物身份，第二张是画风" \
  --model lite \
  --ref /path/to/person.png \
  --ref /path/to/style.png

# 完整 e2e：人物图 → 场景图 → @ 拼接
npm run test:xyq:e2e
```

## 代码

```js
import {
  connectBrowser,
  closeBrowser,
  XyqClient,
} from './index.mjs';

const browser = await connectBrowser();
try {
  const c = await XyqClient.attach(browser, { forceNewTab: true });

  const credits = await c.getCredits();
  // { free: 68, total: 68, ... }

  // 无会员：用 lite（默认），不要 setModel('pro')
  await c.setModel('lite');

  const img = await c.generateImage('赛博朋克城市夜景'); // 默认 lite + 1K

  const img2 = await c.generateWithRefs(
    '保留第一张人物脸，采用第二张画风',
    ['/tmp/face.png', '/tmp/style.png'],
    { model: 'lite' },
  );

  console.log(img.imagePath, img2.imagePath, img.credit);
} finally {
  await closeBrowser(browser);
}
```

## Tool

| name | 说明 |
|------|------|
| `xyq_image` | 生图，默认 `model=lite`；可 `pro`（需会员）、`ref_images[]` |
| `xyq_credits` | 读积分 |
| `xyq_explore` | 探测 |

## 积分接口

- `GET /commerce/v1/benefits/user_credit` → `free_credits`  
- `POST /commerce/v1/benefits/credit_receive` → 每日领取  
- 流水标题：**每日免费积分** / **积分到期清零**

## 输出

- 图片：`runtime/media/xyq/`  
- 会话：`runtime/sessions/xyq/`  
- e2e 拼接样例：`runtime/media/xyq/e2e-combo/`  
