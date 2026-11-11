import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createGateway } from '../gateway.mjs';

async function fixture(t) {
  let uiHits = 0, serviceConnections = 0;
  const service = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Accept-Ranges': 'bytes' });
    res.end(JSON.stringify({ source: 'service', host: req.headers.host, origin: req.headers.origin,
      range: req.headers.range, filename: req.headers['x-file-name'], body: Buffer.concat(chunks).toString() }));
  });
  service.on('connection', () => serviceConnections++);
  const ui = http.createServer((_req, res) => { uiHits++; res.end('web-ui'); });
  service.listen(0, '127.0.0.1'); ui.listen(0, '127.0.0.1');
  await Promise.all([once(service, 'listening'), once(ui, 'listening')]);
  const gateway = createGateway({ servicePort: service.address().port, uiPort: ui.address().port });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(async () => {
    await new Promise(resolve => gateway.close(resolve));
    await Promise.all([new Promise(resolve => service.close(resolve)), new Promise(resolve => ui.close(resolve))]);
  });
  return { base: `http://127.0.0.1:${gateway.address().port}`, servicePort: service.address().port,
    uiHits: () => uiHits, serviceConnections: () => serviceConnections };
}

test('native API polling bypasses the UI worker and reuses a bounded socket pool', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 100; i++) {
    const response = await fetch(f.base + '/api/state');
    assert.equal((await response.json()).source, 'service');
  }
  assert.equal(f.uiHits(), 0);
  assert(f.serviceConnections() < 5);
  assert.equal(await (await fetch(f.base + '/')).text(), 'web-ui');
  assert.equal(f.uiHits(), 1);
});

test('gateway preserves same-app origin checks and strips public origin before the private hop', async t => {
  const f = await fixture(t);
  const foreign = await fetch(f.base + '/api/settings', { headers: { Origin: 'https://foreign.example' } });
  assert.equal(foreign.status, 403); assert.equal((await foreign.json()).code, 'ORIGIN_MISMATCH');
  const unrelatedLocal = await fetch(f.base + '/api/settings', { headers: { Origin: 'http://localhost' } });
  assert.equal(unrelatedLocal.status, 403); await unrelatedLocal.arrayBuffer();
  const allowed = await fetch(f.base + '/api/state', { headers: { Origin: 'https://frp-oil.com:38413', 'X-Forwarded-Host': 'frp-oil.com:38413' } });
  const result = await allowed.json();
  assert.equal(result.host, `127.0.0.1:${f.servicePort}`);
  assert.equal(result.origin, undefined);
});

test('gateway streams media bodies and forwards byte-range metadata', async t => {
  const f = await fixture(t);
  const response = await fetch(f.base + '/api/media', { method: 'POST', body: 'actual-media', headers: { 'Content-Type': 'audio/mp4', 'X-File-Name': 'voice.m4a' } });
  const media = await response.json(); assert.equal(media.body, 'actual-media'); assert.equal(media.filename, 'voice.m4a');
  const ranged = await fetch(f.base + '/api/downloads/dafeiyu-flutter-v0.3.0-preview.apk', { headers: { Range: 'bytes=4-7' } });
  assert.equal(ranged.headers.get('accept-ranges'), 'bytes'); assert.equal((await ranged.json()).range, 'bytes=4-7');
});
