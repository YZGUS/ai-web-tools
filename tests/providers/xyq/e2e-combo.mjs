/**
 * 小云雀完整链路 e2e：
 * 1) 生成人物图
 * 2) 生成场景图
 * 3) 用 @/上传参考图把人物拼进场景
 *
 * 免费档约定：model=lite + 分辨率 1K（2K 易触发会员墙）
 *
 * 用法：
 *   node tests/providers/xyq/e2e-combo.mjs
 *   node tests/providers/xyq/e2e-combo.mjs --model lite
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectBrowser,
  closeBrowser,
  XyqClient,
  PKG_ROOT,
} from '../../../index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(PKG_ROOT, 'runtime/media/xyq/e2e-combo');
const MODEL = process.argv.includes('--model')
  ? process.argv[process.argv.indexOf('--model') + 1]
  : 'lite';
const TIMEOUT = 240_000;

// 避免「高清」等词，减少 agent 走 2K/会员档工具参数
const PERSON_PROMPT =
  '半身人像，东亚年轻女性，齐肩黑发，白色衬衫，柔和棚拍，浅灰背景，写实面部清晰，中景，1K';
const SCENE_PROMPT =
  '空无一人的日系咖啡馆窗边座位，木质桌椅，窗外绿植与午后阳光，温暖柔和光线，写实照片，广角，1K';
const COMBO_PROMPT =
  '将第一张参考图中的人物自然地放入第二张参考图的咖啡馆场景中：人物坐在窗边座位上，' +
  '保持人物脸部、发型、服饰一致，光影与场景融合，写实照片，全身或半身构图，1K';

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

async function writeReport(report) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUT_DIR, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    model: MODEL,
    resolution: '1K',
    steps: [],
    ok: false,
  };

  console.log(`[e2e-combo] model=${MODEL} out=${OUT_DIR}`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await connectBrowser();
  /** @type {XyqClient | null} */
  let client = null;

  try {
    client = await XyqClient.attach(browser, {
      forceNewTab: true,
      sessionLog: true,
      sessionId: `e2e-combo-${nowId()}`,
    });

    // 0) credits
    await client.open({ waitReady: true });
    const credits0 = await client.getCredits().catch(() => null);
    report.steps.push({ n: '0-credits', t: new Date().toISOString(), ...credits0 });
    console.log('[0] credits', credits0);

    // 强制 1K + lite 探测
    const res1k = await client.setResolution1K().catch((e) => ({ ok: false, err: e.message }));
    const modelSet = await client.setModel(MODEL).catch((e) => ({ ok: false, err: e.message }));
    report.steps.push({ n: '0-settings', res1k, modelSet });
    console.log('[0] settings', { res1k, modelSet });
    await client.screenshot({ path: path.join(OUT_DIR, '00-ready.png') });

    // 1) 人物图
    console.log('[1] person…');
    const person = await client.generateImage(PERSON_PROMPT, {
      model: MODEL,
      timeout: TIMEOUT,
      open: true,
      outputDir: OUT_DIR,
      filename: `01-person-${nowId()}`,
    });
    report.steps.push({
      n: '1-person',
      t: new Date().toISOString(),
      imagePath: person.imagePath,
      w: person.width,
      h: person.height,
      model: person.model,
      credit: person.credit,
    });
    console.log('[1] ok', person.imagePath, `${person.width}x${person.height}`);

    // 2) 场景图
    console.log('[2] scene…');
    const scene = await client.generateImage(SCENE_PROMPT, {
      model: MODEL,
      timeout: TIMEOUT,
      open: true,
      outputDir: OUT_DIR,
      filename: `02-scene-${nowId()}`,
    });
    report.steps.push({
      n: '2-scene',
      t: new Date().toISOString(),
      imagePath: scene.imagePath,
      w: scene.width,
      h: scene.height,
      model: scene.model,
      credit: scene.credit,
    });
    console.log('[2] ok', scene.imagePath, `${scene.width}x${scene.height}`);

    // 3) @ 拼接
    console.log('[3] combo with refs…');
    const combo = await client.generateWithRefs(
      COMBO_PROMPT,
      [person.imagePath, scene.imagePath],
      {
        model: MODEL,
        timeout: TIMEOUT,
        open: true,
        outputDir: OUT_DIR,
        filename: `03-combo-${nowId()}`,
      },
    );
    report.steps.push({
      n: '3-combo',
      t: new Date().toISOString(),
      imagePath: combo.imagePath,
      w: combo.width,
      h: combo.height,
      model: combo.model,
      refImages: combo.refImages,
      credit: combo.credit,
    });
    console.log('[3] ok', combo.imagePath, `${combo.width}x${combo.height}`);

    const creditsEnd = await client.getCredits().catch(() => null);
    report.steps.push({ n: '9-credits-end', t: new Date().toISOString(), ...creditsEnd });
    report.ok = true;
    report.finishedAt = new Date().toISOString();
    report.outputs = {
      person: person.imagePath,
      scene: scene.imagePath,
      combo: combo.imagePath,
    };
    await writeReport(report);
    console.log('[e2e-combo] SUCCESS');
    console.log(JSON.stringify(report.outputs, null, 2));
    process.exitCode = 0;
  } catch (err) {
    report.ok = false;
    report.error = err instanceof Error ? err.message : String(err);
    report.code = err?.code || null;
    report.screenshot = err?.screenshot || null;
    report.finishedAt = new Date().toISOString();
    try {
      if (client) {
        await client.screenshot({ path: path.join(OUT_DIR, 'error.png') });
      }
    } catch {
      // ignore
    }
    await writeReport(report);
    console.error('[e2e-combo] FAIL', report.code, report.error);
    process.exitCode = 1;
  } finally {
    // 不关用户 Chrome，只断开 puppeteer 连接
    try {
      await closeBrowser(browser);
    } catch {
      // ignore
    }
  }
}

main();
