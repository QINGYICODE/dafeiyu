'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Compass, Download, ExternalLink, LoaderCircle, LogOut, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { useApp } from '@/lib/app-context';
import { api, when, type BilibiliAccountState, type BilibiliFeed, type BilibiliLogin } from '@/lib/companion-types';
import { Modal, Toggle } from './interface';
import { PlatformLogo } from './platform-logo';

export function BilibiliAccountPanel() {
  const { data, refresh, notify, go } = useApp();
  const account = data.accounts.bilibili;
  const [open, setOpen] = useState(false), [login, setLogin] = useState<BilibiliLogin | null>(null);
  const [error, setError] = useState(''), [working, setWorking] = useState(false), [clock, setClock] = useState(Date.now());
  const [feedOpen, setFeedOpen] = useState(false), [feed, setFeed] = useState<BilibiliFeed | null>(null), [feedError, setFeedError] = useState('');
  const alive = useRef(true), generation = useRef(0), currentLogin = useRef<BilibiliLogin | null>(null);
  const exploring = data.jobs.some(job => job.kind === 'explore' && job.status === 'running');
  const canBrowse = account.connected && account.preferences.useForBrowsing && account.platformEnabled;
  const closeLogin = () => {
    generation.current++; const active = currentLogin.current; currentLogin.current = null;
    setOpen(false); setLogin(null); setError(''); setWorking(false);
    if (active) void api(`/accounts/bilibili/login/${active.id}`, 'DELETE').catch(() => {});
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; const active = currentLogin.current; if (active) void api(`/accounts/bilibili/login/${active.id}`, 'DELETE').catch(() => {}); };
  }, []);
  const beginLogin = async () => {
    const run = ++generation.current; setOpen(true); setWorking(true); setError(''); setLogin(null);
    try {
      const value = await api<BilibiliLogin>('/accounts/bilibili/login', 'POST', {});
      if (!alive.current || run !== generation.current) { void api(`/accounts/bilibili/login/${value.id}`, 'DELETE').catch(() => {}); return; }
      currentLogin.current = value; setLogin(value); setClock(Date.now());
    } catch (failure) { if (alive.current && run === generation.current) setError((failure as Error).message); }
    finally { if (alive.current && run === generation.current) setWorking(false); }
  };
  useEffect(() => {
    if (!open || !login?.id) return;
    const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer);
  }, [open, login?.id]);
  useEffect(() => {
    if (!open || !login?.id) return;
    const id = login.id; let cancelled = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ status: BilibiliLogin['status']; account?: BilibiliAccountState }>(`/accounts/bilibili/login/${id}`);
        if (cancelled) return;
        setError(''); setLogin(previous => previous?.id === id ? { ...previous, status: result.status } : previous);
        if (result.status === 'connected') { await refresh(); if (!cancelled) { notify('B 站账号已连接，大肥鱼可以去逛逛了。'); closeLogin(); } return; }
        if (result.status === 'expired') return;
      } catch (failure) {
        if (cancelled) return;
        const message = (failure as Error).message; setError(message);
        if (/结束|取消|过期/.test(message)) { setLogin(previous => previous ? { ...previous, status: 'expired' } : previous); return; }
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, login?.id, refresh, notify]);
  const command = async (endpoint: string, method = 'POST', body: unknown = {}, success = '') => {
    setWorking(true);
    try { const result = await api(endpoint, method, body); await refresh(); if (success) notify(success); return result; }
    catch (failure) { notify((failure as Error).message); return null; }
    finally { if (alive.current) setWorking(false); }
  };
  const showFeed = async () => {
    setFeedOpen(true); setFeed(null); setFeedError('');
    try { setFeed(await api<BilibiliFeed>('/accounts/bilibili/feed')); await refresh(); }
    catch (failure) { setFeedError((failure as Error).message); await refresh(); }
  };
  const exploreFeed = async () => {
    const result = await command('/explore', 'POST', { platform: 'bilibili', feed: true });
    if (result) { setFeedOpen(false); go('life'); }
  };
  const remaining = login ? Math.max(0, Math.ceil((Date.parse(login.expiresAt) - clock) / 1000)) : 0;
  const expired = login?.status === 'expired' || Boolean(login && remaining === 0);
  return <>
    <section className="card settings-section bili-account-card" aria-label="B 站账号连接">
      <div className="settings-section-heading"><span className="bili-account-mark"><PlatformLogo platform="bilibili"/></span><div><h2>大肥鱼的 B 站账号</h2><p>顺着关注去逛逛，把看到的新鲜事带回来。</p></div><span className={`bili-status ${account.connected ? 'connected' : ''}`}><i/>{account.connected ? '已连接' : account.status === 'needs_login' ? '需要重新登录' : '尚未连接'}</span></div>
      {account.profile && <div className="bili-profile">{account.profile.avatarUrl ? <img src={account.profile.avatarUrl} alt="B 站账号头像" referrerPolicy="no-referrer"/> : <span className="bili-profile-fallback"><PlatformLogo platform="bilibili"/></span>}<div><strong>{account.profile.name}</strong><span>UID {account.profile.uid}{account.checkedAt && <> · 检查于 {when(account.checkedAt, true)}</>}</span></div><a className="icon-button" aria-label="打开 B 站账号主页" href={`https://space.bilibili.com/${account.profile.uid}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/></a></div>}
      {!account.connected && <div className="bili-connect-copy"><QrCode size={26}/><p>{account.message || '用 B 站客户端扫码，在客户端确认后，大肥鱼就可以使用这个账号浏览。'}<span>不用填写密码，账号不会被当作你的聊天称呼。</span></p></div>}
      {account.connected && <div className="bili-preferences"><div className="setting-toggle-row"><div><strong>用这个账号浏览 B 站</strong><p>只在 B 站使用登录状态，其他网站互不影响。</p></div><Toggle label="使用 B 站登录状态浏览" checked={account.preferences.useForBrowsing} disabled={working} onChange={() => command('/accounts/bilibili/preferences', 'PUT', { useForBrowsing: !account.preferences.useForBrowsing })}/></div><div className="setting-toggle-row"><div><strong>自主冲浪时看看关注动态</strong><p>先挑关注里的更新，没有新内容再按兴趣去逛。</p></div><Toggle label="自主浏览 B 站关注动态" checked={account.preferences.useFollowingFeed} disabled={working} onChange={() => command('/accounts/bilibili/preferences', 'PUT', { useFollowingFeed: !account.preferences.useFollowingFeed })}/></div></div>}
      {!account.platformEnabled && <p className="bili-inline-note">B 站浏览目前关闭，可在下方开启并保存；已连接的账号会保留。</p>}
      {account.connected && !data.settings.autonomy.enabled && <p className="bili-inline-note">自动冲浪尚未开启，可以先让大肥鱼逛一次，或在下方设置探索时段。</p>}
      <div className="bili-account-actions">{!account.connected ? <button className="button primary" type="button" disabled={working} onClick={beginLogin}><QrCode size={17}/>{account.status === 'needs_login' ? '重新扫码连接' : '扫码连接 B 站'}</button> : <><button className="button primary" type="button" disabled={!canBrowse || exploring || working} onClick={exploreFeed}>{working ? <LoaderCircle size={16} className="spin"/> : <Compass size={16}/>}去关注动态逛逛</button><button className="button secondary" type="button" disabled={!canBrowse || working} onClick={showFeed}>看看关注动态</button><button className="text-button" type="button" disabled={working} onClick={async () => { const result = await command('/accounts/bilibili/check'); if (result) notify((result as BilibiliAccountState).connected ? 'B 站登录状态有效。' : '登录已失效，请重新扫码。'); }}><RefreshCw size={15}/>检查连接</button></>}{(account.connected || account.status === 'needs_login') && <button className="text-button danger" type="button" disabled={working} onClick={() => command('/accounts/bilibili', 'DELETE', {}, '已断开本机 B 站账号。')}><LogOut size={15}/>断开本机账号</button>}</div>
      <div className="bili-boundary"><ShieldCheck size={15}/><p>已支持账号浏览和关注动态。投稿、评论、点赞和私信尚未接入。</p></div>
    </section>
    {open && <Modal title="连接 B 站账号" onClose={closeLogin}><div className="bili-login-content"><p>使用 B 站 App 扫一扫，并在 App 中确认登录。</p>{working && !login ? <div className="bili-qr-loading"><LoaderCircle className="spin" size={30}/><span>在准备二维码……</span></div> : login ? <><div className={`bili-qr ${expired ? 'expired' : ''}`}><img src={login.qrImage} alt="B 站登录二维码"/>{expired && <div><span>二维码已过期</span><button className="button primary" type="button" onClick={beginLogin}><RefreshCw size={15}/>刷新二维码</button></div>}</div><div className="bili-scan-status" role="status">{expired ? '刷新后再扫一次就好。' : login.status === 'scanned' ? <><Check size={17}/>已经扫到了，请在 B 站 App 确认。</> : <><span className="bili-pulse"/>等待扫码 · 还剩 {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</>}</div>{!expired && <div className="bili-qr-actions"><a className="text-button" href={login.qrImage} download="大肥鱼-B站登录.png"><Download size={15}/>保存二维码</a><button className="text-button" type="button" onClick={beginLogin}><RefreshCw size={15}/>换一张</button></div>}</> : null}{error && <p className="bili-login-error" role="alert">{error}</p>}{!working && !login && <button className="button primary" type="button" onClick={beginLogin}>重新获取二维码</button>}<p className="bili-login-help">同一部手机访问时，可保存二维码，再用 B 站扫一扫从相册识别。关闭窗口会取消这次连接。</p><p className="helper-text"><ShieldCheck size={14}/>登录凭据加密留在本机，不发送给聊天模型。</p></div></Modal>}
    {feedOpen && <Modal title="B 站关注动态" onClose={() => setFeedOpen(false)}><p className="modal-description">这是已连接账号的关注动态，大肥鱼会自己挑想看的内容。</p>{feedError ? <p className="bili-login-error" role="alert">{feedError}</p> : !feed ? <div className="bili-feed-loading"><LoaderCircle className="spin" size={24}/><span>去看看最近有什么更新……</span></div> : feed.items.length ? <div className="bili-feed-list">{feed.items.map(item => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"><span>{item.author || 'B 站动态'}</span><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}<ExternalLink size={15}/></a>)}</div> : <p className="bili-empty-feed">关注动态暂时没有可读内容，过会儿再来看看。</p>}{feed && <button className="button primary full" type="button" disabled={working || exploring} onClick={exploreFeed}><Compass size={16}/>{feed.items.length ? '让大肥鱼挑几条看看' : '让大肥鱼按兴趣逛逛 B 站'}</button>}</Modal>}
  </>;
}
