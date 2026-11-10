// Read-only UI verification: chat POST is intercepted and never reaches the model.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = process.env.QING_E2E_OUTPUT || '../artifacts/web/mobile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QING_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
const report = { checkedAt: new Date().toISOString(), checks: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  // Public HTTP origins do not expose randomUUID; reproduce that without changing production data.
  await context.addInitScript(() => { Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }); });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  let requestId;
  await page.route('**/api/chat', async route => {
    assert.equal(route.request().method(), 'POST');
    requestId = route.request().postDataJSON().requestId;
    await route.fulfill({ json: { jobId: 'intercepted-mobile-check' } });
  });
  // Only the UI copy is altered; no settings are saved.
  await page.route('**/api/state', async route => {
    const response = await route.fetch();
    const state = await response.json();
    state.settings.model.keyConfigured = true;
    state.jobs = [];
    await route.fulfill({ response, json: state });
  });
  await page.goto(process.env.QING_E2E_ORIGIN || 'http://127.0.0.1:5173/');
  await page.locator('.page-home').waitFor();
  const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
  assert(viewport.includes('viewport-fit=cover'));
  assert(!viewport.includes('user-scalable=no'));
  assert.equal(await page.locator('.sidebar .brand').isVisible(), false);
  const menu = page.getByRole('button', { name: '打开导航', exact: true });
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  assert(await page.locator('.workspace').evaluate(el => el.inert));
  await page.keyboard.press('Shift+Tab');
  assert(await page.locator('.sidebar').evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press('Tab');
  assert(await page.getByRole('button', { name: '收起导航' }).evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  assert(await menu.evaluate(el => el === document.activeElement));
  assert(!await page.locator('.workspace').evaluate(el => el.inert));
  report.checks.push('Drawer hides offscreen controls, traps focus, closes with Escape, and restores focus.');

  await page.screenshot({ path: `${output}/home-390.png`, fullPage: true });
  await page.getByRole('navigation', { name: '手机导航' }).getByRole('button', { name: '聊天', exact: true }).click();
  const draft = page.getByRole('textbox', { name: '想对大肥鱼说什么', exact: true });
  assert.equal(await draft.evaluate(el => getComputedStyle(el).fontSize), '16px');
  await draft.fill('手机输入检查');
  await draft.press('Enter');
  assert((await draft.inputValue()).endsWith('\n'));
  assert.equal(requestId, undefined, 'Mobile return key must not submit unexpectedly');
  const send = page.getByRole('button', { name: '发送消息', exact: true });
  const hit = await send.boundingBox();
  assert(hit.width >= 44 && hit.height >= 44);
  await send.click();
  await page.waitForFunction(() => document.querySelector('#message-draft')?.value === '');
  assert.equal(typeof requestId, 'string');
  assert(requestId.length > 10);
  report.checks.push('16px input, 44px send target, mobile Enter inserts a newline, and HTTP-compatible request ID sends through an intercepted POST.');
  await page.screenshot({ path: `${output}/chat-390.png` });

  // Emulate the visual viewport shrinking under a software keyboard.
  await draft.focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 480 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => document.documentElement.dataset.keyboard === 'open');
  assert(!await page.getByRole('navigation', { name: '手机导航' }).isVisible());
  const composer = await page.locator('.composer-area').boundingBox();
  assert(composer.y + composer.height <= 481, 'Composer must stay above the keyboard');
  assert(composer.y >= 100);
  await page.screenshot({ path: `${output}/keyboard-viewport.png` });
  await page.evaluate(() => {
    delete window.visualViewport.height;
    document.activeElement.blur();
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => document.documentElement.dataset.keyboard === 'closed');
  assert(await page.getByRole('navigation', { name: '手机导航' }).isVisible());
  report.checks.push('Simulated keyboard resize keeps the composer visible and restores bottom navigation on dismissal.');

  await page.getByRole('button', { name: '选择表情', exact: true }).click();
  assert(await page.getByRole('region', { name: '表情输入' }).isVisible());
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: '切换文字输入', exact: true }).click();
  await page.getByRole('navigation', { name: '手机导航' }).getByRole('button', { name: '设置', exact: true }).click();
  const fonts = await page.locator('.field input:visible, .field select:visible').evaluateAll(elements => elements.map(el => Number.parseFloat(getComputedStyle(el).fontSize)));
  assert(fonts.length > 5 && fonts.every(size => size >= 16));
  await page.screenshot({ path: `${output}/settings-390.png`, fullPage: true });
  report.checks.push('Emoji input stays inline; settings inputs use at least 16px text to avoid iOS focus zoom.');

  for (const size of [{ width: 320, height: 740 }, { width: 430, height: 932 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(size);
    await page.getByRole('navigation', { name: '手机导航' }).getByRole('button', { name: '聊天', exact: true }).click();
    await page.waitForTimeout(100);
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `Overflow at ${size.width}`);
    const box = await page.locator('.composer-area').boundingBox();
    assert(box.y >= 0 && box.y + box.height <= size.height);
  }
  report.checks.push('320px, 430px and landscape chat layouts keep the composer on screen without horizontal overflow.');
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report));
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  await writeFile(`${output}/mobile-verification.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
