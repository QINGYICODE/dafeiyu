import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Companion } from './companion.mjs';
import { AppError, text } from './network.mjs';
import { resolveEnvironmentKeys } from './environment.mjs';

async function bytes(request, limit = 12 * 1024 * 1024) {
  if (Number(request.headers['content-length'] || 0) > limit) throw new AppError('附件需小于 12 MB。', 413);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw new AppError('附件需小于 12 MB。', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

async function body(request) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw new AppError('需要 JSON 请求。', 415);
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new AppError('内容过大。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new AppError('请求格式不正确。'); }
}

export function createServer(companion, port = 3101) {
  const allowedOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
    try {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.has(origin)) throw new AppError('此页面无权访问本机伙伴服务。', 403);
      const host = String(request.headers.host || '').split(':')[0];
      if (!['localhost', '127.0.0.1'].includes(host)) throw new AppError('仅允许本机访问。', 403);
      const url = new URL(request.url, 'http://localhost'); const route = url.pathname; const method = request.method;
      if (method === 'GET' && route === '/api/health') return json({ ok: true, version: '0.7.1', modelConfigured: Boolean(companion.store.getKey()), browser: 'local', time: new Date().toISOString() });
      if (method === 'GET' && route === '/api/state') return json(companion.state());
      if (method === 'POST' && route === '/api/speech/test') return json(await companion.cloudSpeech.test((await body(request)).mediaId));
      if (method === 'POST' && route === '/api/speech/clone') return json(await companion.cloudSpeech.createClone(await body(request)));
      if (method === 'POST' && route === '/api/speech/clone/check') return json(await companion.cloudSpeech.queryClone((await body(request)).voiceId));
      if (method === 'POST' && route === '/api/voice/preview') return json(await companion.speak(null, await body(request)));
      const voiceMessage = route.match(/^\/api\/messages\/([\w-]+)\/voice$/);
      if (method === 'POST' && voiceMessage) return json(await companion.speak(voiceMessage[1]));
      if (method === 'GET' && route === '/api/accounts/bilibili') return json(companion.bilibili.summary());
      if (method === 'POST' && route === '/api/accounts/bilibili/login') return json(await companion.bilibili.startLogin(), 201);
      const biliLogin = route.match(/^\/api\/accounts\/bilibili\/login\/([\w-]+)$/);
      if (method === 'GET' && biliLogin) return json(await companion.bilibili.pollLogin(biliLogin[1]));
      if (method === 'DELETE' && biliLogin) return json(await companion.bilibili.cancelLogin(biliLogin[1]));
      if (method === 'POST' && route === '/api/accounts/bilibili/check') return json(await companion.bilibili.check());
      if (method === 'DELETE' && route === '/api/accounts/bilibili') return json(await companion.bilibili.disconnect());
      if (method === 'PUT' && route === '/api/accounts/bilibili/preferences') return json(companion.bilibili.setPreferences(await body(request)));
      if (method === 'GET' && route === '/api/accounts/bilibili/feed') return json(await companion.bilibili.feed());
      if (method === 'PUT' && route === '/api/settings') return json(await companion.settings(await body(request)));
      if (method === 'POST' && route === '/api/model/test') return json(await companion.model.test());
      if (method === 'POST' && route === '/api/chat') return json(companion.startChat(await body(request)), 202);
      if (method === 'POST' && route === '/api/media') {
        let name = ''; try { name = decodeURIComponent(String(request.headers['x-file-name'] || '')); } catch {}
        return json(await companion.media.upload(await bytes(request), { kind: request.headers['x-media-kind'], name }), 201);
      }
      if (method === 'POST' && route === '/api/media/from-sticker') {
        const input = await body(request); const sticker = companion.store.one('stickers', input.stickerId);
        if (!sticker) throw new AppError('这个表情已不可用。', 404);
        const data = await readFile(path.join(companion.store.directory, 'stickers', path.basename(sticker.filename))).catch(() => null);
        if (!data) throw new AppError('这个表情已不可用。', 404);
        return json(await companion.media.upload(data, { kind: 'sticker', name: sticker.meaning }), 201);
      }
      const attachment = route.match(/^\/api\/media\/([\w-]+)\/file$/);
      if (['GET', 'HEAD'].includes(method) && attachment) {
        const { item, data } = companion.media.file(attachment[1]);
        const range = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range || ''));
        let start = 0, end = data.length - 1;
        if (range) { start = Number(range[1]); end = range[2] ? Math.min(end, Number(range[2])) : end; if (start > end || start >= data.length) { response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); response.end(); return; } }
        response.writeHead(range ? 206 : 200, { 'Content-Type': item.mime, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${data.length}` } : {}) });
        response.end(method === 'HEAD' ? undefined : data.subarray(start, end + 1)); return;
      }
      if (method === 'POST' && route === '/api/explore') return json(companion.startExplore(await body(request)), 202);
      const cancel = route.match(/^\/api\/jobs\/([\w-]+)\/cancel$/);
      if (method === 'POST' && cancel) return json(companion.cancel(cancel[1]));
      const probe = route.match(/^\/api\/platforms\/(\w+)\/test$/);
      if (method === 'POST' && probe) return json(await companion.probe(probe[1]));
      if (method === 'POST' && route === '/api/conversations') return json(companion.store.newConversation(), 201);
      const conversation = route.match(/^\/api\/conversations\/([\w-]+)$/);
      if (method === 'DELETE' && conversation) return json(companion.deleteConversation(conversation[1]));
      if (method === 'PUT' && route === '/api/conversations/active') {
        const input = await body(request); if (!companion.store.one('conversations', input.id)) throw new AppError('聊天不存在。', 404); companion.store.set('activeConversation', input.id); return json({ ok: true });
      }
      if (method === 'GET' && route === '/api/backup') {
        response.setHeader('Content-Disposition', `attachment; filename="qing-backup-${new Date().toISOString().slice(0, 10)}.json"`); return json(companion.exportBackup());
      }
      if (method === 'POST' && route === '/api/backup/import') return json(companion.importBackup(await body(request)));
      if (method === 'DELETE' && route === '/api/stickers') { companion.clearStickers(); return json({ ok: true }); }
      if (method === 'POST' && route === '/api/stickers/discover') return json(await companion.discoverStickers());
      if (method === 'POST' && route === '/api/reset') { const input = await body(request); if (input.confirm !== '清空数据') throw new AppError('请输入「清空数据」确认。'); return json(await companion.reset(input.includeSettings === true)); }
      const sticker = route.match(/^\/api\/stickers\/([\w-]+)\/file$/);
      if (method === 'GET' && sticker) {
        const item = companion.store.one('stickers', sticker[1]); if (!item) throw new AppError('表情已经不在收藏中了。', 404);
        const filename = path.join(companion.store.directory, 'stickers', path.basename(item.filename));
        const bytes = await readFile(filename).catch(() => null); if (!bytes) throw new AppError('这个表情文件已不可用。', 404);
        response.writeHead(200, { 'Content-Type': item.mime, 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=3600' }); response.end(bytes); return;
      }
      throw new AppError('没有找到这个操作。', 404);
    } catch (error) {
      if (!response.headersSent) json({ error: error instanceof AppError ? error.message : '本机服务暂时没有完成操作，请稍后重试。', code: error.code || 'INTERNAL_ERROR' }, error instanceof AppError ? error.status : 500);
      else response.end();
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.env.TZ ||= 'Asia/Shanghai';
  resolveEnvironmentKeys();
  const port = Number(process.env.QING_SERVICE_PORT || 3101);
  const companion = new Companion({ directory: process.env.QING_DATA_DIR || fileURLToPath(new URL('../.data', import.meta.url)) });
  const server = createServer(companion, port);
  server.listen(port, '127.0.0.1', () => { if (process.env.QING_DISABLE_SCHEDULER !== '1') companion.startScheduler(); console.log(`大肥鱼本机服务 http://127.0.0.1:${port} · 模型密钥${companion.store.getKey() ? '已配置' : '未配置'}`); });
  server.on('error', () => { console.error('本机服务端口不可用，请关闭已运行的服务或调整 QING_SERVICE_PORT。'); process.exitCode = 1; companion.close(); });
  let closing = false;
  const stop = async () => { if (closing) return; closing = true; server.close(); await companion.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
