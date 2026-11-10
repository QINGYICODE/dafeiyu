// Read-only, anonymous browser smoke checks. No login, CAPTCHA solving or API signing.
// Install Playwright separately, then set QING_PLAYWRIGHT_MODULE if necessary.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QING_PLAYWRIGHT_MODULE || 'playwright');
const outputDir = path.resolve(process.env.QING_BROWSING_OUTPUT || 'artifacts/platform-browsing');
const mediaTypes = new Set(['media']);
const suites = [
  { platform: 'bilibili', cases: [
    ['home', 'https://www.bilibili.com/'],
    ['search', 'https://search.bilibili.com/all?keyword=%E7%8C%AB'],
    ['detail-1', 'https://www.bilibili.com/video/BV1Axgg6aExW/'],
    ['detail-2', 'https://www.bilibili.com/video/BV1i49cBwEyj/'],
  ] },
  { platform: 'douyin', cases: [
    ['home', 'https://www.douyin.com/'],
    ['search', 'https://www.douyin.com/search/%E7%8C%AB?type=video'],
    ['detail-1', 'https://www.douyin.com/video/7660872948165262579'],
    ['detail-2', 'https://www.douyin.com/video/7613600809083260879'],
  ] },
  { platform: 'xiaohongshu', cases: [
    ['home', 'https://www.xiaohongshu.com/explore'],
    ['search', 'https://www.xiaohongshu.com/search_result?keyword=%E7%8C%AB'],
    ['detail-1', 'https://www.xiaohongshu.com/explore/669b9dfc0000000025007280'],
    ['detail-2', 'https://www.xiaohongshu.com/explore/6762e05f000000000800f8b1'],
  ] },
];

function cleanUrl(value) {
  try {
    const url = new URL(value);
    const safeParams = new URLSearchParams();
    for (const key of ['keyword', 'type', 'error_code']) {
      if (url.searchParams.has(key)) safeParams.set(key, url.searchParams.get(key));
    }
    return `${url.origin}${url.pathname}${safeParams.size ? `?${safeParams}` : ''}`;
  } catch { return ''; }
}

function classify(result) {
  if (result.error && !result.bodyLength) return 'navigation_failed';
  if (/安全限制/.test(result.title) || /当前网络存在风险/.test(result.bodyExcerpt)) return 'network_risk_block';
  if (/验证码|安全验证/.test(result.title) && result.contentLinks.length === 0) return 'verification_page';
  if (/浏览器版本过低/.test(result.bodyExcerpt) || result.finalUrl?.includes('/blackboard/fe/')) return 'browser_upgrade_page';
  if (result.videoMetadata?.bvid && result.heading) return 'video_metadata_readable';
  if (result.contentLinks.length >= 2) return 'content_cards_readable';
  if (/login/.test(result.finalUrl) && /登录|Log in|Sign in/i.test(result.bodyExcerpt)) return 'login_page';
  if (result.status >= 400) return 'http_error';
  return result.bodyLength > 100 ? 'page_text_only_unconfirmed_content' : 'empty_or_shell';
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QING_BROWSER_EXECUTABLE ? { executablePath: process.env.QING_BROWSER_EXECUTABLE } : {}),
  args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'],
});
const report = {
  startedAt: new Date().toISOString(), browser: browser.version(),
  method: 'Local Playwright Chromium, fresh anonymous context per platform; default browser user agent; no proxy override or stealth patches.',
  scope: 'Home, search, two known public detail URLs per platform; Bilibili additionally follows one homepage-discovered video URL.',
  limits: ['No logged-in checks.', 'No CAPTCHA solving.', 'Requests classified as media were blocked; players may load data through fetch/XHR and some screenshots contain player imagery. Full playback, transcripts and video comprehension were not tested.', 'Screenshots and brief metadata only; no cookies, account state or full page content saved.', 'Single environment and short smoke check; no production reliability claim.'],
  results: [],
};

async function checkPage(context, platform, kind, url) {
  const page = await context.newPage();
  const result = { platform, kind, requestedUrl: cleanUrl(url), checkedAt: new Date().toISOString(), documentResponses: [], failedRequestCount: 0, blockedMediaCount: 0, pageErrorCount: 0 };
  page.on('response', response => {
    if (response.request().isNavigationRequest() && response.request().frame() === page.mainFrame()) {
      result.documentResponses.push({ status: response.status(), url: cleanUrl(response.url()) });
    }
  });
  page.on('requestfailed', () => result.failedRequestCount++);
  page.on('pageerror', () => result.pageErrorCount++);
  await page.route('**/*', route => {
    if (mediaTypes.has(route.request().resourceType())) { result.blockedMediaCount++; return route.abort(); }
    return route.continue();
  });
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    result.status = response?.status() ?? null;
    await page.waitForTimeout(5000);
    Object.assign(result, await page.evaluate(() => {
      const body = document.body?.innerText || '';
      const state = window.__INITIAL_STATE__?.videoData;
      const candidates = Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.href, label: (a.innerText || a.getAttribute('title') || '').trim().slice(0, 50) }));
      const links = candidates.filter(a => /(?:bilibili\.com\/video\/BV|douyin\.com\/video\/\d|xiaohongshu\.com\/(?:explore|discovery\/item)\/[a-f\d]{24})/i.test(a.href));
      return {
        title: document.title,
        bodyLength: body.trim().length,
        bodyExcerpt: body.trim().slice(0, 140),
        heading: document.querySelector('h1')?.innerText?.trim()?.slice(0, 90) || '',
        description: (document.querySelector('meta[name="description"]')?.content || '').slice(0, 140),
        contentLinks: [...new Map(links.map(a => [a.href, a])).values()].slice(0, 6),
        contentLinkCount: new Set(links.map(a => a.href)).size,
        loadedImageCount: Array.from(document.images).filter(img => img.complete && img.naturalWidth > 40).length,
        videoElementCount: document.querySelectorAll('video').length,
        videoMetadata: state ? { bvid: state.bvid, title: String(state.title || '').slice(0, 90), description: String(state.desc || '').slice(0, 140), author: state.owner?.name, picturePresent: Boolean(state.pic) } : null,
      };
    }));
    result.contentLinks = result.contentLinks.map(a => ({ url: cleanUrl(a.href), label: a.label }));
    result.finalUrl = cleanUrl(page.url());
    result.classification = classify(result);
    result.screenshot = `${platform}-${kind}.png`;
    await page.screenshot({ path: path.join(outputDir, result.screenshot), fullPage: false, timeout: 10000 });
  } catch (error) {
    result.finalUrl = cleanUrl(page.url());
    result.error = String(error.message).split('\n')[0].replace(/\?[^\s"]+/g, '?[redacted]');
    result.classification = result.bodyLength ? classify(result) : 'navigation_failed';
  } finally { await page.close(); }
  console.log(JSON.stringify({ platform, kind, status: result.status, title: result.title, classification: result.classification, contentLinkCount: result.contentLinkCount, error: result.error }));
  return result;
}

try {
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1366, height: 900 } });
  report.control = await checkPage(context, 'control', 'example', 'https://example.com/');
  await context.close();
  const outputs = await Promise.all(suites.map(async suite => {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1366, height: 900 } });
    const results = [];
    try {
      for (const [kind, url] of suite.cases) results.push(await checkPage(context, suite.platform, kind, url));
      if (suite.platform === 'bilibili') {
        const discovered = results[0]?.contentLinks.find(a => a.url.includes('/video/BV') && !suite.cases.some(c => c[1] === a.url));
        if (discovered) results.push(await checkPage(context, suite.platform, 'discovered-detail', discovered.url));
      }
    } finally { await context.close(); }
    return results;
  }));
  report.results = outputs.flat();
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, 'browser-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
console.log(`Report saved to ${path.join(outputDir, 'browser-results.json')}`);
