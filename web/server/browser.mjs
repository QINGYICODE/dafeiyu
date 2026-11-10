import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { AppError, publicUrl, platformFor, cleanContentUrl, displayUrl, boundedBody } from './network.mjs';
import { sourceCatalog, sourceSearchUrl } from '../lib/source-catalog.mjs';

const resourceDomains = {
  bilibili: ['bilibili.com', 'hdslb.com', 'biliapi.net', 'biliapi.com', 'b23.tv'],
  douyin: ['douyin.com', 'douyinstatic.com', 'iesdouyin.com', 'byteimg.com', 'douyinpic.com', 'douyincdn.com', 'douyinvod.com', 'bytedance.com', 'bytedance.net', 'bytednsdoc.com', 'bytetcc.com', 'amemv.com'],
  xiaohongshu: ['xiaohongshu.com', 'xhscdn.com', 'xhsimg.com', 'xhslink.com', 'rednote.com'],
  weibo: ['weibo.com', 'weibo.cn', 'sinaimg.cn', 'sinajs.cn', 't.cn'],
  gengbaike: ['geng8.com'], gengwiki: ['geng.page'],
  fabiaoqing: ['fabiaoqing.com', 'soutula.com', 'sinaimg.cn'],
};
const ownedResource = (platform, host) => resourceDomains[platform]?.some(domain => host === domain || host.endsWith(`.${domain}`));
function executable() {
  if (process.env.QING_BROWSER_EXECUTABLE) return process.env.QING_BROWSER_EXECUTABLE;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  if (existsSync(cache)) for (const dir of readdirSync(cache).sort().reverse()) {
    for (const relative of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const file = path.join(cache, dir, relative); if (existsSync(file)) return file;
    }
  }
  return undefined;
}
export class BrowserReader {
  constructor(store) { this.store = store; this.browser = null; this.starting = null; }
  async readingContext(platform, options = {}) {
    const session = platform === 'bilibili' ? await this.account?.browsingSession() : null;
    const context = await (await this.getBrowser()).newContext({ locale: 'zh-CN', viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', ...options, ...(session ? { storageState: session.storageState } : {}) });
    if (session && !this.account.track(context, session.revision)) throw new AppError('B 站账号已断开，请重新开始浏览。', 409);
    return { context, revision: session?.revision, sessionUsed: Boolean(session) };
  }
  async getBrowser() {
    if (this.browser?.isConnected()) return this.browser;
    if (!this.starting) this.starting = import('playwright').then(async ({ chromium }) => {
      try { this.browser = await chromium.launch({ headless: true, executablePath: executable(), args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] }); return this.browser; }
      catch { throw new AppError('浏览服务尚未准备好，请在本机安装 Chromium 浏览器后重启。', 503, 'BROWSER_UNAVAILABLE'); }
    }).finally(() => this.starting = null);
    return this.starting;
  }
  checkPlatform(platform) {
    if (!this.store.get('settings').platforms[platform]?.enabled) throw new AppError('这个平台尚未开启，请先在设置中启用。', 409, 'PLATFORM_DISABLED');
  }
  async read(value, signal) {
    if (signal?.aborted) throw new AppError('阅读已取消。', 409, 'CANCELLED');
    const url = await publicUrl(value); const platform = platformFor(url.href);
    if (!platform) throw new AppError('只读取已配置的社交、梗百科与表情来源。');
    this.checkPlatform(platform);
    const { context, revision, sessionUsed } = await this.readingContext(platform);
    if (signal?.aborted) { if (sessionUsed) this.account?.untrack(context); await context.close(); throw new AppError('阅读已取消。', 409, 'CANCELLED'); }
    const page = await context.newPage();
    const abort = () => { context.close().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await page.route('**/*', async route => {
        const request = route.request(); let target; try { target = new URL(request.url()); } catch { return route.abort(); }
        if (!['https:', 'data:', 'blob:'].includes(target.protocol)) return route.abort();
        if (target.protocol !== 'https:') return route.continue();
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          if (platformFor(target.href) !== platform) return route.abort();
          try { await publicUrl(target.href); } catch { return route.abort(); }
        }
        if (!ownedResource(platform, target.hostname)) return route.abort();
        if (request.resourceType() === 'media' || /\.(m4s|mp4|m3u8|flv|mp3|aac|webm)$/i.test(target.pathname)) return route.abort();
        return route.continue();
      });
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 28000 });
      await page.waitForTimeout(['gengbaike', 'gengwiki', 'fabiaoqing'].includes(platform) ? 650 : 3200);
      if (signal?.aborted) throw new AppError('阅读已取消。', 409, 'CANCELLED');
      this.checkPlatform(platform);
      const title = await page.title();
      const bodyText = await page.locator('body').innerText();
      if (/验证码|安全验证/.test(title) && bodyText.trim().length < 200) throw new AppError('这个平台要求完成验证，已暂停读取；没有把验证页记作见闻。', 409, 'PLATFORM_VERIFICATION');
      if (/安全限制|访问受限/.test(title) || /当前网络存在风险/.test(bodyText)) throw new AppError('平台限制了当前网络的访问，暂时读不到内容。', 409, 'PLATFORM_RESTRICTED');
      if (/浏览器版本过低/.test(bodyText)) throw new AppError('平台暂不接受当前浏览器，未取得正文。', 409, 'PLATFORM_BROWSER_REJECTED');
      if ((response?.status() || 200) >= 400) throw new AppError('平台暂时未返回可读页面。', 502, 'PLATFORM_HTTP_ERROR');
      const extracted = await page.evaluate((platform) => {
        const video = window.__INITIAL_STATE__?.videoData;
        const heading = document.querySelector('h1, .opus-module-title, .article-title')?.innerText?.trim() || '';
        const description = video?.desc || document.querySelector('.basic-desc-info, #v_desc, article, .opus-module-content, [data-e2e="video-desc"]')?.innerText || document.querySelector('meta[name="description"]')?.content || '';
        const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({ url: a.href.replace(/^http:\/\/(?:www\.)?fabiaoqing.com/, 'https://www.fabiaoqing.com'), title: (a.getAttribute('title') || a.innerText || '').trim().slice(0, 120) })).filter(a => /(?:bilibili\.com\/(?:video\/BV|opus\/\d|read\/cv\d)|douyin\.com\/video\/\d|xiaohongshu\.com\/(?:explore|discovery\/item)\/[a-f\d]{24}|weibo\.(?:com|cn)\/\d|geng8\.com\/word\/|geng\.page\/#(?:p\d|exp-)|fabiaoqing\.com\/(?:biaoqing\/detail|bqb\/detail))/i.test(a.url) && a.title);
        const contentImages = Array.from(document.querySelectorAll('article img, .opus-module-content img, .article-holder img, .reply-content img'));
        const imageElements = [...new Set([...contentImages, ...document.images])];
        const images = imageElements.filter(img => (img.dataset.original || img.dataset.src || (img.naturalWidth >= 100 && img.naturalHeight >= 80)) && !/avatar|logo|transparent.gif/i.test(img.dataset.original || img.dataset.src || img.src)).map(img => ({ url: new URL(img.dataset.original || img.dataset.src || img.currentSrc || img.src, location.href).href.replace(/^http:/, 'https:'), alt: (img.alt || img.title || '').slice(0, 160), width: img.naturalWidth, height: img.naturalHeight }));
        const candidates = images.filter(img => /\.gif(?:[?!]|$)|emoji|emote|表情/i.test(img.url + img.alt));
        const article = document.querySelector('article, #read-article-holder, .opus-module-content');
        return {
          title: heading || document.title,
          author: video?.owner?.name || document.querySelector('[data-e2e="user-info"]')?.innerText?.slice(0, 100) || '',
          description: description.slice(0, 2500), text: (article?.innerText || document.body.innerText).slice(0, 6500),
          cover: video?.pic || document.querySelector('meta[property="og:image"]')?.content || '',
          links: [...new Map(links.map(a => [a.url, a])).values()].slice(0, 36),
          images: [...new Map([...candidates, ...images].map(img => [img.url, img])).values()].slice(0, 12),
          isDetail: platform === 'gengbaike' ? /\/word\//.test(location.pathname) : platform === 'gengwiki' ? /^#(?:p\d|exp-)/.test(location.hash) : platform === 'fabiaoqing' ? true : Boolean(heading || video?.bvid || (article && /\/(?:read\/cv|opus\/)/.test(location.pathname))),
        };
      }, platform);
      const finalUrl = page.url(); if (platformFor(finalUrl) !== platform) throw new AppError('页面跳转到了未允许的平台，已停止读取。');
      if (sessionUsed && !this.account.active(revision)) throw new AppError('B 站账号已断开，已停止这次读取。', 409);
      extracted.links = extracted.links.filter(link => platformFor(link.url) === platform).map(link => ({ ...link, url: cleanContentUrl(link.url) }));
      extracted.images = extracted.images.filter(img => { try { return ownedResource(platform, new URL(img.url).hostname); } catch { return false; } });
      if (!extracted.isDetail && extracted.links.length < 1) throw new AppError('这次没有找到相关的可读内容。', 409, 'PLATFORM_EMPTY');
      return { platform, url: cleanContentUrl(finalUrl), displayUrl: displayUrl(finalUrl), ...extracted, sessionUsed, contentBasis: extracted.isDetail ? '网页标题、简介与可见文字' : '页面内容卡片', fetchedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (signal?.aborted) throw new AppError('阅读已取消。', 409, 'CANCELLED');
      throw new AppError('页面暂时无法读取，可能是网络、登录或平台限制。', 502, 'BROWSER_READ_FAILED');
    } finally { signal?.removeEventListener('abort', abort); if (sessionUsed) { await this.account?.capture(context, revision).catch(() => {}); this.account?.untrack(context); } await context.close().catch(() => {}); }
  }
  async discover(platform, topic, signal) {
    this.checkPlatform(platform);
    return this.read(sourceSearchUrl(platform, topic), signal);
  }
  async image(value, platform, signal) {
    const url = await publicUrl(value); this.checkPlatform(platform);
    if (!ownedResource(platform, url.hostname)) throw new AppError('图片来源不属于当前阅读的平台。');
    let current = url; let response;
    for (let i = 0; i < 4; i++) {
      response = await fetch(current, { redirect: 'manual', headers: { Referer: sourceCatalog[platform].home }, signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]) });
      if (response.status < 300 || response.status >= 400) break;
      const target = await publicUrl(new URL(response.headers.get('location') || '', current).href); if (!ownedResource(platform, target.hostname)) throw new AppError('图片跳转超出平台范围。');
      await response.body?.cancel(); current = target;
    }
    if (!response?.ok) throw new AppError('这张图片暂时无法下载。');
    const data = await boundedBody(response, 2 * 1024 * 1024);
    const mime = data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'image/png' : /^GIF8/.test(data.toString('ascii', 0, 4)) ? 'image/gif' : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : '';
    if (!mime) throw new AppError('素材不是受支持的图片或 GIF。');
    const hash = createHash('sha256').update(data).digest('hex');
    const browser = await this.getBrowser(); const context = await browser.newContext(); const page = await context.newPage();
    const abort = () => { context.close().catch(() => {}); }; signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) throw new AppError('图片读取已取消。', 409, 'CANCELLED');
      const imageInfo = await page.evaluate(async ({ base64, mime }) => {
        const image = new Image(); image.src = `data:${mime};base64,${base64}`; await image.decode();
        if (image.width > 8192 || image.height > 8192) throw new Error('Too large');
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 8, 8); const pixels = ctx.getImageData(0, 0, 8, 8).data;
        const gray = Array.from({ length: 64 }, (_, i) => pixels[i * 4] * .3 + pixels[i * 4 + 1] * .59 + pixels[i * 4 + 2] * .11);
        const avg = gray.reduce((a, b) => a + b, 0) / 64; const bits = gray.map(x => x >= avg ? '1' : '0').join('');
        return { width: image.width, height: image.height, perceptualHash: BigInt(`0b${bits}`).toString(16).padStart(16, '0') };
      }, { base64: data.toString('base64'), mime });
      return { data, mime, hash, ...imageInfo };
    } catch { throw new AppError('素材图片未通过实际解码检查。'); }
    finally { signal?.removeEventListener('abort', abort); await context.close().catch(() => {}); }
  }
  async close() { await this.browser?.close(); }
}
