import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AppError, boundedBody, publicUrl, text } from './network.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cloneEndpoint = '/api/v1/services/audio/tts/customization';
export const cloudSpeechDefaults = () => ({ region: 'beijing', workspaceId: '', asrEnabled: false, ttsEnabled: false, asrModel: 'qwen3-asr-flash', ttsModel: 'qwen-audio-3.1-tts-flash', voiceId: 'qiaoxiaojiao_v3.1', hotwords: '大肥鱼、可莉、DeepSeek、B站、抖音、小红书', language: 'auto' });
export function cloudSpeechSettings(input, previous = cloudSpeechDefaults()) {
  const next = { ...previous };
  for (const key of ['asrEnabled', 'ttsEnabled']) if (typeof input[key] === 'boolean') next[key] = input[key];
  if (input.region !== undefined) { if (!['beijing', 'singapore'].includes(input.region)) throw new AppError('请选择北京或新加坡地域。'); next.region = input.region; }
  for (const key of ['workspaceId', 'asrModel', 'ttsModel', 'voiceId']) if (input[key] !== undefined) {
    const value = text(input[key], 200);
    if ((key !== 'workspaceId' && !value) || (value && !/^[a-zA-Z0-9_.-]+$/.test(value))) throw new AppError('语音模型、音色或业务空间格式不正确。');
    next[key] = value;
  }
  if (input.hotwords !== undefined) next.hotwords = text(input.hotwords, 800);
  if (['auto', 'zh', 'yue', 'en'].includes(input.language)) next.language = input.language;
  if (!/^qwen(?:3-asr-flash|3-asr-flash-\d[\w-]*|-(?:audio-)[\w.-]+asr[\w.-]*)$/.test(next.asrModel)) throw new AppError('请选择受支持的千问短语音识别模型。');
  if (!/^qwen-audio-[\d.]+-tts-(?:flash|plus)$/.test(next.ttsModel)) throw new AppError('声音合成请选择 Qwen-Audio-TTS flash 或 plus 模型。');
  return next;
}

export class CloudSpeech {
  constructor(store, { fetcher = fetch, validateUrl = publicUrl } = {}) { this.store = store; this.fetcher = fetcher; this.validateUrl = validateUrl; this.children = new Set(); this.controllers = new Set(); this.enrollment = null; }
  options() { return { ...cloudSpeechDefaults(), ...this.store.get('settings')?.cloudSpeech }; }
  key() { return process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || ''; }
  python() { return process.env.QING_SPEECH_PYTHON || path.join(root, '.speech-runtime/bin/python'); }
  base(options = this.options()) {
    const workspaceId = options.workspaceId || process.env.DASHSCOPE_WORKSPACE_ID || '';
    if (workspaceId && !/^[a-zA-Z0-9-]+$/.test(workspaceId)) throw new AppError('业务空间 ID 格式不正确。');
    return workspaceId ? `https://${workspaceId}.${options.region === 'singapore' ? 'ap-southeast-1' : 'cn-beijing'}.maas.aliyuncs.com` : `https://${options.region === 'singapore' ? 'dashscope-intl' : 'dashscope'}.aliyuncs.com`;
  }
  account(options = this.options()) { return createHash('sha256').update(this.base(options) + '\0' + this.key()).digest('hex'); }
  status() {
    const keySource = process.env.DASHSCOPE_API_KEY ? 'DASHSCOPE_API_KEY' : process.env.QWEN_API_KEY ? 'QWEN_API_KEY' : null;
    const clone = this.store.get('cloudVoice'), connection = this.store.get('cloudSpeechTest');
    return { keyConfigured: Boolean(this.key()), keySource, audioReady: existsSync(this.python()), workspaceFromEnvironment: Boolean(process.env.DASHSCOPE_WORKSPACE_ID), connection: connection ? { ok: connection.ok, at: connection.at, model: connection.model, current: connection.account === this.account() && connection.model === this.options().asrModel } : null, clone: clone ? { voiceId: clone.voiceId, model: clone.model, status: clone.status, createdAt: clone.createdAt, compatible: clone.model === this.options().ttsModel && clone.account === this.account() } : null, referenceAvailable: existsSync(this.reference()) };
  }
  reference() { return path.resolve(root, '../中文语音可莉.wav'); }
  async request(endpoint, payload, signal, options = this.options()) {
    if (!this.key()) throw new AppError('尚未配置 QWEN_API_KEY 或 DASHSCOPE_API_KEY，请配置后重启伙伴服务。', 503, 'BAILIAN_KEY_MISSING');
    if (this.controllers.size >= 4) throw new AppError('还有语音正在处理，请稍候。', 429, 'SPEECH_BUSY');
    const controller = new AbortController(); this.controllers.add(controller);
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(60000), ...(signal ? [signal] : [])]);
    try {
      const response = await this.fetcher(this.base(options) + endpoint, { method: 'POST', headers: { Authorization: `Bearer ${this.key()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: combined, redirect: 'error' });
      const data = await boundedBody(response, 1024 * 1024); let result;
      try { result = JSON.parse(data.toString()); } catch { throw new AppError('百炼返回了无法读取的结果。', 502, 'BAILIAN_INVALID_RESULT'); }
      if (!response.ok || result.code || result.error) {
        const code = String(result.code || result.error?.code || '').toLowerCase();
        const status = response.status;
        const message = status === 401 || status === 403 ? '百炼密钥或模型权限不可用，请核对密钥所属地域和开通状态。' : status === 429 ? '百炼语音请求较多或额度不足，请稍后重试并检查账户。' : /balance|arrear|quota/.test(code) ? '百炼语音额度或余额不足，请检查账户。' : /model|notfound/.test(code) ? '当前百炼模型或接口不可用，请核对模型名称和地域。' : '百炼未能完成语音请求，请检查音频、模型、音色与地域配置。';
        throw new AppError(message, status >= 400 && status <= 599 ? status : 502, 'BAILIAN_REQUEST_FAILED');
      }
      return result;
    } catch (error) {
      if (signal?.aborted || controller.signal.aborted) throw new AppError('语音操作已取消。', 409, 'SPEECH_CANCELLED');
      if (combined.aborted) throw new AppError('百炼语音请求超时，请稍后再试。', 504, 'BAILIAN_TIMEOUT');
      if (error instanceof AppError) throw error;
      throw new AppError('暂时无法连接百炼语音服务，请稍后再试。', 502, 'BAILIAN_NETWORK');
    } finally { this.controllers.delete(controller); }
  }
  async normalize(filename, signal) {
    if (signal?.aborted) throw new AppError('语音操作已取消。', 409);
    if (this.children.size >= 3) throw new AppError('还有录音正在处理，请稍候。', 429, 'SPEECH_BUSY');
    const size = (await stat(filename)).size;
    if (!size || size > 12 * 1024 * 1024) throw new AppError('音频文件为空或超过 12 MB。', 413);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dafeiyu-cloud-audio-'));
    try {
      const output = path.join(directory, 'audio.wav');
      const metadata = await new Promise((resolve, reject) => {
        const child = spawn(this.python(), ['-u', path.join(root, 'server/cloud-audio-worker.py')], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, PYTHONIOENCODING: 'utf-8' } });
        this.children.add(child); let result = '', finished = false;
        const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); this.children.delete(child); child.kill(); error ? reject(error) : resolve(value); };
        const abort = () => finish(new AppError('语音操作已取消。', 409));
        const timer = setTimeout(() => finish(new AppError('音频读取超时。', 504)), 15000);
        signal?.addEventListener('abort', abort, { once: true });
        child.on('error', () => finish(new AppError('音频处理组件未就绪，请先运行 npm run setup:speech。', 503)));
        child.stdin.on('error', () => finish(new AppError('音频读取中断。', 422)));
        child.stdout.on('data', chunk => { result += chunk; if (result.length > 4096) finish(new AppError('音频处理结果异常。', 502)); });
        child.on('exit', code => { try { const value = JSON.parse(result); if (code !== 0 || !(value.duration >= .1 && value.duration <= 120)) throw new Error(); finish(null, value); } catch { finish(new AppError('音频无法读取，或时长超过两分钟，请重新录制。', 422, 'INVALID_AUDIO')); } });
        if (signal?.aborted) return abort();
        child.stdin.end(JSON.stringify({ path: filename, output }));
      });
      const data = await readFile(output); if (signal?.aborted) throw new AppError('语音操作已取消。', 409);
      return { data, duration: metadata.duration };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  async transcribe(filename, signal) {
    const options = this.options(); const audio = await this.normalize(filename, signal);
    const result = await this.request('/compatible-mode/v1/chat/completions', { model: options.asrModel, messages: [...(options.hotwords ? [{ role: 'system', content: [{ type: 'text', text: options.hotwords }] }] : []), { role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${audio.data.toString('base64')}` } }] }], stream: false, asr_options: { enable_itn: true, ...(options.language === 'auto' ? {} : { language: options.language }) } }, signal, options);
    const content = result.choices?.[0]?.message?.content;
    const transcript = text(typeof content === 'string' ? content : Array.isArray(content) ? content.map(x => x.text || '').join('') : '', 6000);
    if (!transcript) throw new AppError('这段语音没听清，可以重说一句。', 422, 'SPEECH_EMPTY');
    if (signal?.aborted) throw new AppError('语音识别已取消。', 409);
    return { transcript, duration: audio.duration, engine: 'aliyun-bailian', model: options.asrModel, requestId: text(result.id || result.request_id, 120) };
  }
  async download(value, signal) {
    const controller = new AbortController(); this.controllers.add(controller);
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
    try {
      let url = value;
      for (let redirects = 0; redirects <= 3; redirects++) {
        // Bailian sometimes returns signed OSS links with http. Use the same
        // object over HTTPS; never weaken publicUrl's transport/private-IP checks.
        const candidate = new URL(url);
        if (candidate.protocol === 'http:' && !candidate.port && /^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(candidate.hostname)) { candidate.protocol = 'https:'; url = candidate.href; }
        const checked = await this.validateUrl(url);
        const response = await this.fetcher(checked.href, { signal: combined, redirect: 'manual' });
        if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); url = new URL(response.headers.get('location') || '', checked).href; continue; }
        if (!response.ok) { await response.body?.cancel(); throw new Error(); }
        return await boundedBody(response, 8 * 1024 * 1024);
      }
      throw new Error();
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(combined.aborted ? '语音下载已取消或超时。' : '合成音频下载失败。', 502, 'BAILIAN_AUDIO_DOWNLOAD'); }
    finally { this.controllers.delete(controller); }
  }
  async synthesize(value, preferences, signal) {
    const options = this.options();
    const clone = this.store.get('cloudVoice');
    if (options.voiceId === clone?.voiceId && (clone.status !== 'OK' || clone.model !== options.ttsModel || clone.account !== this.account(options))) throw new AppError('复刻音色尚未就绪，或与当前模型、账号地域不匹配。', 409, 'VOICE_NOT_READY');
    const cloned = options.voiceId === clone?.voiceId;
    const result = await this.request('/api/v1/services/audio/tts/SpeechSynthesizer', { model: options.ttsModel, input: { text: value, voice: options.voiceId, format: 'wav', sample_rate: 24000, rate: 1 + preferences.rate / 100, ...(cloned ? {} : { instruction: '请用中文，轻松自然，像朋友聊天，避免播音腔。' }) } }, signal, options);
    if (!result.output?.audio?.url) throw new AppError('百炼没有返回可播放的语音。', 502);
    const data = await this.download(result.output.audio.url, signal);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dafeiyu-cloud-voice-'));
    try { const filename = path.join(directory, 'voice'); await writeFile(filename, data, { mode: 0o600 }); const checked = await this.normalize(filename, signal); return { data, duration: checked.duration, engine: 'aliyun-bailian', model: options.ttsModel }; }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
  async test(mediaId) {
    const media = mediaId ? this.store.one('media', mediaId) : null;
    if (mediaId && media?.kind !== 'audio') throw new AppError('请选择一段录音。');
    const filename = media ? path.join(this.store.directory, 'media', path.basename(media.filename)) : this.reference();
    if (!existsSync(filename)) throw new AppError('请先选择一段测试录音。', 404);
    try { const result = await this.transcribe(filename); const connection = { ok: true, at: new Date().toISOString(), model: result.model, account: this.account() }; this.store.set('cloudSpeechTest', connection); return { ...result, ok: true }; }
    catch (error) { this.store.set('cloudSpeechTest', { ok: false, at: new Date().toISOString(), account: this.account() }); throw error; }
  }
  createClone(input = {}) {
    if (this.enrollment) throw new AppError('音色正在创建，请稍候。', 409);
    const previous = this.store.get('cloudVoice');
    if (previous && previous.account === this.account() && previous.model === this.options().ttsModel && !input.replace) return this.queryClone();
    const task = this.enroll(input); this.enrollment = task;
    return task.finally(() => { this.enrollment = null; });
  }
  async enroll(input) {
    const options = this.options(); const directory = await mkdtemp(path.join(os.tmpdir(), 'dafeiyu-clone-'));
    try {
      let filename = this.reference();
      if (input.audio) { if (typeof input.audio !== 'string' || input.audio.length > 6 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(input.audio)) throw new AppError('参考音频格式不正确或过大。'); filename = path.join(directory, 'reference'); await writeFile(filename, Buffer.from(input.audio, 'base64'), { mode: 0o600 }); }
      else if (input.useReference !== true) throw new AppError('请选择用于创建音色的参考录音。');
      const audio = await this.normalize(filename);
      if (audio.duration < 10 || audio.duration > 30) throw new AppError('请提供 10 至 30 秒的清晰单人参考录音。');
      const result = await this.request(cloneEndpoint, { model: 'voice-enrollment', input: { action: 'create_voice', target_model: options.ttsModel, prefix: 'dafeiyu', audio: `data:audio/wav;base64,${audio.data.toString('base64')}`, language_hints: ['zh'], max_prompt_audio_length: Math.min(20, audio.duration) } }, undefined, options);
      const voiceId = text(result.output?.voice_id, 200); if (!voiceId) throw new AppError('百炼没有返回音色 ID。', 502);
      this.store.set('cloudVoice', { voiceId, model: options.ttsModel, status: 'DEPLOYING', account: this.account(options), createdAt: new Date().toISOString() });
      return await this.queryClone();
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  async queryClone(voiceId) {
    let clone = this.store.get('cloudVoice');
    if (voiceId !== undefined) {
      if (typeof voiceId !== 'string' || !/^[a-zA-Z0-9_.-]{1,200}$/.test(voiceId)) throw new AppError('音色 ID 格式不正确。');
      if (voiceId !== clone?.voiceId || clone.account !== this.account()) clone = { voiceId, account: this.account(), createdAt: new Date().toISOString() };
    }
    if (!clone) throw new AppError('还没有创建云端音色。', 404);
    if (clone.account !== this.account()) throw new AppError('请切回创建音色时的账号、业务空间与地域。', 409);
    const result = await this.request(cloneEndpoint, { model: 'voice-enrollment', input: { action: 'query_voice', voice_id: clone.voiceId } });
    const model = text(result.output?.target_model, 120) || clone.model;
    if (!model) throw new AppError('未能确认这个音色绑定的模型。', 502);
    const status = ['OK', 'DEPLOYING', 'UNDEPLOYED'].includes(result.output?.status) ? result.output.status : 'UNKNOWN';
    this.store.set('cloudVoice', { ...clone, model, status }); return this.status().clone;
  }
  close() { for (const controller of this.controllers) controller.abort(); for (const child of this.children) child.kill(); }
}
