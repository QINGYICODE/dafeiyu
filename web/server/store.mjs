import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import path from 'node:path';
import { voiceDefaults } from './voice.mjs';
import { cloudSpeechDefaults } from './cloud-speech.mjs';

export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export const initialPersonality = () => ({
  summary: '温柔，好奇，有一点俏皮。喜欢听日常的小事，也有自己的想法。',
  traits: { warmth: 0.76, curiosity: 0.82, playfulness: 0.58, thoughtfulness: 0.72, independence: 0.65 },
  mood: '平静', moodReason: '刚刚来到这座小岛，想慢慢认识你。',
  interests: ['海洋与自然', '日常里的小发现'], preferredName: null,
  experienceCount: 0, growthVersion: 1, contextAfter: 0, createdAt: now(),
});
export const defaultSettings = () => ({
  model: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', name: 'deepseek-flash', visionName: 'deepseek-flash', visionEnabled: true, jsonMode: true },
  autonomy: { enabled: false, intervalMinutes: 120, maxRunsPerDay: 6, maxItemsPerRun: 2, quietStart: '23:00', quietEnd: '08:00' },
  platforms: { bilibili: { enabled: true }, douyin: { enabled: false }, xiaohongshu: { enabled: false }, weibo: { enabled: false }, gengbaike: { enabled: true }, gengwiki: { enabled: true }, fabiaoqing: { enabled: true } },
  discovery: { onUnfamiliar: true, learnMemes: true },
  stickers: { collect: true, send: true, limit: 120, maxMb: 80, cooldown: 6 },
  voice: voiceDefaults(),
  cloudSpeech: cloudSpeechDefaults(),
});

export class Store {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    mkdirSync(path.join(directory, 'stickers'), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(directory, 'qing.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(collection,id));
      PRAGMA user_version=3;`);
    const keyFile = path.join(directory, 'vault.key');
    if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
    this.vaultKey = readFileSync(keyFile);
    if (!this.get('settings')) this.set('settings', defaultSettings());
    const settings = this.get('settings'), defaults = defaultSettings();
    this.set('settings', { ...settings, platforms: { ...defaults.platforms, ...settings.platforms }, discovery: { ...defaults.discovery, ...settings.discovery }, voice: { ...defaults.voice, ...settings.voice }, cloudSpeech: { ...defaults.cloudSpeech, ...settings.cloudSpeech } });
    this.db.exec('PRAGMA user_version=4;');
    if (!this.get('personality')) this.set('personality', initialPersonality());
    if (!this.get('activeConversation')) this.newConversation();
    this.transaction(() => {
      for (const message of this.list('messages').filter(x => x.status === 'waiting')) this.put('messages', { ...message, status: 'interrupted', content: '', error: '上次回复已中断，可以重新发送。' });
      for (const job of this.list('jobs').filter(x => ['waiting', 'running'].includes(x.status))) this.put('jobs', { ...job, status: 'interrupted', completedAt: now(), error: '服务重启，任务已中断。' });
    });
  }
  get(key) { const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES (?,?)').run(key, JSON.stringify(value)); }
  list(collection) { return this.db.prepare('SELECT value FROM documents WHERE collection=? ORDER BY rowid').all(collection).map(x => JSON.parse(x.value)); }
  one(collection, documentId) { const row = this.db.prepare('SELECT value FROM documents WHERE collection=? AND id=?').get(collection, documentId); return row ? JSON.parse(row.value) : null; }
  put(collection, value) { this.db.prepare('INSERT INTO documents(collection,id,value) VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET value=excluded.value').run(collection, value.id, JSON.stringify(value)); return value; }
  delete(collection, documentId) { this.db.prepare('DELETE FROM documents WHERE collection=? AND id=?').run(collection, documentId); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  newConversation() { const conversation = { id: id(), title: '新的聊天', createdAt: now(), updatedAt: now() }; this.put('conversations', conversation); this.set('activeConversation', conversation.id); return conversation; }
  encrypt(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.vaultKey, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'); }
  decrypt(value) { if (!value) return ''; const data = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', this.vaultKey, data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'); }
  getKey() { const base = this.get('settings')?.model?.baseUrl || ''; let official = false; try { official = new URL(base).hostname === 'api.deepseek.com'; } catch {} return (official && process.env.DEEPSEEK_KEY) || this.decrypt(this.get('modelKey')); }
  setKey(value) { this.set('modelKey', value ? this.encrypt(value) : null); }
  close() { this.db.close(); }
}
