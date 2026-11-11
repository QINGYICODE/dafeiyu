import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AppError } from './network.mjs';

const releases = fileURLToPath(new URL('../../releases/', import.meta.url));

// Only generated preview artifacts are public; never expose arbitrary files.
export async function sendAndroidDownload(request, response, route, directory = releases) {
  const match = /^\/api\/downloads\/(dafeiyu-flutter-v\d+\.\d+\.\d+-preview\.apk(?:\.sha256)?)$/.exec(route);
  if (!match) return false;
  if (!['GET', 'HEAD'].includes(request.method)) throw new AppError('下载只支持 GET 或 HEAD。', 405);
  const filename = path.join(directory, match[1]);
  const info = await stat(filename).catch(() => null);
  if (!info?.isFile()) throw new AppError('安装包尚未生成，请先运行 Android 构建脚本。', 404);
  const size = info.size;
  let start = 0, end = size - 1;
  const rangeHeader = request.headers.range;
  if (rangeHeader) {
    const range = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    start = range ? Number(range[1]) : NaN;
    end = range?.[2] ? Math.min(Number(range[2]), end) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` });
      response.end();
      return true;
    }
  }
  response.writeHead(rangeHeader ? 206 : 200, {
    'Content-Type': match[1].endsWith('.sha256') ? 'text/plain; charset=utf-8' : 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${match[1]}"`,
    'Content-Length': Math.max(0, end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    ...(rangeHeader ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (request.method === 'HEAD' || !size) response.end();
  else await pipeline(createReadStream(filename, { start, end }), response);
  return true;
}
