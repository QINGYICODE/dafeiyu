import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { AppError, publicUrl, platformFor, text } from './network.mjs';
import { now } from './store.mjs';

const PASSPORT = 'https://passport.bilibili.com';
const API = 'https://api.bilibili.com';
const COOKIE_KEY = 'bilibiliSession';
const META_KEY = 'bilibiliAccount';
const preferences = { useForBrowsing: true, useFollowingFeed: true };
const belongsToBilibili = domain => typeof domain === 'string' && (domain === 'bilibili.com' || domain === '.bilibili.com' || domain.endsWith('.bilibili.com'));
const cleanCookies = values => (Array.isArray(values) ? values : []).filter(cookie => belongsToBilibili(cookie.domain) && typeof cookie.name === 'string' && cookie.name.length < 100 && typeof cookie.value === 'string' && cookie.value.length < 16000 && typeof cookie.path === 'string' && ['Strict', 'Lax', 'None'].includes(cookie.sameSite)).slice(0, 80);
const hasSession = cookies => cookies.some(cookie => cookie.name === 'SESSDATA' && cookie.value);

export function profileFromNav(body) {
  if (body?.code === -101 || body?.data?.isLogin === false) return null;
  const value = body?.data;
  if (body?.code !== 0 || value?.isLogin !== true || !/^\d+$/.test(String(value.mid)) || !text(value.uname, 100)) throw new AppError('暂时无法核实 B 站登录状态，请稍后再试。', 502, 'BILIBILI_CHECK_FAILED');
  let avatarUrl = '';
  try { const image = new URL(value.face); if (image.protocol === 'https:' && /^(?:[a-z\d-]+\.)*hdslb\.com$/i.test(image.hostname)) avatarUrl = image.href; } catch {}
  return { uid: String(value.mid), name: text(value.uname, 100), avatarUrl };
}

export function followingCards(body) {
  const items = Array.isArray(body?.data?.items) ? body.data.items : [];
  return items.flatMap(item => {
    const dynamic = item.modules?.module_dynamic || {}, major = dynamic.major || {};
    let url = '', title = '';
    if (major.archive?.bvid && /^BV[a-z\d]+$/i.test(major.archive.bvid)) { url = `https://www.bilibili.com/video/${major.archive.bvid}`; title = text(major.archive.title, 180); }
    else if (/^\d+$/.test(String(item.id_str))) { url = `https://www.bilibili.com/opus/${item.id_str}`; title = text(major.opus?.title || dynamic.desc?.text || major.article?.title, 180); }
    if (!url || !title || platformFor(url) !== 'bilibili') return [];
    return [{ id: text(item.id_str, 50), url, title, description: text(dynamic.desc?.text || major.archive?.desc, 600), author: text(item.modules?.module_author?.name, 100) }];
  }).slice(0, 12);
}

export class BilibiliAccount {
  constructor({ store, reader, contextFactory, request, clock = Date.now } = {}) {
    this.store = store; this.reader = reader; this.clock = clock;
    this.contextFactory = contextFactory || (async () => (await reader.getBrowser()).newContext({ locale: 'zh-CN', viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' }));
    this.request = request || this.requestOfficial.bind(this);
    this.logins = new Map(); this.contexts = new Set(); this.generation = 0; this.checking = null; this.closed = false;
  }
  meta() { return this.store.get(META_KEY) || { status: 'disconnected', profile: null, revision: 0, preferences, checkedAt: null }; }
  summary() {
    const meta = this.meta(), present = Boolean(this.store.get(COOKIE_KEY));
    return { status: present ? meta.status : 'disconnected', connected: present && meta.status === 'connected', profile: meta.profile || null, checkedAt: meta.checkedAt, message: meta.message || '', preferences: { ...preferences, ...meta.preferences }, platformEnabled: Boolean(this.store.get('settings')?.platforms.bilibili.enabled), capabilities: { browsing: true, followingFeed: true, publishing: false, comments: false, privateMessages: false } };
  }
  session() {
    if (!this.store.get(COOKIE_KEY)) return null;
    try { const parsed = JSON.parse(this.store.decrypt(this.store.get(COOKIE_KEY))); const cookies = cleanCookies(parsed.cookies); return hasSession(cookies) ? { cookies, origins: [] } : null; }
    catch { return null; }
  }
  async requestOfficial(context, url) {
    const target = await publicUrl(url);
    if (![PASSPORT, API].includes(target.origin)) throw new AppError('账号请求超出 B 站范围。');
    const response = await context.request.get(target.href, { headers: { Referer: 'https://www.bilibili.com/' }, timeout: 12000, maxRedirects: 0 });
    if ([403, 412, 429].includes(response.status())) throw new AppError('B 站暂时要求验证或限制了访问，请稍后重新连接。', 409, 'BILIBILI_VERIFICATION');
    if (!response.ok()) throw new AppError('B 站账号服务暂时没有响应。', 502, 'BILIBILI_NETWORK');
    const bytes = await response.body(); if (bytes.length > 2 * 1024 * 1024) throw new AppError('B 站账号响应超过大小限制。', 502);
    try { return JSON.parse(bytes.toString('utf8')); } catch { throw new AppError('B 站账号响应暂时无法读取。', 502); }
  }
  async startLogin() {
    if (this.closed) throw new AppError('账号服务正在重启。', 503);
    if (this.summary().connected) throw new AppError('已连接一个 B 站账号，切换前请先断开。', 409);
    const generation = ++this.generation;
    for (const loginId of this.logins.keys()) await this.cancelLogin(loginId);
    const context = await this.contextFactory();
    try {
      const result = await this.request(context, `${PASSPORT}/x/passport-login/web/qrcode/generate`);
      if (generation !== this.generation || this.closed) throw new AppError('这次登录已取消，请重新扫码。', 409);
      let url; try { url = new URL(result.data?.url); } catch { throw new AppError('未取得 B 站登录二维码。', 502); }
      if (result.code !== 0 || ![PASSPORT, 'https://account.bilibili.com'].includes(url.origin) || !text(result.data?.qrcode_key, 300)) throw new AppError('未取得 B 站登录二维码。', 502);
      const loginId = randomUUID(), expiresAt = this.clock() + 180000;
      const login = { id: loginId, key: result.data.qrcode_key, context, expiresAt, status: 'waiting', lastPoll: 0, polling: null, generation };
      this.logins.set(loginId, login);
      login.timer = setTimeout(() => { this.expire(loginId).catch(() => {}); }, 180000); login.timer.unref?.();
      const qrImage = await QRCode.toDataURL(url.href, { width: 280, margin: 2, color: { dark: '#293b47', light: '#ffffff' }, errorCorrectionLevel: 'M' });
      if (generation !== this.generation || this.logins.get(loginId) !== login) throw new AppError('这次登录已取消。', 409);
      return { id: loginId, status: 'waiting', expiresAt: new Date(expiresAt).toISOString(), qrImage };
    } catch (error) { await context.close().catch(() => {}); throw error instanceof AppError ? error : new AppError('二维码暂时没有准备好，请重试。', 502); }
  }
  async expire(loginId) {
    const login = this.logins.get(loginId); if (!login) return;
    if (login.status === 'expired') return;
    login.status = 'expired'; clearTimeout(login.timer); await login.context.close().catch(() => {});
    // Keep a bounded tombstone so the UI can distinguish expiration from a network error.
    login.deleteTimer = setTimeout(() => this.logins.delete(loginId), 60000); login.deleteTimer.unref?.();
  }
  async cancelLogin(loginId) {
    const login = this.logins.get(loginId); if (!login) return { ok: true };
    this.logins.delete(loginId); clearTimeout(login.timer); clearTimeout(login.deleteTimer);
    await login.context.close().catch(() => {}); return { ok: true };
  }
  async pollLogin(loginId) {
    const login = this.logins.get(loginId);
    if (!login) throw new AppError('这次登录已结束，请刷新二维码。', 410, 'BILIBILI_LOGIN_GONE');
    if (login.status === 'connected') return { status: 'connected', account: this.summary() };
    if (this.clock() >= login.expiresAt || login.status === 'expired') { await this.expire(loginId); return { status: 'expired' }; }
    if (login.polling) return login.polling;
    if (this.clock() - login.lastPoll < 2300) return { status: login.status };
    login.lastPoll = this.clock();
    login.polling = this.pollNow(login).finally(() => { login.polling = null; }); return login.polling;
  }
  async pollNow(login) {
    try {
      const result = await this.request(login.context, `${PASSPORT}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(login.key)}`);
      if (this.closed || this.logins.get(login.id) !== login || login.generation !== this.generation) throw new AppError('这次登录已取消。', 410);
      if (result.code !== 0 || !result.data || typeof result.data.code !== 'number') throw new AppError('B 站暂时未返回登录状态，请稍后再试。', 502);
      const code = result.data.code;
      if (code === 86038) { await this.expire(login.id); return { status: 'expired' }; }
      if (code === 86101) { login.status = 'waiting'; return { status: 'waiting' }; }
      if (code === 86090) { login.status = 'scanned'; return { status: 'scanned' }; }
      if (code !== 0) throw new AppError('B 站要求继续完成登录确认，请刷新后重试。', 409, 'BILIBILI_LOGIN_CONFIRM');
      const profile = profileFromNav(await this.request(login.context, `${API}/x/web-interface/nav`));
      const state = await login.context.storageState(); const cookies = cleanCookies(state.cookies);
      if (!profile || !hasSession(cookies)) throw new AppError('尚未取得有效登录状态，请在 B 站客户端确认后重试。', 409);
      const uid = cookies.find(cookie => cookie.name === 'DedeUserID')?.value;
      if (uid && uid !== profile.uid) throw new AppError('账号校验未通过，请重新扫码。', 409);
      if (this.closed || this.logins.get(login.id) !== login || login.generation !== this.generation) throw new AppError('这次登录已取消。', 410);
      const old = this.meta();
      this.store.transaction(() => {
        this.store.set(COOKIE_KEY, this.store.encrypt(JSON.stringify({ cookies, origins: [] })));
        this.store.set(META_KEY, { ...old, revision: old.revision + 1, profile, status: 'connected', message: '', checkedAt: now(), preferences: { ...preferences, ...old.preferences } });
      });
      login.status = 'connected'; login.key = ''; clearTimeout(login.timer); await login.context.close().catch(() => {});
      login.deleteTimer = setTimeout(() => this.logins.delete(login.id), 60000); login.deleteTimer.unref?.();
      return { status: 'connected', account: this.summary() };
    } catch (error) { throw error instanceof AppError ? error : new AppError('B 站登录状态暂时无法更新，请重试。', 502); }
  }
  async check() {
    if (this.checking) return this.checking;
    this.checking = this.checkNow().finally(() => { this.checking = null; }); return this.checking;
  }
  async checkNow() {
    const session = this.session(), revision = this.meta().revision;
    if (!session) { this.markExpired(revision); return this.summary(); }
    const context = await this.contextFactory();
    try {
      if (!this.track(context, revision)) return this.summary();
      await context.addCookies(session.cookies);
      const profile = profileFromNav(await this.request(context, `${API}/x/web-interface/nav`));
      if (revision !== this.meta().revision || this.closed) return this.summary();
      if (!profile || profile.uid !== this.meta().profile?.uid) this.markExpired(revision);
      else { this.store.set(META_KEY, { ...this.meta(), profile, status: 'connected', checkedAt: now(), message: '' }); await this.capture(context, revision); }
      return this.summary();
    } catch (error) { throw error instanceof AppError ? error : new AppError('B 站连接暂时无法检查，原来的登录状态已保留。', 502); }
    finally { this.untrack(context); await context.close().catch(() => {}); }
  }
  markExpired(revision) {
    const meta = this.meta(); if (revision !== meta.revision || this.closed) return;
    if (!this.store.get(COOKIE_KEY)) return;
    this.store.set(META_KEY, { ...meta, status: 'needs_login', checkedAt: now(), message: '登录已失效，需要重新扫码。' });
  }
  async browsingSession() {
    let summary = this.summary();
    if (!summary.connected || !summary.preferences.useForBrowsing || !summary.platformEnabled) return null;
    if (!summary.checkedAt || this.clock() - Date.parse(summary.checkedAt) > 10 * 60000) { await this.check(); summary = this.summary(); }
    if (!summary.connected || !summary.preferences.useForBrowsing || !summary.platformEnabled) return null;
    const storageState = this.session(); if (!storageState) { this.markExpired(this.meta().revision); return null; }
    return { storageState, revision: this.meta().revision };
  }
  active(revision) { const state = this.summary(); return !this.closed && revision === this.meta().revision && state.connected && state.preferences.useForBrowsing && state.platformEnabled; }
  track(context, revision) {
    if (this.closed || revision !== this.meta().revision || !this.summary().connected) { context.close().catch(() => {}); return false; }
    this.contexts.add(context); return true;
  }
  untrack(context) { this.contexts.delete(context); }
  async closeBrowsing() { const contexts = [...this.contexts]; this.contexts.clear(); await Promise.allSettled(contexts.map(context => context.close())); }
  async capture(context, revision) {
    if (this.closed || this.meta().revision !== revision || !this.summary().connected || !this.summary().preferences.useForBrowsing || !this.summary().platformEnabled) return;
    const state = await context.storageState(); const cookies = cleanCookies(state.cookies);
    if (this.closed || this.meta().revision !== revision || !hasSession(cookies)) return;
    const uid = cookies.find(cookie => cookie.name === 'DedeUserID')?.value;
    if (uid && uid !== this.meta().profile?.uid) return;
    if (JSON.stringify(this.session()?.cookies) !== JSON.stringify(cookies)) this.store.set(COOKIE_KEY, this.store.encrypt(JSON.stringify({ cookies, origins: [] })));
  }
  async feed(signal) {
    const session = await this.browsingSession(); if (!session) throw new AppError('先连接 B 站账号，并开启使用登录状态浏览。', 409, 'BILIBILI_LOGIN_REQUIRED');
    const context = await this.contextFactory(); const abort = () => { context.close().catch(() => {}); }; signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) throw new AppError('浏览已取消。', 409);
      if (!this.track(context, session.revision)) throw new AppError('账号已断开，已停止读取。', 409);
      await context.addCookies(session.storageState.cookies);
      const body = await this.request(context, `${API}/x/polymer/web-dynamic/v1/feed/all?type=all`);
      if (signal?.aborted || !this.active(session.revision)) throw new AppError('账号已断开，已停止读取。', 409);
      if (body.code === -101) { this.markExpired(session.revision); throw new AppError('B 站登录已失效，请重新扫码。', 409); }
      if (body.code !== 0) throw new AppError('暂时无法读取关注动态，请稍后再试。', 502);
      const items = followingCards(body); await this.capture(context, session.revision);
      return { items, fetchedAt: now(), source: 'following-feed' };
    } catch (error) { throw error instanceof AppError ? error : new AppError('关注动态暂时无法读取，可能需要重新登录或完成验证。', 502); }
    finally { signal?.removeEventListener('abort', abort); this.untrack(context); await context.close().catch(() => {}); }
  }
  setPreferences(input) {
    const meta = this.meta(), next = { ...preferences, ...meta.preferences };
    for (const key of Object.keys(preferences)) if (typeof input[key] === 'boolean') next[key] = input[key];
    this.store.set(META_KEY, { ...meta, preferences: next }); if (!next.useForBrowsing) this.closeBrowsing().catch(() => {}); return this.summary();
  }
  async disconnect() {
    this.generation++;
    const meta = this.meta(); this.store.transaction(() => { this.store.set(COOKIE_KEY, null); this.store.set(META_KEY, { ...meta, revision: meta.revision + 1, status: 'disconnected', profile: null, checkedAt: null, message: '' }); });
    await this.closeBrowsing();
    for (const loginId of this.logins.keys()) await this.cancelLogin(loginId);
    return this.summary();
  }
  async close() { this.closed = true; this.generation++; await this.closeBrowsing(); for (const loginId of this.logins.keys()) await this.cancelLogin(loginId); }
}
