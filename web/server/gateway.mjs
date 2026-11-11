import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameApplicationOrigin, serviceHeaders } from '../lib/proxy-policy.mjs';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

// Keep frequent native API polls and large APK downloads out of the UI worker's
// node-compat loopback bridge. Both targets remain private loopback listeners.
export function createGateway({ servicePort = 3101, uiPort = 5174 } = {}) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8 });
  const server = http.createServer((request, response) => {
    const fail = (status, error, code) => {
      if (response.destroyed) return;
      if (response.headersSent) { response.destroy(); return; }
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error, code }));
    };
    let url, facade;
    try {
      const host = request.headers.host || '127.0.0.1:5173';
      if (/[\s/@\\]/.test(host)) throw new Error('Invalid Host');
      url = new URL(request.url, `http://${host}`);
      facade = { url: new URL(url.pathname + url.search, `http://${host}`).href, headers: new Headers() };
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined) facade.headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    } catch { fail(400, '请求地址不正确。', 'INVALID_REQUEST'); return; }
    const api = url.pathname.startsWith('/api/');
    if (api && !sameApplicationOrigin(facade)) {
      fail(403, '请求来源与当前访问地址不一致，请从应用页面访问。', 'ORIGIN_MISMATCH'); return;
    }
    const headers = api ? Object.fromEntries(serviceHeaders(facade)) : Object.fromEntries(
      Object.entries(request.headers).filter(([key]) => !hopHeaders.has(key.toLowerCase())));
    const port = api ? servicePort : uiPort;
    headers.host = `127.0.0.1:${port}`;
    const upstream = http.request({ hostname: '127.0.0.1', port, method: request.method,
      path: url.pathname + url.search, headers, agent }, incoming => {
      if (response.destroyed) { incoming.destroy(); return; }
      response.writeHead(incoming.statusCode || 502, Object.fromEntries(
        Object.entries(incoming.headers).filter(([key]) => !hopHeaders.has(key.toLowerCase()))));
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
    });
    upstream.setTimeout(api && url.pathname.startsWith('/api/downloads/') ? 15 * 60 * 1000 : 120000,
      () => upstream.destroy(new Error('Upstream timeout')));
    upstream.on('error', () => fail(503, '伙伴服务暂时无法连接，请稍后重试。', 'SERVICE_OFFLINE'));
    request.on('aborted', () => upstream.destroy());
    request.on('error', () => upstream.destroy());
    response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
    request.pipe(upstream);
  });
  server.on('close', () => agent.destroy());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createGateway();
  server.listen(5173, '127.0.0.1', () => console.log('大肥鱼应用入口 http://127.0.0.1:5173'));
  server.on('error', () => { console.error('应用入口端口不可用。'); process.exitCode = 1; });
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
