export type Page = 'home' | 'chat' | 'life' | 'memories' | 'stickers' | 'settings';
export type Platform = 'bilibili' | 'douyin' | 'xiaohongshu' | 'weibo' | 'gengbaike' | 'gengwiki' | 'fabiaoqing';
export type Settings = {
  model: { provider: string; baseUrl: string; name: string; visionName: string; visionEnabled: boolean; jsonMode: boolean; keyConfigured?: boolean; keySource?: string | null };
  autonomy: { enabled: boolean; intervalMinutes: number; maxRunsPerDay: number; maxItemsPerRun: number; quietStart: string; quietEnd: string };
  platforms: Record<Platform, { enabled: boolean }>;
  stickers: { collect: boolean; send: boolean; limit: number; maxMb: number; cooldown: number };
  discovery: { onUnfamiliar: boolean; learnMemes: boolean };
  voice: { enabled: boolean; mode: 'auto' | 'voice'; speaker: string; rate: number; autoplay: boolean };
  cloudSpeech: { region: 'beijing' | 'singapore'; workspaceId: string; asrEnabled: boolean; ttsEnabled: boolean; asrModel: string; ttsModel: string; voiceId: string; hotwords: string; language: 'auto' | 'zh' | 'yue' | 'en' };
};
export type Attachment = { id: string; kind: 'image' | 'sticker' | 'audio'; mime: string; name: string; url: string; available: boolean; size: number; width?: number; height?: number; duration?: number; transcript?: string };
export type Message = { id: string; role: 'user' | 'assistant'; content: string; status: string; conversationId: string; sequence: number; createdAt: string; stickerId?: string | null; error?: string; memoryNote?: string; voiceNote?: string; replyMode?: 'text' | 'voice'; attachments?: Attachment[]; transcript?: string; mediaDescription?: string; missingAttachments?: number };
export type Memory = { id: string; content: string; category: string; confidence: number; importance: number; createdAt: string; updatedAt: string; sourceId: string; sourceKind: string };
export type Experience = { id: string; kind: string; title: string; reflection: string | null; platform?: Platform; url?: string; sourceUrl?: string; description?: string; excerpt?: string; contentBasis?: string; createdAt: string; purpose?: string; query?: string; lookupStatus?: string; sessionUsed?: boolean };
export type Job = { id: string; kind: string; status: string; createdAt: string; completedAt?: string; conversationId?: string; messageId?: string; error?: string; stage?: string; topic?: string; platform?: Platform; collectionNote?: string; collected?: number; failed?: number };
export type Sticker = { id: string; meaning: string; tags: string[]; avoid: string[]; imageUrl: string; available: boolean; platform: Platform; sourceUrl: string; sourceTitle: string; createdAt: string; sentCount: number; size: number };
export type Personality = { summary: string; mood: string; moodReason: string; interests: string[]; preferredName: string | null; traits: Record<string, number>; experienceCount: number; growthVersion: number; createdAt: string };
export type BilibiliAccountState = {
  status: 'disconnected' | 'connected' | 'needs_login'; connected: boolean;
  profile: { uid: string; name: string; avatarUrl: string } | null;
  checkedAt: string | null; message: string; platformEnabled: boolean;
  preferences: { useForBrowsing: boolean; useFollowingFeed: boolean };
  capabilities: { browsing: boolean; followingFeed: boolean; publishing: boolean; comments: boolean; privateMessages: boolean };
};
export type BilibiliLogin = { id: string; status: 'waiting' | 'scanned' | 'expired' | 'connected'; expiresAt: string; qrImage: string };
export type BilibiliFeed = { items: { id: string; url: string; title: string; description: string; author: string }[]; fetchedAt: string; source: string };
export type CompanionState = {
  settings: Settings; personality: Personality; connection: { ok: boolean; at: string } | null;
  activeConversation: string; conversations: { id: string; title: string; createdAt: string; updatedAt: string }[];
  messages: Message[]; memories: Memory[]; experiences: Experience[]; stickers: Sticker[];
  growth: { id: string; version: number; traits: Record<string, number>; reason: string; createdAt: string }[];
  jobs: Job[]; platforms: Partial<Record<Platform, { ok: boolean; message: string; checkedAt: string }>>;
  capabilities: { speech: { available: boolean; engine: string; maxSeconds: number }; voice: { available: boolean; engine: string; maxCharacters: number; voices: {id: string; name: string}[] }; cloudSpeech: {keyConfigured: boolean; keySource: string | null; audioReady: boolean; workspaceFromEnvironment: boolean; referenceAvailable: boolean; connection: {ok: boolean; current: boolean; at: string; model?: string} | null; clone: {voiceId: string; model: string; status: string; createdAt: string; compatible: boolean} | null}; maxAttachmentMb: number; maxAttachments: number };
  accounts: { bilibili: BilibiliAccountState };
  stats: { messages: number; readings: number; memories: number; tokens: number; usageCalls: number; unknownUsage: boolean };
};
export async function api<T = unknown>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${endpoint}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(value.error || '这次操作没有完成，请再试一次。'); return value as T;
}
export const platformNames: Record<Platform, string> = { bilibili: 'B 站', douyin: '抖音', xiaohongshu: '小红书', weibo: '微博', gengbaike: '梗百科', gengwiki: '梗百科 · geng.page', fabiaoqing: '发表情' };
export const memoryNames: Record<string, string> = { preference: '你的偏好', event: '重要的事', agreement: '我们约好的', identity: '关于你', experience: '大肥鱼的见闻' };
export function when(value: string, full = false) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return '刚刚'; return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', ...(full ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date); }
