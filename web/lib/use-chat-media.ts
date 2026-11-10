'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type Attachment } from './companion-types';

type RecordingSession = { cancelled: boolean; released: boolean; startedAt: number; onRecorded?: (item: Attachment) => Promise<void> };
export function useChatMedia(notify: (message: string) => void) {
  const [attachments, setAttachments] = useState<Attachment[]>([]), [uploading, setUploading] = useState(0);
  const [recording, setRecording] = useState(false), [micPending, setMicPending] = useState(false), [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), session = useRef<RecordingSession | null>(null);
  const mounted = useRef(true), reserved = useRef(0), current = useRef<Attachment[]>([]);
  current.current = attachments;
  const stopRecording = (cancel = false) => {
    const active = session.current;
    if (!active || active.released) { if (active && cancel) active.cancelled = true; return; }
    active.released = true;
    active.cancelled = cancel || !active.startedAt || Date.now() - active.startedAt < 650;
    if (!cancel && active.startedAt && active.cancelled) notify('说话时间太短了，再按住说一遍吧。');
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    if (mounted.current) setRecording(false);
  };
  useEffect(() => {
    mounted.current = true;
    const cancel = () => stopRecording(true);
    const hide = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hide);
    return () => { mounted.current = false; cancel(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hide); };
  }, []);
  const add = (item: Attachment) => { if (mounted.current) { current.current = [...current.current, item].slice(0, 4); setAttachments(current.current); } };
  const upload = async (file: File, kind: 'image' | 'sticker' | 'audio') => {
    reserved.current++; if (mounted.current) setUploading(value => value + 1);
    try {
      const response = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Media-Kind': kind, 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const value = await response.json() as Attachment & { error?: string };
      if (!response.ok) throw new Error(value.error || '附件没有上传成功。');
      return value;
    } catch (error) { if (mounted.current) notify((error as Error).message); return null; }
    finally { reserved.current--; if (mounted.current) setUploading(value => value - 1); }
  };
  const attachFiles = async (files: FileList | File[], preferredKind?: 'image' | 'sticker' | 'audio') => {
    for (const file of Array.from(files)) {
      if (current.current.length + reserved.current >= 4) { notify('每条消息最多放 4 个附件。'); break; }
      const kind = preferredKind || (file.type.startsWith('audio/') ? 'audio' : file.type === 'image/gif' ? 'sticker' : 'image');
      if (kind === 'audio' && current.current.some(item => item.kind === 'audio')) { notify('一条消息先放一段语音就好。'); continue; }
      if (file.size > 12 * 1024 * 1024) { notify('附件需小于 12 MB。'); continue; }
      const item = await upload(file, kind); if (item) add(item);
    }
  };
  const attachSticker = async (stickerId: string) => {
    if (current.current.length + reserved.current >= 4) return notify('每条消息最多放 4 个附件。');
    reserved.current++; setUploading(value => value + 1);
    try { add(await api<Attachment>('/media/from-sticker', 'POST', { stickerId })); }
    catch (error) { if (mounted.current) notify((error as Error).message); }
    finally { reserved.current--; if (mounted.current) setUploading(value => value - 1); }
  };
  useEffect(() => { if (!recording) return; const timer = setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer); }, [recording]);
  useEffect(() => { if (recording && seconds >= 120) stopRecording(); }, [recording, seconds]);
  const startRecording = async (onRecorded?: (item: Attachment) => Promise<void>) => {
    if (session.current && !session.current.released) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return notify('当前浏览器不能录音，请使用支持麦克风的浏览器，并通过 HTTPS 或 localhost 访问。');
    if (current.current.length || reserved.current) return notify('先发送或移除待发送附件，再按住说话吧。');
    const active: RecordingSession = { cancelled: false, released: false, startedAt: 0, onRecorded }; session.current = active;
    setMicPending(true);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!mounted.current || active.cancelled || active.released || session.current !== active) { mic.getTracks().forEach(track => track.stop()); return; }
      stream.current = mic;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(mic, mimeType ? { mimeType } : undefined); recorder.current = instance;
      const chunks: BlobPart[] = []; let size = 0;
      instance.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > 11 * 1024 * 1024 && instance.state === 'recording') stopRecording(); } };
      instance.onstop = async () => {
        mic.getTracks().forEach(track => track.stop()); if (mounted.current) setRecording(false);
        if (active.cancelled || !mounted.current || !size || session.current !== active) return;
        const type = instance.mimeType || 'audio/webm', extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const item = await upload(new File(chunks, `语音.${extension}`, { type }), 'audio');
        if (!item || active.cancelled || !mounted.current || session.current !== active) return;
        if (active.onRecorded) await active.onRecorded(item); else add(item);
      };
      instance.onerror = () => { active.cancelled = true; active.released = true; mic.getTracks().forEach(track => track.stop()); if (mounted.current) { setRecording(false); notify('录音中断了，可以重新按住说一段。'); } };
      instance.start(250); active.startedAt = Date.now(); setSeconds(0); setRecording(true);
    } catch { active.cancelled = true; active.released = true; stream.current?.getTracks().forEach(track => track.stop()); if (mounted.current) notify('没有获得麦克风权限，请在浏览器设置中允许录音后再试。'); }
    finally { if (mounted.current && session.current === active) setMicPending(false); }
  };
  return { attachments, uploading, recording, micPending, seconds, attachFiles, attachSticker, startRecording, stopRecording,
    restore: (items: Attachment[]) => { current.current = items.filter(item => item.available).slice(0, 4); setAttachments(current.current); },
    remove: (id: string) => { current.current = current.current.filter(item => item.id !== id); setAttachments(current.current); },
    clear: () => { current.current = []; setAttachments([]); } };
}
