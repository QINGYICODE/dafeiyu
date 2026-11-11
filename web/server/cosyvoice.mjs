import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { AppError } from './network.mjs';

// Collect a complete utterance before returning anything to the chat client.
export function cosyvoiceAudio({ url, key, model, voice, rate, value, signal, connect = (address, options) => new WebSocket(address, options) }) {
  if (signal?.aborted) return Promise.reject(new AppError('语音操作已取消。', 409, 'SPEECH_CANCELLED'));
  return new Promise((resolve, reject) => {
    const taskId = randomUUID();
    let socket, settled = false, started = false, size = 0;
    const chunks = [];
    const fail = (message, code = 'BAILIAN_REQUEST_FAILED', status = 502) => finish(new AppError(message, status, code));
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      socket?.terminate();
      error ? reject(error) : resolve(data);
    };
    const abort = () => fail('语音操作已取消或超时。', 'SPEECH_CANCELLED', 409);
    const send = (action, payload) => socket.send(JSON.stringify({ header: { action, task_id: taskId, streaming: 'duplex' }, payload }));
    try {
      socket = connect(url, { headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 15000, followRedirects: false, maxPayload: 8 * 1024 * 1024 });
      socket.on('error', () => fail('暂时无法连接百炼语音服务，请稍后再试。', 'BAILIAN_NETWORK'));
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        fail(response.statusCode === 401 || response.statusCode === 403 ? '百炼密钥或模型权限不可用，请核对密钥所属地域和开通状态。' : '百炼语音连接未成功，请检查模型与地域配置。');
      });
      socket.on('close', () => { if (!settled) fail('语音合成连接提前中断，请重试。'); });
      socket.on('open', () => {
        if (settled) return;
        send('run-task', { task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer', model, input: {}, parameters: { text_type: 'PlainText', voice, format: 'wav', sample_rate: 24000, rate } });
      });
      socket.on('message', (data, binary) => {
        if (settled) return;
        if (binary) {
          if (!started) return fail('百炼返回了顺序异常的音频。');
          size += data.length;
          if (size > 8 * 1024 * 1024) return fail('合成语音超过大小限制。', 'VOICE_SIZE_LIMIT', 413);
          chunks.push(Buffer.from(data));
          return;
        }
        let event;
        try { event = JSON.parse(data.toString()); } catch { return fail('百炼返回了无法读取的结果。'); }
        if (event?.header?.task_id !== taskId) return fail('百炼返回了不匹配的语音任务。');
        if (event.header.event === 'task-started' && !started) {
          started = true;
          send('continue-task', { input: { text: value } });
          send('finish-task', { input: {} });
        } else if (event.header.event === 'task-failed') {
          // Never expose provider messages, which can echo text or credentials.
          const quota = /balance|arrear|quota/i.test(event.header.error_code || '');
          fail(quota ? '百炼语音额度或余额不足，请检查账户。' : '百炼未能完成语音请求，请检查模型、音色与地域配置。');
        } else if (event.header.event === 'task-finished') {
          if (!started || size < 44) return fail('百炼没有返回完整的语音。');
          finish(null, Buffer.concat(chunks, size));
        }
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    } catch { fail('暂时无法连接百炼语音服务，请稍后再试。', 'BAILIAN_NETWORK'); }
  });
}
