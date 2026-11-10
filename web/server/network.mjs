import dns from 'node:dns/promises';
import net from 'node:net';

export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}
export const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const number = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function isPrivateAddress(address) {
  if (address.toLowerCase().startsWith('::ffff:')) return true;
  const a = address.toLowerCase();
  if (net.isIP(a) === 4) { const [x, y] = a.split('.').map(Number); return x === 0 || x === 10 || x === 127 || x >= 224 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127); }
  return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || /^fe[89ab]/.test(a) || a.startsWith('ff');
}
export async function publicUrl(value) {
  let url; try { url = new URL(value); } catch { throw new AppError('请输入有效的网址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new AppError('只支持不含账号密码的公开 HTTPS 地址。');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(?:localhost|.+\.localhost)$/.test(hostname)) throw new AppError('不能读取本机或内网地址。');
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some(x => isPrivateAddress(x.address))) throw new AppError('网址无法解析为可访问的公开服务。');
  return url;
}
export const platformFor = value => {
  let host; try { host = new URL(value).hostname.toLowerCase(); } catch { return null; }
  if (/^(?:www\.|search\.|m\.)?bilibili\.com$/.test(host) || host === 'b23.tv') return 'bilibili';
  if (/^(?:www\.|v\.|m\.)?douyin\.com$/.test(host) || host === 'www.iesdouyin.com') return 'douyin';
  if (/^(?:www\.|m\.)?xiaohongshu\.com$/.test(host) || host === 'xhslink.com') return 'xiaohongshu';
  if (/^(?:www\.|m\.)?weibo\.(?:com|cn)$/.test(host) || host === 't.cn') return 'weibo';
  if (/^(?:www\.)?geng8\.com$/.test(host)) return 'gengbaike';
  if (host === 'geng.page') return 'gengwiki';
  if (/^(?:www\.)?fabiaoqing\.com$/.test(host)) return 'fabiaoqing';
  return null;
};
export function cleanContentUrl(value) {
  const url = new URL(value); if (platformFor(value) !== 'gengwiki') url.hash = '';
  if (url.hostname.includes('bilibili.com') || url.hostname.includes('douyin.com')) url.search = '';
  // XHS share parameters may be necessary for a valid shared note; retain only these.
  else for (const key of [...url.searchParams.keys()]) if (!['xsec_token', 'xsec_source', ...(platformFor(value) === 'gengbaike' ? ['q'] : [])].includes(key)) url.searchParams.delete(key);
  return url.href;
}
export function displayUrl(value) { const url = new URL(value); return `${url.origin}${url.pathname}${platformFor(value) === 'gengwiki' ? url.hash : ''}`; }
export async function boundedBody(response, maxBytes = 5 * 1024 * 1024) {
  const reader = response.body?.getReader(); if (!reader) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new AppError('返回内容超过大小限制。'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
