import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { sendAndroidDownload } from '../downloads.mjs';

const name = 'dafeiyu-flutter-v0.2.0-preview.apk';
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dafeiyu-download-'));
  const data = Buffer.from('0123456789abcdef');
  await writeFile(path.join(directory, name), data);
  const server = http.createServer(async (request, response) => {
    try {
      if (await sendAndroidDownload(request, response, new URL(request.url, 'http://localhost').pathname, directory)) return;
      response.writeHead(404); response.end();
    } catch (error) { response.writeHead(error.status || 500); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, data };
}

test('preview APK streams with the correct type, filename and HEAD metadata', async t => {
  const { base, data } = await fixture(t);
  const response = await fetch(`${base}/api/downloads/${name}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.match(response.headers.get('content-disposition'), /dafeiyu-flutter-v0.2.0-preview.apk/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
  const head = await fetch(`${base}/api/downloads/${name}`, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), String(data.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('APK downloads support bounded byte ranges and reject invalid ranges', async t => {
  const { base, data } = await fixture(t);
  const response = await fetch(`${base}/api/downloads/${name}`, { headers: { Range: 'bytes=4-7' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes 4-7/${data.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), data.subarray(4, 8));
  for (const range of ['bytes=99-', 'bytes=7-4', 'bytes=0-1,4-5', 'invalid']) {
    const invalid = await fetch(`${base}/api/downloads/${name}`, { headers: { Range: range } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), `bytes */${data.length}`);
    await invalid.arrayBuffer();
  }
});

test('only generated APK names are downloadable, with no access to other files', async t => {
  const { base } = await fixture(t);
  for (const file of ['database.sqlite', '..%2Fprivate.key', 'dafeiyu-flutter-v9.9.9-preview.apk']) {
    const missing = await fetch(`${base}/api/downloads/${file}`);
    assert.equal(missing.status, 404); await missing.arrayBuffer();
  }
  const post = await fetch(`${base}/api/downloads/${name}`, { method: 'POST' });
  assert.equal(post.status, 405); await post.arrayBuffer();
});
