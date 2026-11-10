// The browser talks to the public app origin; the Node service is a separate,
// loopback-only hop. Do not forward the browser's public Origin to that hop.
export function sameApplicationOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
  const authorities = [new URL(request.url).host, request.headers.get('host'), request.headers.get('x-forwarded-host')?.split(',')[0].trim()];
  return authorities.some(value => {
    if (!value || /[\s/@\\]/.test(value)) return false;
    try { return new URL(`${parsed.protocol}//${value}`).host === parsed.host; } catch { return false; }
  });
}

export function serviceHeaders(request) {
  const headers = new Headers();
  for (const key of ['content-type', 'range', 'x-file-name', 'x-media-kind']) {
    const value = request.headers.get(key); if (value) headers.set(key, value);
  }
  return headers;
}
