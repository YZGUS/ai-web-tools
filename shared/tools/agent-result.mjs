/**
 * Agent 友好的 tool 结果规范化
 *
 * 所有网页提供方最终都给 Agent 用：返回必须稳定、可 JSON 序列化、
 * 有一眼可读的 content，文件结果有 path 列表。
 *
 * @module shared/tools/agent-result
 */

/**
 * @typedef {{ path: string, kind: 'image'|'video'|'file', mime?: string|null }} AgentFile
 *
 * @typedef {object} AgentToolResult
 * @property {boolean} ok
 * @property {string|null} [tool]
 * @property {string|null} [provider]
 * @property {string} content          给 LLM 的主文案（优先读这个）
 * @property {string|null} text        对话/研究正文（若有）
 * @property {AgentFile[]} files       落盘文件
 * @property {string|null} [imagePath]
 * @property {string|null} [videoPath]
 * @property {string|null} [filePath]
 * @property {string|null} [sessionDir]
 * @property {string|null} [pageUrl]
 * @property {number|null} [elapsedMs]
 * @property {string|null} [model]
 * @property {object|null} [credit]
 * @property {{ code?: string, message: string, screenshot?: string|null }} [error]
 * @property {object} [data]           精简后的结构化字段（非 raw 全量）
 */

/**
 * 从各 provider 原始返回里收集文件路径
 * @param {object|null|undefined} raw
 * @returns {AgentFile[]}
 */
export function collectAgentFiles(raw) {
  if (!raw || typeof raw !== 'object') return [];
  /** @type {AgentFile[]} */
  const files = [];
  const push = (p, kind, mime) => {
    if (!p || typeof p !== 'string') return;
    if (files.some((f) => f.path === p)) return;
    files.push({ path: p, kind, mime: mime || null });
  };

  push(raw.imagePath, 'image', raw.mime);
  push(raw.videoPath, 'video', raw.mime);
  push(raw.filePath, raw.videoPath ? 'video' : raw.imagePath ? 'image' : 'file', raw.mime);

  if (raw.media?.path) {
    const k =
      raw.media.kind === 'video'
        ? 'video'
        : raw.media.kind === 'image'
          ? 'image'
          : 'file';
    push(raw.media.path, k, raw.media.mime);
  }
  if (Array.isArray(raw.media)) {
    for (const m of raw.media) {
      if (m?.path) {
        push(
          m.path,
          m.kind === 'video' ? 'video' : m.kind === 'image' ? 'image' : 'file',
          m.mime,
        );
      }
    }
  }
  if (Array.isArray(raw.files)) {
    for (const f of raw.files) {
      if (typeof f === 'string') push(f, 'file');
      else if (f?.path) push(f.path, f.kind || 'file', f.mime);
    }
  }
  if (Array.isArray(raw.outputs)) {
    for (const o of raw.outputs) {
      if (typeof o === 'string') push(o, 'file');
      else if (o?.path) push(o.path, o.kind || 'file', o.mime);
    }
  }
  return files;
}

/**
 * 拼给 Agent 阅读的主 content（短、信息全）
 * @param {{
 *   ok: boolean,
 *   text?: string|null,
 *   files?: AgentFile[],
 *   raw?: object|null,
 *   error?: { message?: string, code?: string }|null,
 * }} p
 */
export function buildAgentContent(p) {
  if (!p.ok) {
    const code = p.error?.code ? `[${p.error.code}] ` : '';
    return `工具调用失败：${code}${p.error?.message || 'unknown error'}`;
  }

  const lines = [];
  const text = (p.text || '').trim();
  const files = p.files || [];
  const raw = p.raw || {};

  if (text) {
    // Agent context 不宜无限长；过长截断并提示路径
    const max = 12_000;
    if (text.length > max) {
      lines.push(text.slice(0, max) + `\n…(正文已截断，共 ${text.length} 字，完整见 session 落盘)`);
    } else {
      lines.push(text);
    }
  }

  if (files.length) {
    lines.push(
      files
        .map((f) => {
          const dim =
            raw.width && raw.height && f.kind === 'image'
              ? ` ${raw.width}x${raw.height}`
              : '';
          return `[${f.kind}${dim}] ${f.path}`;
        })
        .join('\n'),
    );
  }

  if (!text && !files.length) {
    // explore / credits 等
    if (raw.credit) {
      lines.push(
        `积分: free=${raw.credit.free ?? '?'} total=${raw.credit.total ?? '?'}`,
      );
    } else if (raw.capabilities || raw.modes || raw.capsules) {
      lines.push(
        `探测成功 provider=${raw.provider || '?'} url=${raw.url || raw.pageUrl || ''}`,
      );
    } else if (raw.status) {
      lines.push(
        `会话状态: phase=${raw.status.phase || '?'} ${raw.status.message || ''}`.trim(),
      );
    } else {
      lines.push('工具执行成功（无正文/文件，见 data 字段）');
    }
  }

  if (raw.model || raw.mode || raw.modelLabel) {
    lines.push(
      `meta: model/mode=${raw.model || raw.mode || raw.modelLabel}` +
        (raw.elapsedMs != null ? ` elapsedMs=${raw.elapsedMs}` : ''),
    );
  }

  return lines.filter(Boolean).join('\n\n');
}

/**
 * 将任意 provider 原始结果 → AgentToolResult
 *
 * @param {object|null|undefined} raw
 * @param {{ tool?: string, provider?: string, includeRaw?: boolean }} [meta]
 * @returns {AgentToolResult}
 */
export function toAgentResult(raw, meta = {}) {
  const ok = raw?.ok !== false && !raw?.error;
  const text =
    typeof raw?.reply === 'string'
      ? raw.reply
      : typeof raw?.text === 'string'
        ? raw.text
        : typeof raw?.message === 'string' && raw?.ok
          ? raw.message
          : null;

  const files = collectAgentFiles(raw);
  const content = buildAgentContent({
    ok,
    text,
    files,
    raw,
    error: raw?.error || null,
  });

  /** @type {AgentToolResult} */
  const out = {
    ok,
    tool: meta.tool || raw?.tool || null,
    provider: meta.provider || raw?.provider || null,
    content,
    text,
    files,
    imagePath:
      files.find((f) => f.kind === 'image')?.path || raw?.imagePath || null,
    videoPath:
      files.find((f) => f.kind === 'video')?.path || raw?.videoPath || null,
    filePath:
      raw?.filePath ||
      files[0]?.path ||
      null,
    sessionDir: raw?.session?.dir || null,
    pageUrl: raw?.pageUrl || raw?.url || null,
    elapsedMs: raw?.elapsedMs ?? null,
    model: raw?.model || raw?.mode || raw?.modelLabel || null,
    credit: raw?.credit || null,
    data: pickData(raw),
  };

  if (!ok && raw?.error) {
    out.error =
      typeof raw.error === 'object'
        ? {
            code: raw.error.code,
            message: raw.error.message || String(raw.error),
            screenshot: raw.error.screenshot || raw.screenshot || null,
          }
        : { message: String(raw.error) };
  }

  if (meta.includeRaw) out.raw = raw;
  return out;
}

/**
 * 错误 → AgentToolResult（Agent 侧优先不要 throw）
 * @param {unknown} err
 * @param {{ tool?: string, provider?: string }} [meta]
 * @returns {AgentToolResult}
 */
export function toAgentError(err, meta = {}) {
  const message =
    err instanceof Error ? err.message : String(err ?? 'unknown error');
  const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
  const screenshot =
    err && typeof err === 'object' && 'screenshot' in err
      ? err.screenshot
      : null;

  return {
    ok: false,
    tool: meta.tool || null,
    provider: meta.provider || (err && err.provider) || null,
    content: `工具调用失败：${code ? `[${code}] ` : ''}${message}`,
    text: null,
    files: [],
    imagePath: null,
    videoPath: null,
    filePath: null,
    sessionDir: null,
    pageUrl: null,
    elapsedMs: null,
    model: null,
    credit: null,
    error: {
      code: code ? String(code) : undefined,
      message,
      screenshot: screenshot || null,
    },
    data: null,
  };
}

/**
 * 精简 data，去掉过大/循环字段
 * @param {object|null|undefined} raw
 */
function pickData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const skip = new Set([
    'reply',
    'text',
    'imagePath',
    'videoPath',
    'filePath',
    'media',
    'session',
    'buffer',
    'base64',
    'screenshot',
  ]);
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [k, v] of Object.entries(raw)) {
    if (skip.has(k)) continue;
    if (v == null) continue;
    if (typeof v === 'function') continue;
    if (typeof v === 'string' && v.length > 2000) {
      data[k] = v.slice(0, 2000) + '…';
      continue;
    }
    if (typeof v === 'object') {
      try {
        const s = JSON.stringify(v);
        if (s.length > 4000) {
          data[k] = { _truncated: true, preview: s.slice(0, 500) };
          continue;
        }
      } catch {
        continue;
      }
    }
    data[k] = v;
  }
  return Object.keys(data).length ? data : null;
}
