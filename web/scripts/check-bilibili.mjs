// UI states are simulated against an isolated service; no real account is logged in.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
const origin = process.env.QING_E2E_API_ORIGIN;
if (!origin) throw new Error('Set QING_E2E_API_ORIGIN to an isolated service.');
const output = process.env.QING_E2E_OUTPUT || '../artifacts/web/bilibili'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QING_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
const report = { checkedAt: new Date().toISOString(), checks: [], browserErrors: [], modalBounds: [] };
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  let account = { status: 'disconnected', connected: false, profile: null, checkedAt: null, message: '', platformEnabled: true, preferences: { useForBrowsing: true, useFollowingFeed: true }, capabilities: { browsing: true, followingFeed: true, publishing: false, comments: false, privateMessages: false } };
  const qrImage = await QRCode.toDataURL('https://account.bilibili.com/h5/account-h5/auth/scan-web?ui-test=only');
  let phase = 'waiting', polls = 0, nextId = 0, loginId, cancelled = [], explore, emptyFeed = false;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    if (path === '/api/accounts/bilibili/login' && method === 'POST') { loginId = `ui-login-${++nextId}`; polls = 0; await route.fulfill({ status: 201, json: { id: loginId, qrImage, status: 'waiting', expiresAt: new Date(Date.now() + 180000).toISOString() } }); return; }
    if (/^\/api\/accounts\/bilibili\/login\//.test(path)) {
      if (method === 'DELETE') { cancelled.push(path.split('/').at(-1)); await route.fulfill({ json: { ok: true } }); return; }
      polls++;
      if (phase === 'expired') { await route.fulfill({ json: { status: 'expired' } }); return; }
      if (phase === 'connect' && polls >= 2) { account = { ...account, status: 'connected', connected: true, checkedAt: new Date().toISOString(), profile: { uid: '123456', name: '大肥鱼的 B 站测试账号', avatarUrl: '' } }; await route.fulfill({ json: { status: 'connected', account } }); return; }
      await route.fulfill({ json: { status: phase === 'connect' ? 'scanned' : 'waiting' } }); return;
    }
    if (path === '/api/accounts/bilibili/preferences') { account.preferences = { ...account.preferences, ...request.postDataJSON() }; await route.fulfill({ json: account }); return; }
    if (path === '/api/accounts/bilibili/check') { await route.fulfill({ json: account }); return; }
    if (path === '/api/accounts/bilibili' && method === 'DELETE') { account = { ...account, connected: false, status: 'disconnected', profile: null }; await route.fulfill({ json: account }); return; }
    if (path === '/api/accounts/bilibili/feed') { await route.fulfill({ json: { items: emptyFeed ? [] : [{ id: '111111', url: 'https://www.bilibili.com/video/BV1234567890', title: '海獭的小日常', description: '一条用于检查界面的动态', author: '测试作者' }], source: 'following-feed', fetchedAt: new Date().toISOString() } }); return; }
    if (path === '/api/explore' && method === 'POST') { explore = request.postDataJSON(); await route.fulfill({ status: 202, json: { id: 'ui-explore' } }); return; }
    const response = await route.fetch({ url: origin + path + url.search });
    if (path === '/api/state') { const state = await response.json(); state.accounts = { bilibili: account }; await route.fulfill({ response, json: state }); }
    else await route.fulfill({ response });
  });
  await page.goto('http://127.0.0.1:5173/#settings'); await page.getByRole('heading', { name: '大肥鱼的 B 站账号', exact: true }).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width > 720 ? 1000 : 844 });
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await page.getByRole('button', { name: '扫码连接 B 站', exact: true }).click();
    await page.getByRole('img', { name: 'B 站登录二维码' }).waitFor();
    const dialog = page.getByRole('dialog', { name: '连接 B 站账号', exact: true }); const box = await dialog.boundingBox();
    assert(box.x >= 10 && box.x + box.width <= width - 10 && box.y >= 8 && box.y + box.height <= (width > 720 ? 1000 : 844) - 8);
    assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)); report.modalBounds.push({ viewportWidth: width, ...box });
    if (width === 390) await page.screenshot({ path: `${output}/login-mobile.png` });
    const active = loginId; await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.waitForTimeout(100); assert(cancelled.includes(active));
  }
  report.checks.push('Account card and QR modal fit 320/390/768/1440 widths; closing cancels the pending login.');
  await page.setViewportSize({ width: 390, height: 844 });
  phase = 'expired'; await page.getByRole('button', { name: '扫码连接 B 站', exact: true }).click();
  await page.getByRole('button', { name: '刷新二维码', exact: true }).waitFor({ timeout: 10000 });
  const previous = loginId; phase = 'waiting'; await page.getByRole('button', { name: '刷新二维码', exact: true }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('.bili-qr:not(.expired)'))); assert.notEqual(loginId, previous);
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  report.checks.push('Expired QR gives a working refresh action and obtains a new login session.');
  phase = 'connect'; await page.getByRole('button', { name: '扫码连接 B 站', exact: true }).click();
  await page.getByText('已经扫到了，请在 B 站 App 确认。', { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText('大肥鱼的 B 站测试账号', { exact: true }).waitFor({ timeout: 15000 });
  assert(!await page.getByRole('dialog').isVisible());
  await page.locator('.toast').waitFor({ state: 'hidden', timeout: 6500 });
  await page.screenshot({ path: `${output}/connected-mobile.png` });
  const useLogin = page.getByRole('switch', { name: '使用 B 站登录状态浏览', exact: true });
  await useLogin.click(); await page.waitForTimeout(150); assert.equal(await useLogin.getAttribute('aria-checked'), 'false');
  assert(await page.getByRole('button', { name: '去关注动态逛逛', exact: true }).isDisabled());
  await useLogin.click(); await page.waitForTimeout(150);
  await page.getByRole('button', { name: '看看关注动态', exact: true }).click();
  await page.getByRole('link', { name: /海獭的小日常/ }).waitFor(); await page.screenshot({ path: `${output}/following-feed-mobile.png` });
  await page.getByRole('button', { name: '让大肥鱼挑几条看看', exact: true }).click();
  await page.locator('.page-life').waitFor(); assert.deepEqual(explore, { platform: 'bilibili', feed: true });
  report.checks.push('Simulated scan/confirmation updates the account; browsing switch gates actions; following-feed exploration sends the expected request.');
  await page.evaluate(() => location.hash = 'settings'); await page.getByRole('button', { name: '断开本机账号', exact: true }).waitFor();
  emptyFeed = true; await page.getByRole('button', { name: '看看关注动态', exact: true }).click();
  await page.getByText('关注动态暂时没有可读内容，过会儿再来看看。', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '让大肥鱼按兴趣逛逛 B 站', exact: true }).isVisible());
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  report.checks.push('An empty following feed still offers public interest exploration.');
  await page.getByRole('button', { name: '断开本机账号', exact: true }).click();
  await page.getByRole('button', { name: '扫码连接 B 站', exact: true }).waitFor();
  assert.equal(account.connected, false); report.checks.push('Disconnect returns the panel to a disconnected state.');
  assert.deepEqual(report.browserErrors, []); console.log(JSON.stringify(report));
} catch (error) { report.failure = error.message; throw error; }
finally { await writeFile(`${output}/ui-verification.json`, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
