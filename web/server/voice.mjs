import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AppError } from './network.mjs';
import { CharacterVoice } from './character-voice.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const voiceChoices = [{ id: 'xiaoxiao', name: '温柔舒缓 · 晓晓', voice: 'zh-CN-XiaoxiaoNeural' }, { id: 'xiaoyi', name: '清亮自然 · 晓伊', voice: 'zh-CN-XiaoyiNeural' }, { id: 'klee', name: '可莉参考音色 · 本地生成' }];
export const voiceDefaults = () => ({ enabled: true, mode: 'auto', speaker: 'xiaoxiao', rate: -8, autoplay: false });
export function voiceIntent(message, plan, preferences, available, hasUserAudio = false) {
  const declined = /(?:不要|不用|别|不想|不方便|不能).{0,8}(?:语音|声音|听)|(?:只|仅).{0,4}(?:文字|打字)/.test(message);
  const explicit = /(?:发|用|来|说).{0,8}语音|(?:想听|听听|听一下|听你的?).{0,6}(?:声音|说话)|(?:说一句话|说句话|说句|开口).{0,6}(?:听|我)|(?:读|念).{0,6}(?:给我|一遍|一下)|(?:语音|声音).{0,8}(?:回复|回答|跟我)/.test(message);
  return { requested: Boolean(preferences.enabled && available && !declined && (explicit || hasUserAudio || preferences.mode === 'voice' || plan.reply_mode === 'voice')), explicit, declined };
}
export function spokenText(reply) {
  return reply.replace(/```[\s\S]*?```/g, '').replace(/https?:\/\/\S+/g, '这个链接').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
}
export class Voice {
  constructor(cloud) { this.cloud = cloud; this.children = new Set(); this.character = new CharacterVoice(); }
  python() { return process.env.QING_TTS_PYTHON || path.join(root, '.speech-runtime/bin/python'); }
  status() { const edgeReady = existsSync(this.python()) && existsSync(path.join(root, '.speech-runtime/tts-ready.json')), characterReady = this.character.available(); const cloud = this.cloud?.options().ttsEnabled; return { available: cloud ? Boolean(this.cloud.key()) && this.cloud.status().audioReady : edgeReady || characterReady, engine: cloud ? 'aliyun-bailian' : characterReady ? 'edge-tts+gpt-sovits-v2' : 'edge-tts', maxCharacters: 360, voices: voiceChoices.filter(item => item.id === 'klee' ? characterReady : edgeReady).map(({ id, name }) => ({ id, name })) }; }
  async synthesize(reply, preferences, signal) {
    if (!this.status().available) throw new AppError('语音合成尚未安装，这条可以先看文字。', 503, 'VOICE_UNAVAILABLE');
    const value = spokenText(reply);
    if (!value || value.length > 360 || /```/.test(reply)) throw new AppError('这条内容较长或包含代码，先用文字更方便。', 422, 'VOICE_TEXT_LIMIT');
    if (this.cloud?.options().ttsEnabled) return this.cloud.synthesize(value, preferences, signal);
    if (preferences.speaker === 'klee') return this.character.synthesize(value, preferences, signal);
    if (this.children.size >= 2) throw new AppError('还有语音正在准备，稍等一下再试。', 429, 'VOICE_BUSY');
    if (signal?.aborted) throw signal.reason;
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dafeiyu-voice-'));
    try {
      const file = path.join(directory, 'voice.mp3');
      const metadata = await new Promise((resolve, reject) => {
        const child = spawn(this.python(), ['-u', path.join(root, 'server/tts-worker.py')], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, PYTHONIOENCODING: 'utf-8' } });
        this.children.add(child); let output = '', settled = false;
        const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); this.children.delete(child); child.kill(); error ? reject(error) : resolve(result); };
        const abort = () => finish(new AppError('语音准备已取消。', 409, 'VOICE_CANCELLED'));
        const timer = setTimeout(() => finish(new AppError('语音准备超时，这条先发文字。', 504, 'VOICE_TIMEOUT')), 35000);
        signal?.addEventListener('abort', abort, { once: true });
        child.on('error', () => finish(new AppError('语音服务未能启动，这条先发文字。', 503, 'VOICE_START_FAILED')));
        child.stdin.on('error', () => finish(new AppError('语音准备中断，这条先发文字。', 503, 'VOICE_PROCESS_FAILED')));
        child.stdout.on('data', chunk => { output += chunk; if (output.length > 4096) finish(new AppError('语音服务返回异常。', 502, 'VOICE_INVALID_RESULT')); });
        child.on('exit', code => { try { const result = JSON.parse(output); if (code !== 0 || result.ok !== true || !(result.duration > 0 && result.duration <= 120)) throw new Error(); finish(null, result); } catch { finish(new AppError('声音暂时没准备好，这条先发文字。', 502, 'VOICE_SYNTHESIS_FAILED')); } });
        if (signal?.aborted) return abort();
        const speaker = voiceChoices.find(item => item.id === preferences.speaker) || voiceChoices[0];
        child.stdin.end(JSON.stringify({ text: value, voice: speaker.voice, rate: `${preferences.rate >= 0 ? '+' : ''}${preferences.rate}%`, path: file }));
      });
      if (signal?.aborted) throw signal.reason;
      const data = await readFile(file);
      if (data.length < 100 || data.length > 4 * 1024 * 1024) throw new AppError('语音文件不完整。', 502, 'VOICE_INVALID_AUDIO');
      return { data, duration: metadata.duration, engine: 'edge-tts' };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  close() { this.character.close(); for (const child of this.children) child.kill(); this.children.clear(); }
}
