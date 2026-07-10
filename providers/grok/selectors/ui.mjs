/**
 * Grok / Imagine 选择器与 URL
 * 实测：https://grok.com/imagine/
 */

export const GROK_URL = 'https://grok.com/';
export const GROK_ORIGIN = 'https://grok.com';
export const GROK_IMAGINE_URL = 'https://grok.com/imagine/';

/** Imagine 输入框 */
export const IMAGINE_EDITOR_SEL =
  '[aria-label="Ask Grok anything"], div.tiptap.ProseMirror[contenteditable="true"]';

/** 参考图：支持 multiple */
export const IMAGINE_FILE_INPUT_SEL = 'input[type="file"][name="files"]';

/** 提交（须真实鼠标 pointer 链，page.click 不可靠） */
export const IMAGINE_SUBMIT_SEL =
  'button[type="submit"][aria-label="提交"], button[type="submit"][aria-label="Submit"]';

/** 生成完成主信号 */
export const IMAGINE_DOWNLOAD_SEL =
  'button[aria-label="下载"], button[aria-label="Download"]';

export const IMAGINE_RATIO_BTN_SEL =
  'button[aria-label="宽高比"], button[aria-label="Aspect ratio"]';

/** 模式 radio 文案（中文 UI） */
export const IMAGINE_MODE_LABELS = Object.freeze({
  image: '图片',
  video: '视频',
  agent: '代理',
});

/** 图片质量 radio */
export const IMAGINE_QUALITY_LABELS = Object.freeze({
  speed: '速度',
  quality: '质量',
});

/** 视频分辨率 / 时长 */
export const IMAGINE_VIDEO_RES = Object.freeze(['480p', '720p']);
export const IMAGINE_VIDEO_DURATION = Object.freeze(['6s', '10s']);

/** 宽高比前缀（menuitem 如 "2:3高"） */
export const IMAGINE_RATIOS = Object.freeze([
  '2:3',
  '3:2',
  '1:1',
  '9:16',
  '16:9',
]);

/** 生成结果 assets 域名 */
export const GROK_ASSET_RE = /assets\.grok\.com\/users\//i;
