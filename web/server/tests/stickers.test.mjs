import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../store.mjs';
import { Companion } from '../companion.mjs';
import { stickerIntent, contradictsStickerDelivery } from '../sticker-intent.mjs';

function fixture(t, { brokenAnalysis = false, brokenPlan = false, badCandidate = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qing-stickers-'));
  const store = new Store(directory); store.setKey('fixture-key');
  let reads = 0;
  const reader = {
    close: async () => {}, checkPlatform: () => {},
    discover: async () => { reads++; return { platform: 'fabiaoqing', title: '开心表情', url: 'https://www.fabiaoqing.com/', displayUrl: 'https://www.fabiaoqing.com/', text: '开心', images: [...(badCandidate ? [{ url: 'bad' }] : []), { url: 'good', alt: '开心' }] }; },
    image: async url => { if (url === 'bad') throw new Error('unavailable'); return { data: Buffer.from('fixture'), mime: 'image/png', hash: 'good', perceptualHash: '01', width: 128, height: 128 }; },
  };
  const model = { call: async (messages, { purpose } = {}) => {
    if (purpose === 'chat-plan') { if (brokenPlan) throw new Error('plan unavailable'); return { result: { sticker_query: '开心' } }; }
    if (purpose === 'sticker-classification') return { result: { is_sticker: true, meaning: '开心大笑', tags: ['开心'], avoid: ['悲痛'] } };
    if (purpose === 'sticker-selection') return { result: { sticker_id: JSON.parse(messages.at(-1).content).candidates[0]?.id } };
    if (purpose === 'conversation-state' && brokenAnalysis) throw new Error('analysis unavailable');
    return { result: { reply: '给你这个哈哈。', memories: [] } };
  } };
  const c = new Companion({ voice: { status: () => ({ available: false }), close() {} }, store, model, reader });
  t.after(async () => { await c.close(); rmSync(directory, { recursive: true, force: true }); });
  return { c, reads: () => reads };
}
async function finishChat(c, message) {
  const job = c.startChat({ text: message });
  for (let i = 0; i < 100 && c.store.one('jobs', job.id).status === 'running'; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.store.one('jobs', job.id).status, 'completed');
  return c.state().messages.at(-1);
}

test('failed sticker searches retry after a short backoff and skip unavailable images', async t => {
  const { c, reads } = fixture(t, { badCandidate: true });
  c.store.put('jobs', { id: 'old', kind: 'sticker-search', query: '开心', status: 'failed', createdAt: new Date(Date.now() - 3600000).toISOString() });
  const result = await c.findChatStickers('开心');
  assert.equal(reads(), 1); assert.equal(result.collected, 1); assert.equal(result.failed, 1);
  assert.equal(c.state().stickers.length, 1);
});

test('an explicit request sends a real library attachment even when memory analysis fails', async t => {
  const { c, reads } = fixture(t, { brokenAnalysis: true });
  await c.findChatStickers('开心');
  const reply = await finishChat(c, '给我发个开心的表情包');
  assert(reply.stickerId); assert.equal(reply.stickerId, c.state().stickers[0].id);
  assert(reply.memoryNote); assert.equal(reads(), 1, 'reuse a matching image without another search');
  assert.equal(c.state().stickers[0].sentCount, 1);
});

test('a direct request can collect and send an image even if the planning call fails', async t => {
  const { c } = fixture(t, { brokenPlan: true });
  const reply = await finishChat(c, '给我发个开心的表情包');
  assert(reply.stickerId); assert.equal(c.state().stickers.length, 1);
});

test('declining stickers or disabling sends prevents image replies', async t => {
  const { c } = fixture(t);
  await c.findChatStickers('开心');
  assert.equal((await finishChat(c, '开心，不过别发表情包')).stickerId, null);
  await c.settings({ stickers: { send: false } });
  assert.equal((await finishChat(c, '给我发个开心的表情包')).stickerId, null);
});

test('unknown sticker IDs cannot be attached and recently sent images respect cooldown', async t => {
  const { c } = fixture(t); await c.findChatStickers('开心');
  c.model.call = async () => ({ result: { sticker_id: 'nonexistent' } });
  assert.equal(await c.chooseChatSticker('开心', { explicit: true }, c.eligibleStickers('开心'), new AbortController().signal), null);
  const sticker = c.store.list('stickers')[0];
  c.store.put('stickers', { ...sticker, lastSentSequence: 100 });
  assert.equal(c.eligibleStickers('开心').length, 0);
});

test('empty libraries collect automatically while quiet hours and collection settings are respected', async t => {
  const { c, reads } = fixture(t);
  await c.settings({ autonomy: { enabled: false, quietStart: '00:00', quietEnd: '00:00' } });
  c.tick(); await Promise.all([...c.stickerSearches.values()]);
  assert.equal(reads(), 1); assert.equal(c.state().stickers.length, 1);
  await c.settings({ stickers: { collect: false } });
  c.tick(); await new Promise(resolve => setImmediate(resolve)); assert.equal(reads(), 1);
  await c.settings({ stickers: { collect: true }, autonomy: { quietStart: '00:00', quietEnd: '23:59' } });
  t.mock.method(Date.prototype, 'toTimeString', () => '12:00:00 GMT+0800');
  c.tick();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(reads(), 1);
});

test('a contradictory caption is rewritten before the chosen image and text are committed together', async t => {
  const { c } = fixture(t); await c.findChatStickers('开心');
  const originalCall = c.model.call; let repairs = 0;
  c.model.call = async (messages, options) => {
    if (options.purpose === 'reply') {
      assert.match(messages.at(-2).content, /和你的文字一起立即发送/);
      return { result: { reply: '这个我先留着，等你想看了再说。' } };
    }
    if (options.purpose === 'sticker-reply-repair') { repairs++; return { result: { reply: '喏，给你看看。' } }; }
    return originalCall(messages, options);
  };
  const reply = await finishChat(c, '发个撒娇的表情包看看');
  assert(reply.stickerId); assert.equal(reply.content, '喏，给你看看。'); assert.equal(repairs, 1);
  assert.equal(c.state().stickers[0].sentCount, 1);
});

test('repair failures retain other parts of a reply without publishing a false delivery claim', async t => {
  const { c } = fixture(t); await c.findChatStickers('开心');
  const originalCall = c.model.call;
  c.model.call = async (messages, options) => {
    if (options.purpose === 'reply') return { result: { reply: '报告那边明天再处理吧。这个我先留着，等你想看了再说。' } };
    if (options.purpose === 'sticker-reply-repair') throw new Error('unavailable');
    return originalCall(messages, options);
  };
  const reply = await finishChat(c, '发个开心表情包');
  assert(reply.stickerId); assert.equal(reply.content, '报告那边明天再处理吧。');
});

test('normal captions avoid repairs, and subsequent chat history includes actual attached images', async t => {
  const { c } = fixture(t); await c.findChatStickers('开心');
  await finishChat(c, '发个开心表情包');
  const originalCall = c.model.call; let sawHistory = false;
  c.model.call = async (messages, options) => {
    assert.notEqual(options.purpose, 'sticker-reply-repair');
    if (options.purpose === 'reply') sawHistory = messages.some(m => m.role === 'assistant' && m.content.includes('当时已附真实表情图片，含义：开心大笑'));
    return originalCall(messages, options);
  };
  await finishChat(c, '刚才那张好好笑'); assert(sawHistory);
});

test('sajiao requests retain their intended emotion even if chat planning is unavailable', () => {
  assert.equal(stickerIntent('发个撒娇的表情包看看').query, '撒娇');
  assert(contradictsStickerDelivery('这个我先留着，等你想看了再说。'));
  assert(!contradictsStickerDelivery('这张像在说“抱抱”，笑死。'));
  assert(!contradictsStickerDelivery('报告我先留着，明天处理。'));
});

test('follow-up replies cannot deny an image that was actually sent in this conversation', async t => {
  const { c } = fixture(t); await c.findChatStickers('开心');
  await finishChat(c, '发个开心表情包');
  const originalCall = c.model.call;
  c.model.call = async (messages, options) => {
    if (options.purpose === 'reply') {
      assert.match(messages.at(-2).content, /没有新增表情附件/);
      assert.match(messages.at(-2).content, /历史发送事实/);
      return { result: { reply: '我这边没真发出去，所以没法说那张是啥。你看到的是空消息吗？' } };
    }
    if (options.purpose === 'sticker-reply-repair') return { result: { reply: '刚才那张是开心大笑的表情。' } };
    return originalCall(messages, options);
  };
  const reply = await finishChat(c, '刚才那张是什么表情？');
  assert.equal(reply.stickerId, null); assert.equal(reply.content, '刚才那张是开心大笑的表情。');
});

test('cancelling a caption repair prevents late text or an image attachment from being saved', async t => {
  const { c } = fixture(t); await c.findChatStickers('开心');
  const originalCall = c.model.call; let repairStarted, release;
  const started = new Promise(resolve => { repairStarted = resolve; });
  c.model.call = async (messages, options) => {
    if (options.purpose === 'reply') return { result: { reply: '这个我先留着，等你想看了再说。' } };
    if (options.purpose === 'sticker-reply-repair') { repairStarted(); return new Promise(resolve => { release = resolve; }); }
    return originalCall(messages, options);
  };
  const job = c.startChat({ text: '发个开心表情包' }); await started;
  c.cancel(job.id); release({ result: { reply: '给你这张。' } });
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
  const reply = c.store.one('messages', job.messageId);
  assert.equal(reply.status, 'stopped'); assert.equal(reply.content, ''); assert(!reply.stickerId);
  assert.equal(c.state().stickers[0].sentCount, 0);
});
