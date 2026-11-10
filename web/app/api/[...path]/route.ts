import { sameApplicationOrigin, serviceHeaders } from '@/lib/proxy-policy.mjs';

export const dynamic = 'force-dynamic';

async function proxy(request: Request) {
  const url = new URL(request.url);
  if (!sameApplicationOrigin(request)) return Response.json({ error: '请求来源与当前访问地址不一致，请从应用页面访问。', code: 'ORIGIN_MISMATCH' }, { status: 403 });
  const headers = serviceHeaders(request);
  try {
    const upstream = await fetch(`http://127.0.0.1:3101${url.pathname}${url.search}`, {
      method: request.method, headers,
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: await request.arrayBuffer() } : {}),
      signal: AbortSignal.timeout(110000),
    });
    const responseHeaders = new Headers({ 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
    for (const key of ['content-disposition', 'content-range', 'accept-ranges', 'content-length']) { const value = upstream.headers.get(key); if (value) responseHeaders.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: '本机伙伴服务尚未连接，请使用 npm run dev 同时启动界面与服务。', code: 'SERVICE_OFFLINE' }, { status: 503 });
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
