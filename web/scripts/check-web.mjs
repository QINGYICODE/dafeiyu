// Read-only by default. Real model tests require explicit QING_LIVE_MODEL_TEST=1
// and should target an isolated service through QING_E2E_API_ORIGIN.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.QING_E2E_OUTPUT || '../artifacts/web';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.QING_BROWSER_EXECUTABLE ? { executablePath: process.env.QING_BROWSER_EXECUTABLE } : {}), args: ['--no-sandbox'] });
const report = { checkedAt: new Date().toISOString(), pages: [], browserErrors: [], checks: [], realModelJobs: [] };
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
 page.on('pageerror', e => report.browserErrors.push(e.message));
 const apiOrigin = process.env.QING_E2E_API_ORIGIN;
 if (apiOrigin) await page.route('**/api/**', async route => { const u = new URL(route.request().url()); const response = await route.fetch({ url: apiOrigin + u.pathname + u.search }); await route.fulfill({ response }); });
 await page.goto(process.env.QING_E2E_ORIGIN || 'http://127.0.0.1:5173/');
 await page.getByRole('heading', { name: /欢迎回到小岛/ }).waitFor({ timeout: 30000 });
 const names = { home: '我的小岛', chat: '和大肥鱼聊天', life: '大肥鱼的生活', memories: '记得的小事', stickers: '表情收藏夹', settings: '连接与偏好' };
 const nav = async name => { if ((page.viewportSize()?.width || 0) <= 720) await page.getByRole('button', { name: '打开导航', exact: true }).click(); await page.locator('aside.sidebar').getByRole('button', { name: names[name], exact: true }).click(); await page.waitForTimeout(150); };
 for (const width of [320, 390, 768, 1440]) {
  await page.setViewportSize({ width, height: width < 721 ? 844 : 1000 });
  for (const key of Object.keys(names)) { await nav(key); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert(!overflow, `${key}/${width} overflow`); report.pages.push({ page: key, width, overflow }); }
 }
 report.checks.push('24 page/viewport combinations and mobile/desktop navigation passed.');
 await page.setViewportSize({ width: 1440, height: 1000 }); await nav('settings');
 assert.equal(await page.locator('input[type=password]').inputValue(), '');
 report.checks.push('Configured model key is not returned to the form.');
 await nav('memories'); assert.equal(await page.getByRole('button', { name: /新增记忆|记住这件事|编辑性格/ }).count(), 0);
 await page.getByRole('searchbox', { name: '搜索记忆' }).fill('unlikely-test-query'); assert(await page.getByText('这件小事，还没找到', { exact: true }).isVisible());
 await nav('stickers'); await page.screenshot({ path: `${output}/stickers-live.png` });
 await nav('life'); await page.getByRole('tab', { name: '性格成长', exact: true }).click(); assert(await page.getByText('正在长大的大肥鱼', { exact: true }).isVisible()); await page.screenshot({ path: `${output}/personality-live.png` });
 if (process.env.QING_LIVE_MODEL_TEST === '1' && apiOrigin) {
  await nav('chat');
  const send = async text => {
   await page.getByRole('textbox', { name: '想对大肥鱼说什么', exact: true }).fill(text); await page.getByRole('button', { name: '发送消息', exact: true }).click();
   await page.waitForFunction(() => Boolean(document.querySelector('.typing-bubble')), {}, { timeout: 15000 });
   await page.waitForFunction(() => !document.querySelector('.typing-bubble'), {}, { timeout: 100000 });
   const state = await page.request.get(`${apiOrigin}/api/state`).then(r => r.json()); const job = state.jobs.find(j => j.kind === 'chat');
   report.realModelJobs.push({ status: job.status, error: job.error }); assert.equal(job.status, 'completed', job.error); return state;
  };
  let state = await send('我重新告诉你：我喜欢喝乌龙茶，而且不加糖。以后叫我小青就好。');
  assert.equal(state.personality.preferredName, '小青'); assert(state.memories.some(m => m.content.includes('乌龙茶')));
  state = await send('你记得我喜欢喝什么吗？');
  const reply = state.messages.filter(m => m.role === 'assistant' && m.status === 'complete').at(-1).content;
  assert(reply.includes('乌龙茶'), 'A completed real reply must recall tea');
  report.checks.push('Real model extracted the name, autonomously stored and recalled tea preference.');
  state = await send('刚才电脑突然自己重启把我吓了一跳，太震惊了，你会用什么小表情回应我？');
  const answer = state.messages.filter(m => m.role === 'assistant' && m.status === 'complete').at(-1); report.stickerSent = Boolean(answer.stickerId);
  await page.screenshot({ path: `${output}/chat-live.png` });
  if (answer.stickerId) { assert(await page.locator('.sent-sticker').last().isVisible()); report.checks.push('A real collected sticker was selected and sent.'); }
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${output}/chat-mobile.png` });
 }
 await nav('home'); await page.screenshot({ path: `${output}/home-current.png` });
 assert.deepEqual(report.browserErrors, []); report.checks.push('No uncaught browser errors.');
 console.log(JSON.stringify({ checks: report.checks, stickerSent: report.stickerSent, realModelJobs: report.realModelJobs }));
} catch (error) { report.failure = String(error.message); throw error; }
finally { await writeFile(`${output}/ui-verification.json`, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
