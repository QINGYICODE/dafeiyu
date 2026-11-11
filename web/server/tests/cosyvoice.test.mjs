import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cosyvoiceAudio } from '../cosyvoice.mjs';
import { cloudSpeechDefaults, cloudSpeechSettings } from '../cloud-speech.mjs';

function fixture() {
  const socket = new EventEmitter(); socket.sent = []; socket.closed = false;
  socket.send = value => socket.sent.push(JSON.parse(value));
  socket.terminate = () => { socket.closed = true; };
  const controller = new AbortController(); let connection;
  const result = cosyvoiceAudio({ url: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference', key: 'private-test-key', model: 'cosyvoice-v3-flash', voice: 'longhuhu_v3', rate: .92, value: '你好呀。', signal: controller.signal, connect: (url, options) => { connection = { url, options }; return socket; } });
  socket.emit('open');
  const event = (name, extra = {}) => socket.emit('message', Buffer.from(JSON.stringify({ header: { task_id: socket.sent[0].header.task_id, event: name, ...extra } })), false);
  return { socket, result, controller, connection, event };
}

test('Long Huhu is the system voice default with a matching CosyVoice model', () => {
  assert.equal(cloudSpeechDefaults().voiceId, 'longhuhu_v3');
  assert.equal(cloudSpeechDefaults().ttsModel, 'cosyvoice-v3-flash');
  assert.equal(cloudSpeechSettings({}).voiceId, 'longhuhu_v3');
  assert.throws(() => cloudSpeechSettings({ ttsModel: 'qwen-audio-3.1-tts-flash' }), /搭配/);
});

test('CosyVoice waits for task-started and returns complete audio only after task-finished', async () => {
  const { socket, result, connection, event } = fixture();
  assert.equal(socket.sent.length, 1);
  assert.equal(connection.options.headers.Authorization, 'Bearer private-test-key');
  const run = socket.sent[0];
  assert.equal(run.payload.model, 'cosyvoice-v3-flash');
  assert.equal(run.payload.parameters.voice, 'longhuhu_v3');
  assert.equal(run.payload.parameters.rate, .92);
  assert.equal(run.payload.parameters.format, 'wav');
  assert.deepEqual(run.payload.input, {});
  event('task-started');
  assert.deepEqual(socket.sent.map(x => x.header.action), ['run-task', 'continue-task', 'finish-task']);
  assert(socket.sent.every(x => x.header.task_id === run.header.task_id));
  assert.equal(socket.sent[1].payload.input.text, '你好呀。');
  let complete = false; result.then(() => { complete = true; });
  socket.emit('message', Buffer.alloc(60, 1), true);
  socket.emit('message', Buffer.alloc(60, 2), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(complete, false);
  event('task-finished');
  assert.equal((await result).length, 120);
  assert(socket.closed);
});

test('failed, cancelled and incomplete synthesis never exposes partial audio or provider secrets', async () => {
  const failed = fixture();
  failed.event('task-failed', { error_code: 'InvalidParameter', error_message: 'private-test-key' });
  await assert.rejects(failed.result, error => !error.message.includes('private-test-key'));
  const cancelled = fixture(); cancelled.controller.abort();
  await assert.rejects(cancelled.result, /取消/); assert(cancelled.socket.closed);
  const closed = fixture(); closed.event('task-started'); closed.socket.emit('message', Buffer.alloc(80), true); closed.socket.emit('close');
  await assert.rejects(closed.result, /中断/);
});

test('CosyVoice bounds audio and rejects wrong task IDs and malformed events', async () => {
  const oversized = fixture(); oversized.event('task-started');
  for (let i = 0; i < 3; i++) oversized.socket.emit('message', Buffer.alloc(3 * 1024 * 1024), true);
  await assert.rejects(oversized.result, /大小限制/);
  const mismatched = fixture(); mismatched.event('task-started', { task_id: 'unrelated' });
  await assert.rejects(mismatched.result, /不匹配/);
  const malformed = fixture(); malformed.socket.emit('message', Buffer.from('null'), false);
  await assert.rejects(malformed.result, /不匹配/);
});
