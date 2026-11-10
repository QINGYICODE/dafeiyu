import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Companion } from '../companion.mjs';
import { Store } from '../store.mjs';
import { createServer } from '../index.mjs';
import { platformFor, cleanContentUrl } from '../network.mjs';
import { publicSearchQuery } from '../conversation-style.mjs';

function fixture(t, { call, speech, reader } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qing-media-test-'));
  const store = new Store(directory); store.setKey('unit-fixture-only');
  const service = new Companion({ voice: { status: () => ({ available: false }), close() {} }, store, model: { call: call || (async (_messages, options) => ({ result: options.purpose === 'chat-plan' ? {} : { reply: '收到这张图了。', memories: [] } })) }, speech, reader: reader || { close: async () => {}, checkPlatform: platform => { assert(store.get('settings').platforms[platform]?.enabled); } } });
  t.after(async () => { await service.close(); rmSync(directory, { force: true, recursive: true }); });
  return service;
}
const png = () => sharp({ create: { width: 200, height: 140, channels: 3, background: '#79b9d5' } }).png().toBuffer();
async function done(service, job) {
  for (let i = 0; i < 100; i++) { if (service.store.one('jobs', job.id).status !== 'running') return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('Job did not settle');
}

test('real image bytes persist and image-only messages reach the vision model', async t => {
  const calls = [];
  const c = fixture(t, { call: async (messages, options) => { calls.push({ messages, options }); return { result: options.purpose === 'chat-plan' ? { media_description: '一张蓝色图片' } : options.responseMode === 'text' ? { reply: '这片蓝看着还挺舒服。' } : { memories: [{ action: 'remember', content: '用户最喜欢蓝色', evidence: '用户最喜欢蓝色', confidence: 1, category: 'preference' }] } }; } });
  const item = await c.media.upload(await png(), { kind: 'image', name: 'test.png' });
  const job = c.startChat({ attachmentIds: [item.id] }); await done(c, job);
  assert.equal(c.store.one('jobs', job.id).status, 'completed');
  assert(calls.some(call => call.options.vision && call.messages.at(-1).content.some(part => part.type === 'image_url')));
  assert.equal(c.state().messages[0].attachments[0].available, true);
  assert.equal(c.state().messages[0].attachments[0].width, 200);
  assert.equal(c.state().memories.length, 0, 'Image inference is not user evidence');
  assert(!JSON.stringify(c.state()).includes('base64'));
});
test('invalid image uploads and forged attachment IDs are rejected', async t => {
  const c = fixture(t);
  await assert.rejects(c.media.upload(Buffer.from('<svg><script/></svg>'), { kind: 'image', name: 'fake.jpg' }), /图片/);
  await assert.rejects(c.media.upload(Buffer.alloc(12 * 1024 * 1024 + 1), { kind: 'image' }), /12 MB/);
  assert.throws(() => c.startChat({ attachmentIds: ['../../vault.key'] }), /附件/);
  assert.throws(() => c.startChat({ attachmentIds: [1] }), /附件/);
});
test('voice transcription is visible, feeds the reply, and can provide memory evidence', async t => {
  const utterance = '我喜欢乌龙茶';
  const c = fixture(t, { speech: { status: () => ({ available: true }), close() {}, transcribe: async filename => { assert(filename.endsWith('.wav')); return { transcript: utterance, duration: 3 }; } }, call: async (messages, options) => ({ result: options.purpose === 'chat-plan' ? {} : options.responseMode === 'text' ? { reply: '乌龙茶，记下你的口味了。' } : { memories: [{ action: 'remember', content: '喜欢乌龙茶', evidence: utterance, category: 'preference', confidence: .9 }] } }) });
  const audio = await c.media.upload(Buffer.from('RIFF0000WAVEunit-fixture'), { kind: 'audio' });
  const job = c.startChat({ attachmentIds: [audio.id] }); await done(c, job);
  assert.equal(c.store.one('jobs', job.id).status, 'completed');
  assert.equal(c.state().messages[0].transcript, utterance);
  assert.equal(c.state().messages[0].attachments[0].duration, 3);
  assert.equal(c.state().memories[0].content, '喜欢乌龙茶');
});
test('cancelling a pending transcription cannot commit a late transcript or reply', async t => {
  let complete;
  const c = fixture(t, { speech: { status: () => ({ available: true }), close() {}, transcribe: () => new Promise(resolve => complete = resolve) } });
  const audio = await c.media.upload(Buffer.from('RIFF0000WAVEunit-fixture'), { kind: 'audio' });
  const job = c.startChat({ attachmentIds: [audio.id] });
  c.cancel(job.id); complete({ transcript: '迟到的语音', duration: 2 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.state().messages.at(-1).status, 'stopped');
  assert.equal(c.state().messages[0].transcript, undefined);
});
test('unknown terms trigger an allowed source, leave a reading record, and persist reusable knowledge', async t => {
  let searches = 0;
  const c = fixture(t, { call: async (messages, options) => {
    if (options.purpose === 'chat-plan') return { result: { needs_lookup: true, query: '测试新梗' } };
    if (options.responseMode === 'text') { assert(messages[0].content.includes('来自实际词条的释义') || messages[0].content.includes('这个梗表达先歇一会儿')); return { result: { reply: '刚翻到了，这是在说先歇一会儿。' } }; }
    return { result: { learning: { supported: true, summary: '这个梗表达先歇一会儿。', usage: '轻松调侃时接话' }, memories: [] } };
  } });
  const settings = c.store.get('settings'); settings.platforms.gengwiki.enabled = false; c.store.set('settings', settings);
  c.reader.discover = async (platform, query) => { searches++; assert.equal(platform, 'gengbaike'); assert.equal(query, '测试新梗'); return { platform, title: '测试新梗', text: '来自实际词条的释义', url: 'https://www.geng8.com/word/unit.html', displayUrl: 'https://www.geng8.com/word/unit.html', isDetail: true, images: [], links: [], contentBasis: '网页标题、简介与可见文字' }; };
  const job = c.startChat({ text: '测试新梗是什么意思？' }); await done(c, job);
  assert.equal(c.store.one('jobs', job.id).status, 'completed'); assert.equal(searches, 1);
  assert(c.state().experiences.some(item => item.purpose === 'lookup' && item.lookupStatus === 'found'));
  assert.equal(c.relevantKnowledge('再聊聊测试新梗')[0].summary, '这个梗表达先歇一会儿。');
  assert.equal(c.state().personality.preferredName, null);
  const next = c.startChat({ text: '测试新梗怎么接？' }); await done(c, next); assert.equal(c.store.one('jobs', next.id).status, 'completed'); assert.equal(searches, 1, 'Reuse recent learned meaning');
});
test('failed lookups remain failed search records and cannot become learned knowledge', async t => {
  const c = fixture(t, { call: async (_messages, options) => ({ result: options.purpose === 'chat-plan' ? { needs_lookup: true, query: '不存在的新词' } : options.responseMode === 'text' ? { reply: '这个我还真没弄明白。' } : { learning: { summary: '模型想象的解释' } } }) });
  c.reader.discover = async () => { throw new Error('network fail'); };
  const job = c.startChat({ text: '不存在的新词是啥？' }); await done(c, job);
  assert.equal(c.store.list('knowledge').length, 0);
  assert(c.state().experiences.some(item => item.kind === 'search' && item.lookupStatus === 'not-found'));
  assert.equal(c.state().stats.readings, 0);
});
test('turning automatic lookup off prevents browsing even if the planner asks for it', async t => {
  const c = fixture(t, { call: async (_messages, options) => ({ result: options.purpose === 'chat-plan' ? { needs_lookup: true, query: '陌生词语' } : { reply: '这个还不太清楚。' } }) });
  let searched = false; c.reader.discover = async () => { searched = true; };
  const settings = c.store.get('settings'); settings.discovery.onUnfamiliar = false; c.store.set('settings', settings);
  const job = c.startChat({ text: '陌生词语？' }); await done(c, job); assert.equal(searched, false);
});
test('deleting a conversation removes its unshared attachment files', async t => {
  const c = fixture(t); const attachment = await c.media.upload(await png(), { kind: 'image' });
  const file = path.join(c.media.directory, c.media.get(attachment.id).filename);
  const job = c.startChat({ attachmentIds: [attachment.id] }); await done(c, job);
  c.deleteConversation(c.state().activeConversation);
  assert.equal(existsSync(file), false); assert.equal(c.store.one('media', attachment.id), null);
});
test('unrelated recommended entries never count as understanding the requested meme', async t => {
  const c = fixture(t, { call: async (_messages, options) => ({ result: options.purpose === 'chat-plan' ? { needs_lookup: true, query: '九阳哈基米南北绿豆浆 梗 来历' } : options.responseMode === 'text' ? { reply: '没查到对应解释。' } : { learning: { supported: true, summary: '不相干的内容' } } }) });
  c.reader.discover = async platform => ({ platform, title: '大肥鱼', text: '这是不相干的推荐词条', url: 'https://www.geng8.com/word/dafeiyu.html', displayUrl: 'https://www.geng8.com/word/dafeiyu.html', isDetail: true, images: [], links: [] });
  const job = c.startChat({ text: '九阳哈基米南北绿豆浆是什么梗？' }); await done(c, job);
  assert.equal(c.store.list('knowledge').length, 0); assert.equal(c.state().stats.readings, 0);
  assert(c.state().experiences.every(item => item.purpose !== 'lookup' || item.lookupStatus === 'not-found'));
});
test('an unfamiliar reply can trigger learning after the message is sent', async t => {
  const c = fixture(t, { call: async (_messages, options) => ({ result: options.purpose === 'chat-plan' ? { needs_lookup: false, query: '测试新梗' } : options.purpose === 'background-learning' ? { supported: true, summary: '从词条新学到的用法' } : options.responseMode === 'text' ? { reply: '这个我还没听过。' } : {} }) });
  c.reader.discover = async platform => ({ platform, title: '测试新梗', text: '来自实际词条的释义', url: platform === 'gengwiki' ? 'https://geng.page/#p05-test' : 'https://www.geng8.com/word/test.html', displayUrl: platform === 'gengwiki' ? 'https://geng.page/#p05-test' : 'https://www.geng8.com/word/test.html', isDetail: true, images: [], links: [] });
  const job = c.startChat({ text: '测试新梗？' }); await done(c, job);
  for (let i = 0; i < 100 && c.controllers.size; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(c.state().messages.at(-1).content, '这个我还没听过。');
  assert(c.store.list('jobs').some(item => item.kind === 'explore' && item.trigger === 'conversation' && item.status === 'completed'));
  assert(c.relevantKnowledge('测试新梗')[0]?.summary.includes('新学到'));
});
test('binary upload and audio range responses work through the HTTP service', async t => {
  const c = fixture(t); const server = createServer(c, 0);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const bytes = Buffer.from('RIFF0000WAVEunit-fixture');
  const upload = await fetch(`${origin}/api/media`, { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-media-kind': 'audio' }, body: bytes });
  assert.equal(upload.status, 201); const item = await upload.json();
  const response = await fetch(origin + item.url, { headers: { range: 'bytes=0-3' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), `bytes 0-3/${bytes.length}`);
  assert.equal(await response.text(), 'RIFF');
});
test('new source URLs stay scoped and search queries omit obvious private data', () => {
  assert.equal(platformFor('https://geng8.com.evil.example/'), null);
  assert.equal(platformFor('https://img.soutula.com/'), null, 'Image hosts cannot become browsing platforms');
  assert.equal(platformFor('https://geng.page/#p05-001-hachimi'), 'gengwiki');
  assert(cleanContentUrl('https://geng.page/#p05-001-hachimi').includes('#p05-001-hachimi'));
  assert.equal(publicSearchQuery('密码 123456'), ''); assert.equal(publicSearchQuery('me@example.com'), '');
  assert.equal(publicSearchQuery('九阳哈基米南北绿豆浆'), '九阳哈基米南北绿豆浆');
  assert.equal(publicSearchQuery('九阳哈基米南北绿豆浆 梗 来历'), '九阳哈基米南北绿豆浆');
});
