import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AppError } from './network.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export class CharacterVoice {
  constructor({ configFile = path.join(root, '.character-voice-runtime/ready.json'), spawnChild = spawn, idleMs = 120000, timeoutMs = 90000 } = {}) {
    this.configFile = configFile; this.spawnChild = spawnChild; this.idleMs = idleMs; this.timeoutMs = timeoutMs;
    this.child = null; this.pending = new Map(); this.idle = null;
  }
  config() {
    try {
      const value = JSON.parse(readFileSync(this.configFile, 'utf8')), weights = value.weights || {};
      const required = [value.python, value.referenceAudio, value.repository, weights.t2s_weights_path, weights.vits_weights_path, ...['bert_base_path', 'cnhuhbert_base_path'].flatMap(key => weights[key] ? [path.join(weights[key], 'config.json'), path.join(weights[key], 'pytorch_model.bin')] : [null])];
      return value.engine === 'gpt-sovits-v2' && required.every(item => typeof item === 'string' && existsSync(item)) ? value : null;
    } catch { return null; }
  }
  available() { return Boolean(this.config()); }
  stop(error = new AppError('角色语音已停止。', 409, 'CHARACTER_VOICE_CANCELLED')) {
    clearTimeout(this.idle); const child = this.child; this.child = null;
    for (const item of this.pending.values()) { item.cleanup(); item.reject(error); } this.pending.clear(); child?.kill();
  }
  start() {
    if (this.child) return this.child;
    const config = this.config(); if (!config) throw new AppError('参考音色还没有准备好，请先使用其他声音。', 503, 'CHARACTER_VOICE_UNAVAILABLE');
    const child = this.spawnChild(config.python, ['-u', path.join(root, 'server/character-voice-worker.py'), this.configFile], { cwd: config.repository, stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false', OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', line => {
      let result; try { result = JSON.parse(line); } catch { return; }
      const item = this.pending.get(result.id); if (!item) return;
      this.pending.delete(result.id); item.cleanup();
      if (!result.ok || !(result.duration > 0 && result.duration <= 120)) item.reject(new AppError('角色声音暂时没生成好，这条先发文字。', 502, result.code === 'OUT_OF_MEMORY' ? 'CHARACTER_VOICE_MEMORY' : 'CHARACTER_VOICE_FAILED'));
      else item.resolve(result);
      if (!this.pending.size) { clearTimeout(this.idle); this.idle = setTimeout(() => this.stop(), this.idleMs); this.idle.unref?.(); }
    });
    const failed = () => { if (this.child === child) this.stop(new AppError('角色语音服务中断，这条先发文字。', 503, 'CHARACTER_VOICE_PROCESS_FAILED')); };
    child.on('error', failed); child.on('exit', failed); child.stdin.on('error', failed); return child;
  }
  async synthesize(text, preferences, signal) {
    if (!this.available()) throw new AppError('参考音色还没有准备好。', 503, 'CHARACTER_VOICE_UNAVAILABLE');
    if (!text || text.length > 200) throw new AppError('这段内容比较长，参考音色先用在简短回复里。', 422, 'CHARACTER_VOICE_TEXT_LIMIT');
    if (signal?.aborted) throw signal.reason;
    if (this.pending.size) throw new AppError('还有一段角色语音正在准备，稍后再试。', 429, 'CHARACTER_VOICE_BUSY');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dafeiyu-character-'));
    try {
      if (signal?.aborted) throw signal.reason;
      if (this.pending.size) throw new AppError('还有一段角色语音正在准备，稍后再试。', 429, 'CHARACTER_VOICE_BUSY');
      const child = this.start(), output = path.join(directory, 'voice.wav'); clearTimeout(this.idle);
      const result = await new Promise((resolve, reject) => {
        const requestId = randomUUID();
        const abort = () => this.stop(new AppError('角色语音已取消。', 409, 'CHARACTER_VOICE_CANCELLED'));
        const timer = setTimeout(() => this.stop(new AppError('角色语音准备超时，这条先发文字。', 504, 'CHARACTER_VOICE_TIMEOUT')), this.timeoutMs);
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        this.pending.set(requestId, { resolve, reject, cleanup }); signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) return abort();
        child.stdin.write(JSON.stringify({ id: requestId, text, output, rate: preferences.rate }) + '\n');
      });
      if (signal?.aborted) throw signal.reason;
      const data = await readFile(output);
      if (data.length < 44 || data.length > 8 * 1024 * 1024 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') throw new AppError('生成的角色语音不完整。', 502, 'CHARACTER_VOICE_INVALID_AUDIO');
      return { data, duration: result.duration, engine: 'gpt-sovits-v2' };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  close() { this.stop(); }
}
