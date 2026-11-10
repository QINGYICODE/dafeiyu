import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../store.mjs';
import { BilibiliAccount, followingCards } from '../bilibili-account.mjs';
import { BrowserReader } from '../browser.mjs';
import { Companion } from '../companion.mjs';
import { createServer } from '../index.mjs';

const sessionSecret = 'unit-bili-session-secret-ONLY';
const cookies = () => [{ name: 'SESSDATA', value: sessionSecret, domain: '.bilibili.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }, { name: 'DedeUserID', value: '123456', domain: '.bilibili.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }];
const nav = { code: 0, data: { isLogin: true, mid: 123456, uname: '大肥鱼的测试账号', face: 'https://i0.hdslb.com/bfs/face/test.jpg' } };
const feedBody = { code: 0, data: { items: [{ id_str: '111111', modules: { module_author: { name: '公开作者' }, module_dynamic: { desc: { text: '今天看到一只海獭' }, major: { archive: { bvid: 'BV1234567890', title: '海獭的小日常' } } } } }, { id_str: '222222', modules: { module_author: { name: '图文作者' }, module_dynamic: { desc: { text: '画了一幅鲸鱼' }, major: { opus: { title: '鲸鱼速写' } } } } }] } };
function fakeContext(initial = []) {
  return { values: structuredClone(initial), closed: false, async storageState() { return { cookies: this.values, origins: [] }; }, async addCookies(values) { this.values = structuredClone(values); }, async close() { this.closed = true; } };
}
function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'qing-bili-test-'));
  const store = new Store(directory); store.setKey('unit-model-key');
  const control = { time: Date.now(), pollCode: 86101, nav, feed: feedBody, holdPoll: null, holdNav: null, calls: [], contexts: [] };
  const contextFactory = async () => { const context = fakeContext(); control.contexts.push(context); return context; };
  const request = async (context, address) => {
    const url = new URL(address); control.calls.push(url.pathname);
    if (url.pathname.endsWith('/generate')) return { code: 0, data: { url: 'https://account.bilibili.com/h5/account-h5/auth/scan-web?unit=only', qrcode_key: 'unit-qrcode-secret' } };
    if (url.pathname.endsWith('/poll')) { if (control.holdPoll) await control.holdPoll; if (control.pollCode === 0) context.values = cookies(); return { code: 0, data: { code: control.pollCode } }; }
    if (url.pathname.endsWith('/nav')) { if (control.holdNav) await control.holdNav; return control.nav; }
    if (url.pathname.endsWith('/feed/all')) return control.feed;
    throw new Error('Unexpected request');
  };
  const reader = { close: async () => {}, checkPlatform: platform => { assert(store.get('settings').platforms[platform]?.enabled); } };
  const account = new BilibiliAccount({ store, reader, contextFactory, request, clock: () => control.time });
  t.after(async () => { await account.close(); try { store.close(); } catch {} rmSync(directory, { recursive: true, force: true }); });
  return { store, account, reader, control, contextFactory, request, advance: () => control.time += 3000 };
}
async function connect(f) { const login = await f.account.startLogin(); f.control.pollCode = 0; const result = await f.account.pollLogin(login.id); assert.equal(result.status, 'connected'); return login; }
async function settled(c, job) { for (let i = 0; i < 100; i++) { if (c.store.one('jobs', job.id)?.status !== 'running') return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Job did not finish'); }

test('QR login moves through waiting, scanned and confirmed; credentials remain encrypted', async t => {
  const f = fixture(t); const login = await f.account.startLogin();
  assert(login.qrImage.startsWith('data:image/png;base64,'));
  assert(!JSON.stringify(login).includes('unit-qrcode-secret'));
  assert.equal((await f.account.pollLogin(login.id)).status, 'waiting');
  f.advance(); f.control.pollCode = 86090; assert.equal((await f.account.pollLogin(login.id)).status, 'scanned');
  f.advance(); f.control.pollCode = 0; assert.equal((await f.account.pollLogin(login.id)).status, 'connected');
  assert.equal(f.account.summary().profile.name, '大肥鱼的测试账号');
  assert(!JSON.stringify(f.account.summary()).includes(sessionSecret));
  for (const file of ['qing.sqlite', 'qing.sqlite-wal']) if (existsSync(path.join(f.store.directory, file))) assert(!readFileSync(path.join(f.store.directory, file)).includes(Buffer.from(sessionSecret)));
});
test('a saved session survives restart without restoring a QR challenge', async t => {
  const f = fixture(t); await connect(f); await f.account.close(); f.store.close();
  const store = new Store(f.store.directory), account = new BilibiliAccount({ store, reader: f.reader, contextFactory: f.contextFactory, request: f.request });
  try { assert.equal(account.summary().connected, true); assert.equal(account.session().cookies[0].value, sessionSecret); assert.equal(account.logins.size, 0); }
  finally { await account.close(); store.close(); }
});
test('expired and cancelled QR challenges cannot connect an account', async t => {
  const f = fixture(t); const expired = await f.account.startLogin(); f.control.time += 181000;
  assert.equal((await f.account.pollLogin(expired.id)).status, 'expired');
  const login = await f.account.startLogin(); let release; f.control.holdPoll = new Promise(resolve => release = resolve); f.control.pollCode = 0;
  const polling = f.account.pollLogin(login.id); await f.account.cancelLogin(login.id); release();
  await assert.rejects(polling, /取消/); assert.equal(f.account.summary().connected, false); assert.equal(f.store.get('bilibiliSession'), null);
});
test('concurrent QR polls share one platform request', async t => {
  const f = fixture(t), login = await f.account.startLogin();
  await Promise.all([f.account.pollLogin(login.id), f.account.pollLogin(login.id), f.account.pollLogin(login.id)]);
  assert.equal(f.control.calls.filter(item => item.endsWith('/poll')).length, 1);
});
test('anonymous nav responses invalidate a session; network errors preserve it', async t => {
  const f = fixture(t); await connect(f);
  f.control.nav = { code: -352 }; await assert.rejects(f.account.check(), /核实/); assert.equal(f.account.summary().connected, true);
  f.control.nav = { code: -101, data: { isLogin: false } }; await f.account.check();
  assert.equal(f.account.summary().status, 'needs_login'); assert.equal(await f.account.browsingSession(), null);
});
test('disconnect closes active contexts and a late check cannot restore the session', async t => {
  const f = fixture(t); await connect(f); let release; f.control.holdNav = new Promise(resolve => release = resolve);
  const checking = f.account.check(); await new Promise(resolve => setImmediate(resolve));
  await f.account.disconnect(); release(); await checking;
  assert.equal(f.account.summary().connected, false); assert.equal(f.store.get('bilibiliSession'), null);
  assert(f.control.contexts.every(context => context.closed));
  await f.account.capture(fakeContext(cookies()), 1); assert.equal(f.store.get('bilibiliSession'), null);
});
test('browser sessions are used for Bilibili only and obey the browsing switch', async t => {
  const f = fixture(t); await connect(f); const reader = new BrowserReader(f.store); reader.account = f.account;
  const options = [];
  reader.getBrowser = async () => ({ newContext: async value => { options.push(value); return fakeContext(value.storageState?.cookies); } });
  const bili = await reader.readingContext('bilibili'); const other = await reader.readingContext('fabiaoqing');
  assert.equal(bili.sessionUsed, true); assert.equal(other.sessionUsed, false);
  assert.equal(options[0].storageState.cookies[0].value, sessionSecret); assert.equal(options[1].storageState, undefined);
  f.account.setPreferences({ useForBrowsing: false }); assert.equal(await f.account.browsingSession(), null);
  await other.context.close();
});
test('following feed exposes bounded cards, not raw platform data or cookies', async t => {
  const f = fixture(t); await connect(f); const feed = await f.account.feed();
  assert.equal(feed.items.length, 2); assert(feed.items[0].url.startsWith('https://www.bilibili.com/video/BV'));
  assert.equal(feed.items[1].url, 'https://www.bilibili.com/opus/222222');
  assert(!JSON.stringify(feed).includes(sessionSecret));
  assert.deepEqual(followingCards({ code: 0, data: { items: [{ id_str: 'bad', modules: { module_dynamic: { major: { archive: { bvid: 'https://evil.example', title: 'bad' } } } } }] } }), []);
});
test('autonomous following reads leave records without treating account identity as the user', async t => {
  const f = fixture(t); await connect(f); const calls = [];
  f.reader.read = async url => ({ platform: 'bilibili', url, displayUrl: url, title: '实际阅读的海獭日常', text: '海獭的可见图文正文', images: [], links: [], isDetail: true, sessionUsed: true, contentBasis: '网页标题、简介与可见文字' });
  const c = new Companion({ store: f.store, bilibili: f.account, reader: f.reader, model: { call: async messages => { calls.push(messages); return { result: { ids: ['111111'], reflection: '海獭抱着自己睡觉，挺有意思。', memories: [] } }; } } });
  const job = c.startExplore({ platform: 'bilibili', feed: true }); await settled(c, job);
  assert.equal(c.store.one('jobs', job.id).status, 'completed');
  assert(c.state().experiences.some(item => item.purpose === 'following-feed' && item.sessionUsed));
  assert.equal(c.state().personality.preferredName, null);
  assert(!JSON.stringify(c.state()).includes(sessionSecret)); assert(!JSON.stringify(c.exportBackup()).includes(sessionSecret)); assert(!JSON.stringify(calls).includes(sessionSecret));
  await c.close();
});
test('Bilibili account public name can inform chat, but credentials never enter prompts', async t => {
  const f = fixture(t); await connect(f); const calls = [];
  const c = new Companion({ store: f.store, bilibili: f.account, reader: f.reader, model: { call: async (messages, options) => { calls.push(messages); return { result: options.responseMode === 'text' ? { reply: 'B站上也叫大肥鱼。' } : { nickname: { action: 'set', name: '大肥鱼的测试账号', evidence: '大肥鱼的测试账号' } } }; } } });
  const job = c.startChat({ text: '你在B站叫什么？' }); await settled(c, job);
  assert.equal(c.store.one('jobs', job.id).status, 'completed'); assert.equal(c.state().personality.preferredName, null);
  assert(JSON.stringify(calls).includes('大肥鱼的测试账号')); assert(!JSON.stringify(calls).includes(sessionSecret));
  await c.close();
});
test('an empty following feed falls back to public interest browsing with the account session', async t => {
  const f = fixture(t); await connect(f); f.control.feed = { code: 0, data: { items: [] } };
  let searches = 0;
  f.reader.discover = async (platform, topic) => { searches++; assert.equal(platform, 'bilibili'); assert.equal(topic, '海獭'); return { platform, links: [{ url: 'https://www.bilibili.com/video/BV1234567890', title: '海獭' }], images: [], isDetail: false }; };
  f.reader.read = async url => ({ platform: 'bilibili', url, displayUrl: url, title: '海獭的实际公开内容', text: '实际取得的可见文字', images: [], links: [], sessionUsed: true, contentBasis: '网页标题、简介与可见文字' });
  const c = new Companion({ store: f.store, bilibili: f.account, reader: f.reader, model: { call: async () => ({ result: { platform: 'bilibili', topic: '海獭', reflection: '在关注之外看到了一点新鲜事。', memories: [] } }) } });
  const job = c.startExplore({ platform: 'bilibili', feed: true }); await settled(c, job);
  assert.equal(c.store.one('jobs', job.id).status, 'completed'); assert.equal(searches, 1);
  assert(c.state().experiences.some(item => item.kind === 'reading' && item.sessionUsed));
  assert.equal(f.control.calls.filter(item => item.endsWith('/feed/all')).length, 1);
  await c.close();
});
test('account HTTP routes never return cookie material and cancellation is available', async t => {
  const f = fixture(t); const c = new Companion({ store: f.store, bilibili: f.account, reader: f.reader });
  const server = createServer(c, 0); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/accounts/bilibili/login', { method: 'POST' }); assert.equal(response.status, 201);
  const login = await response.json(); assert(!JSON.stringify(login).includes('unit-qrcode-secret'));
  const state = await fetch(base + '/api/state').then(response => response.json()); assert(!JSON.stringify(state).includes('qrcode_key'));
  assert.equal((await fetch(base + `/api/accounts/bilibili/login/${login.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(base + '/api/accounts/bilibili/feed')).status, 409);
});
