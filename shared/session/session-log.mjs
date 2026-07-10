/**
 * 会话落盘 + 运行状态感知
 *
 * 目录：
 *   runtime/sessions/<provider>/<sessionId>/
 *     status.json · events.jsonl · conversation.jsonl · conversation.md
 *   runtime/sessions/status-latest.json
 *   runtime/sessions/LATEST
 *
 * phase：idle → running → waiting → done | error
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { SESSIONS_ROOT } from '../config/defaults.mjs';

/**
 * @typedef {'idle'|'running'|'waiting'|'done'|'error'} SessionPhase
 */

export class SessionLog {
  /**
   * @param {{ provider: string, rootDir?: string, sessionId?: string, label?: string }} opts
   * @param opts.provider - 提供方 id，如 gemini
   * @param opts.rootDir - 会话根目录，默认 runtime/sessions
   * @param opts.sessionId - 可选固定会话 id
   * @param opts.label - 展示标签
   */
  constructor(opts) {
    this.provider = opts.provider || 'unknown';
    this.rootDir = opts.rootDir || SESSIONS_ROOT;
    this.sessionId =
      opts.sessionId ||
      new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
    this.label = opts.label || this.provider;
    /** 本会话目录：rootDir/provider/sessionId */
    this.dir = path.join(this.rootDir, this.provider, this.sessionId);
    this.turn = 0;
    /** @type {SessionPhase} */
    this.phase = 'idle';
    this.startedAt = new Date().toISOString();
    this._ready = null;
  }

  /** 本会话相关文件路径 */
  get paths() {
    return {
      dir: this.dir,
      status: path.join(this.dir, 'status.json'),
      events: path.join(this.dir, 'events.jsonl'),
      conversationJsonl: path.join(this.dir, 'conversation.jsonl'),
      conversationMd: path.join(this.dir, 'conversation.md'),
      latestPointer: path.join(this.rootDir, 'LATEST'),
      statusLatest: path.join(this.rootDir, 'status-latest.json'),
    };
  }

  /**
   * 初始化目录与空会话文件（幂等）
   */
  async init() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await this.#writeStatus({ phase: 'idle', message: 'session created' });
      await fs.writeFile(
        this.paths.conversationMd,
        `# ${this.label} 会话 ${this.sessionId}\n\n- 提供方: ${this.provider}\n- 开始: ${this.startedAt}\n\n---\n\n`,
        'utf8',
      );
      await fs.writeFile(
        this.paths.latestPointer,
        `${this.provider}/${this.sessionId}\n`,
        'utf8',
      );
      return true;
    })();
    return this._ready;
  }

  /**
   * 更新 phase 并写入 status.json / status-latest.json
   * @param {SessionPhase} phase
   * @param {string} [message]
   * @param {Record<string, unknown>} [extra]
   */
  async setStatus(phase, message = '', extra = {}) {
    await this.init();
    this.phase = phase;
    await this.#writeStatus({ phase, message, ...extra });
    await this.event(phase, message, extra);
  }

  /**
   * 追加一条事件到 events.jsonl
   * @param {string} type
   * @param {string} [message]
   * @param {Record<string, unknown>} [data]
   */
  async event(type, message = '', data = {}) {
    await this.init();
    const row = {
      ts: new Date().toISOString(),
      type,
      message,
      phase: this.phase,
      turn: this.turn,
      provider: this.provider,
      ...data,
    };
    await fs.appendFile(this.paths.events, JSON.stringify(row) + '\n', 'utf8');
  }

  /**
   * 记录用户消息（turn++，phase=running）
   * @param {string} content
   * @param {Record<string, unknown>} [meta]
   */
  async logUser(content, meta = {}) {
    await this.init();
    this.turn += 1;
    const entry = {
      ts: new Date().toISOString(),
      turn: this.turn,
      role: 'user',
      content,
      provider: this.provider,
      ...meta,
    };
    await fs.appendFile(
      this.paths.conversationJsonl,
      JSON.stringify(entry) + '\n',
      'utf8',
    );
    await fs.appendFile(
      this.paths.conversationMd,
      `## Turn ${this.turn} · 用户\n\n${content}\n\n`,
      'utf8',
    );
    await this.setStatus('running', 'user message sent', {
      turn: this.turn,
      promptPreview: String(content).slice(0, 120),
    });
    return entry;
  }

  /**
   * 记录助手回复（phase=done）
   * @param {string} content
   * @param {Record<string, unknown>} [meta] - 可含 media、screenshot
   */
  async logAssistant(content, meta = {}) {
    await this.init();
    const entry = {
      ts: new Date().toISOString(),
      turn: this.turn,
      role: 'assistant',
      content,
      provider: this.provider,
      ...meta,
    };
    await fs.appendFile(
      this.paths.conversationJsonl,
      JSON.stringify(entry) + '\n',
      'utf8',
    );
    let md = `### 助手\n\n${content || '_(空回复)_'}\n\n`;
    if (meta.media) md += `媒体: \`${JSON.stringify(meta.media)}\`\n\n`;
    if (meta.screenshot) md += `截图: \`${meta.screenshot}\`\n\n`;
    md += `---\n\n`;
    await fs.appendFile(this.paths.conversationMd, md, 'utf8');
    await this.setStatus('done', 'assistant reply received', {
      turn: this.turn,
      replyPreview: String(content || '').slice(0, 160),
      replyLength: String(content || '').length,
      media: meta.media,
    });
    return entry;
  }

  /**
   * 标记等待模型中（phase=waiting），供轮询进度
   * @param {Record<string, unknown>} [progress]
   */
  async logWaiting(progress = {}) {
    await this.setStatus('waiting', 'waiting for model response', progress);
  }

  /**
   * 记录错误（phase=error）
   * @param {string} error
   * @param {Record<string, unknown>} [extra]
   */
  async logError(error, extra = {}) {
    await this.init();
    await this.setStatus('error', error, extra);
    await fs.appendFile(
      this.paths.conversationMd,
      `### 错误\n\n\`\`\`\n${error}\n\`\`\`\n\n---\n\n`,
      'utf8',
    );
  }

  /**
   * 将页面导出的历史写入会话文件
   * @param {{ index: number, role: string, text: string }[]} history
   */
  async importHistory(history) {
    await this.init();
    const stamp = new Date().toISOString();
    for (const h of history) {
      const entry = {
        ts: stamp,
        turn: h.index + 1,
        role: h.role === 'model' ? 'assistant' : h.role,
        content: h.text,
        source: 'page_export',
        provider: this.provider,
      };
      await fs.appendFile(
        this.paths.conversationJsonl,
        JSON.stringify(entry) + '\n',
        'utf8',
      );
    }
    await fs.appendFile(
      this.paths.conversationMd,
      `\n## 从页面导出 (${stamp})\n\n` +
        history
          .map(
            (h) =>
              `### ${h.role === 'model' ? '助手' : h.role} #${h.index}\n\n${h.text}\n`,
          )
          .join('\n') +
        '\n---\n\n',
      'utf8',
    );
    await this.event('import_history', `imported ${history.length} turns`);
  }

  async #writeStatus(payload) {
    const body = {
      provider: this.provider,
      sessionId: this.sessionId,
      label: this.label,
      dir: this.dir,
      updatedAt: new Date().toISOString(),
      startedAt: this.startedAt,
      turn: this.turn,
      ...payload,
    };
    await fs.writeFile(this.paths.status, JSON.stringify(body, null, 2), 'utf8');
    await fs.writeFile(
      this.paths.statusLatest,
      JSON.stringify(body, null, 2),
      'utf8',
    );
  }

  /**
   * 读取全局最新状态
   * @param {string} [rootDir]
   */
  static async readLatest(rootDir = SESSIONS_ROOT) {
    try {
      const raw = await fs.readFile(
        path.join(rootDir, 'status-latest.json'),
        'utf8',
      );
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * 读取某会话目录的 status.json
   * @param {string} sessionDir
   */
  static async readStatus(sessionDir) {
    try {
      const raw = await fs.readFile(path.join(sessionDir, 'status.json'), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
