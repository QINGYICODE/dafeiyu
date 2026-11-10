import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { AppError } from './network.mjs';
import { id } from './store.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
export class Speech {
  constructor(cloud) { this.cloud = cloud; this.child = null; this.pending = new Map(); }
  status() { if (this.cloud?.options().asrEnabled) return { available: Boolean(this.cloud.key()) && this.cloud.status().audioReady, engine: 'aliyun-bailian', maxSeconds: 120 }; return { available: existsSync(this.python()) && existsSync(path.join(this.model(), 'model.bin')), engine: 'local-whisper', maxSeconds: 120 }; }
  python() { return process.env.QING_SPEECH_PYTHON || path.join(webRoot, '.speech-runtime/bin/python'); }
  model() { return process.env.QING_WHISPER_MODEL || path.join(webRoot, '.speech-runtime/models/base'); }
  start() {
    if (this.child) return this.child;
    if (!this.status().available) throw new AppError('本机语音识别还未安装，语音仍可播放；可先发文字或图片。', 503, 'SPEECH_UNAVAILABLE');
    const child = spawn(this.python(), ['-u', path.join(webRoot, 'server/speech-worker.py'), this.model()], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, HF_HUB_OFFLINE: '1' } });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', line => {
      let result; try { result = JSON.parse(line); } catch { return; }
      const pending = this.pending.get(result.id); if (!pending) return;
      this.pending.delete(result.id); pending.cleanup();
      if (result.error) pending.reject(new AppError(result.error, 422, 'SPEECH_DECODE_FAILED')); else pending.resolve(result);
    });
    const failed = () => { if (this.child !== child) return; this.child = null; for (const item of this.pending.values()) { item.cleanup(); item.reject(new AppError('语音识别暂时中断，请重新发送。', 503)); } this.pending.clear(); };
    child.on('error', failed); child.on('exit', failed); child.stdin.on('error', failed); return child;
  }
  transcribe(filename, signal) {
    if (this.cloud?.options().asrEnabled) return this.cloud.transcribe(filename, signal);
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.pending.size >= 3) return Promise.reject(new AppError('还有语音正在听，稍等一下再发。', 429));
    let child; try { child = this.start(); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const requestId = id();
      const stopIdle = () => { if (!this.pending.size && this.child === child) { this.child = null; child.kill(); } };
      const abort = () => { this.pending.delete(requestId); cleanup(); reject(new AppError('语音识别已取消。', 409)); stopIdle(); };
      const timer = setTimeout(() => { this.pending.delete(requestId); cleanup(); reject(new AppError('语音识别超时，可以重发一段短一点的。', 504)); stopIdle(); }, 120000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      signal?.addEventListener('abort', abort, { once: true });
      this.pending.set(requestId, { resolve, reject, cleanup });
      child.stdin.write(JSON.stringify({ id: requestId, path: filename }) + '\n');
    });
  }
  close() { this.child?.kill(); this.child = null; for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(new AppError('语音识别已停止。', 409)); } this.pending.clear(); }
}
