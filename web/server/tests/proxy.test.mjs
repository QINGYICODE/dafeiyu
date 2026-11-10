import test from 'node:test';
import assert from 'node:assert/strict';
import { sameApplicationOrigin, serviceHeaders } from '../../lib/proxy-policy.mjs';

test('FRP public application origin is accepted without a hostname whitelist', () => {
  const request = new Request('http://127.0.0.1:5173/api/chat', { headers: { host: 'frp-oil.com:38413', origin: 'http://frp-oil.com:38413', 'content-type': 'application/json' } });
  assert(sameApplicationOrigin(request));
  assert.equal(serviceHeaders(request).get('origin'), null);
  assert.equal(serviceHeaders(request).get('content-type'), 'application/json');
});
test('HTTPS termination and forwarded public hosts are supported', () => {
  assert(sameApplicationOrigin(new Request('http://localhost:5173/api/chat', { headers: { origin: 'https://frp-oil.com:38413', 'x-forwarded-host': 'frp-oil.com:38413' } })));
  assert(sameApplicationOrigin(new Request('https://another-tunnel.example/api/chat', { headers: { origin: 'https://another-tunnel.example' } })));
});
test('local requests and requests without a browser Origin remain supported', () => {
  assert(sameApplicationOrigin(new Request('http://localhost:5173/api/health')));
  assert(sameApplicationOrigin(new Request('http://localhost:5173/api/chat', { headers: { origin: 'http://localhost:5173' } })));
});
test('an unrelated or opaque browser origin is not treated as the application', () => {
  for (const origin of ['https://other.example', 'null', 'file:///', 'http://frp-oil.com:38413.evil.example']) assert(!sameApplicationOrigin(new Request('http://frp-oil.com:38413/api/chat', { headers: { origin } })));
});
