import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { AppError, text } from './network.mjs';
import { id, now } from './store.mjs';

const imageTypes = { jpeg: ['image/jpeg', 'jpg'], png: ['image/png', 'png'], gif: ['image/gif', 'gif'], webp: ['image/webp', 'webp'] };
export class MediaLibrary {
  constructor(store) { this.store = store; this.directory = path.join(store.directory, 'media'); mkdirSync(this.directory, { recursive: true, mode: 0o700 }); }
  public(item) { return { id: item.id, kind: item.kind, mime: item.mime, name: item.name, size: item.size, width: item.width, height: item.height, duration: item.duration, transcript: item.transcript, url: `/api/media/${item.id}/file`, available: existsSync(path.join(this.directory, item.filename)) }; }
  get(value) { const item = this.store.one('media', value); if (!item || !existsSync(path.join(this.directory, item.filename))) throw new AppError('这个附件已不在本机了，请重新发送。', 404, 'MEDIA_MISSING'); return item; }
  file(value) { const item = this.get(value); return { item, data: readFileSync(path.join(this.directory, item.filename)) }; }
  async upload(data, { kind, name = '' } = {}) {
    if (!Buffer.isBuffer(data) || !data.length || data.length > 12 * 1024 * 1024) throw new AppError('附件需小于 12 MB。', 413);
    const existing = this.store.list('media');
    if (existing.reduce((sum, x) => sum + x.size, 0) + data.length > 400 * 1024 * 1024) throw new AppError('附件空间已满，先清理不需要的聊天。', 413);
    let mime, extension, width, height;
    if (kind !== 'audio') {
      let metadata;
      try { metadata = await sharp(data, { limitInputPixels: 24000000, animated: false }).metadata(); } catch { throw new AppError('图片无法读取，支持 JPG、PNG、GIF、WebP。', 415); }
      if (!imageTypes[metadata.format] || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192) throw new AppError('图片格式或尺寸不支持。', 415);
      [mime, extension] = imageTypes[metadata.format]; width = metadata.width; height = metadata.height;
      kind = kind === 'sticker' || metadata.format === 'gif' ? 'sticker' : 'image';
      // Decode a bounded frame so a truncated or disguised upload cannot become an image message.
      try { await sharp(data, { limitInputPixels: 24000000 }).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toBuffer(); } catch { throw new AppError('图片不完整，请换一张。', 415); }
    } else {
      const head = data.toString('ascii', 0, 12);
      if (head.startsWith('OggS')) [mime, extension] = ['audio/ogg', 'ogg'];
      else if (head.startsWith('RIFF') && head.endsWith('WAVE')) [mime, extension] = ['audio/wav', 'wav'];
      else if (data.subarray(0, 4).toString('hex') === '1a45dfa3') [mime, extension] = ['audio/webm', 'webm'];
      else if (head.slice(4, 8) === 'ftyp') [mime, extension] = ['audio/mp4', 'm4a'];
      else if (head.startsWith('ID3') || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) [mime, extension] = ['audio/mpeg', 'mp3'];
      else if (head.startsWith('fLaC')) [mime, extension] = ['audio/flac', 'flac'];
      else throw new AppError('语音格式不支持，请用录音或常见音频文件。', 415);
    }
    // Clean up unattached uploads left by abandoned drafts after one day.
    const referenced = new Set(this.store.list('messages').flatMap(m => m.attachmentIds || []));
    for (const item of existing) if (!referenced.has(item.id) && Date.now() - Date.parse(item.createdAt) > 86400000) this.delete(item.id);
    const mediaId = id(), filename = `${mediaId}.${extension}`;
    writeFileSync(path.join(this.directory, filename), data, { mode: 0o600 });
    const item = { id: mediaId, kind, mime, filename, name: text(name, 120) || (kind === 'audio' ? '语音消息' : kind === 'sticker' ? '表情' : '图片'), size: data.length, width, height, createdAt: now() };
    this.store.put('media', item); return this.public(item);
  }
  async visionPart(mediaId) {
    const { data, item } = this.file(mediaId);
    if (item.kind === 'audio') return null;
    const bytes = await sharp(data, { limitInputPixels: 24000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'auto' } };
  }
  delete(mediaId) { const item = this.store.one('media', mediaId); if (item) rmSync(path.join(this.directory, path.basename(item.filename)), { force: true }); this.store.delete('media', mediaId); }
  clear() { for (const item of this.store.list('media')) this.delete(item.id); }
}
