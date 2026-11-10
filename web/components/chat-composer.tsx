'use client';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { ArrowUp, Image as ImageIcon, Keyboard, LoaderCircle, Mic, Smile, Square, X } from 'lucide-react';
import { type Attachment, type Sticker } from '@/lib/companion-types';
import { type useChatMedia } from '@/lib/use-chat-media';
import { StickerInput } from './chat-media';

type Props = {
  draft: string; setDraft: (value: string) => void; media: ReturnType<typeof useChatMedia>; stickers: Sticker[];
  running: boolean; submitting: boolean; connected: boolean;
  onSubmit: (event?: FormEvent) => Promise<void>; onCancel: () => void; onVoice: (item: Attachment) => Promise<void>;
};
export function ChatComposer({ draft, setDraft, media, stickers, running, submitting, connected, onSubmit, onCancel, onVoice }: Props) {
  const [mode, setMode] = useState<'text' | 'emoji' | 'voice'>('text'), [cancelVoice, setCancelVoice] = useState(false);
  const textInput = useRef<HTMLTextAreaElement>(null), imageInput = useRef<HTMLInputElement>(null), stickerInput = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ id: number; y: number } | null>(null), cancelled = useRef(false), keyHeld = useRef(false);
  const locked = running || submitting || media.uploading > 0 || !connected;
  useEffect(() => { const input = textInput.current; if (input) { input.style.height = '0px'; input.style.height = `${Math.min(112, Math.max(40, input.scrollHeight))}px`; } }, [draft, mode]);
  const switchMode = (next: typeof mode) => {
    media.stopRecording(true); pointer.current = null; keyHeld.current = false;
    setCancelVoice(false); setMode(next);
    if (next === 'text') requestAnimationFrame(() => textInput.current?.focus()); else textInput.current?.blur();
  };
  const start = () => { cancelled.current = false; setCancelVoice(false); void media.startRecording(onVoice); };
  const finish = (cancel = false) => { pointer.current = null; keyHeld.current = false; media.stopRecording(cancel || cancelled.current); setCancelVoice(false); };
  const press = (event: PointerEvent<HTMLButtonElement>) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, y: event.clientY }; start();
  };
  return <div className={`composer-area qq-composer-area ${mode==='emoji'?'has-sticker-input':''}`}>
    <form className="composer qq-composer" onSubmit={onSubmit} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void media.attachFiles(Array.from(event.dataTransfer.files).filter(file=>file.type.startsWith('image/')));}}>
      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden aria-label="选择图片附件" onChange={event=>{if(event.target.files)void media.attachFiles(event.target.files);event.target.value='';}}/>
      <input ref={stickerInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden aria-label="选择表情附件" onChange={event=>{if(event.target.files)void media.attachFiles(event.target.files,'sticker');event.target.value='';}}/>
      {media.attachments.length>0&&<div className="pending-attachments" aria-label="待发送附件">{media.attachments.map(item=><div className={`pending-attachment ${item.kind==='audio'?'pending-audio':''}`} key={item.id}>{item.kind==='audio'?<audio controls preload="metadata" src={item.url} aria-label="试听待发送语音"/>:<img src={item.url} alt={item.kind==='sticker'?'待发送表情':'待发送图片'}/>}<button type="button" aria-label={`移除附件：${item.name}`} onClick={()=>media.remove(item.id)}><X size={14}/></button></div>)}</div>}
      {media.uploading>0&&<div className="upload-status" role="status"><LoaderCircle size={14} className="spin"/>正在发送前准备……</div>}
      {(media.recording||media.micPending)&&<div className={`voice-feedback ${cancelVoice?'is-cancelling':''}`} role="status"><span className="voice-bars" aria-hidden="true"><i/><i/><i/><i/><i/></span><strong>{media.micPending?'正在等待麦克风授权':`${Math.floor(media.seconds/60)}:${String(media.seconds%60).padStart(2,'0')}`}</strong><span>{cancelVoice?'松开取消这段语音':'松开发送，上滑取消'}</span></div>}
      <div className="qq-input-row">
        <button type="button" className="icon-button composer-mode-button" aria-label={mode==='voice'?'切换文字输入':'切换语音输入'} aria-pressed={mode==='voice'} disabled={media.recording} onPointerDown={event=>event.preventDefault()} onClick={()=>switchMode(mode==='voice'?'text':'voice')}>{mode==='voice'?<Keyboard size={22}/>:<Mic size={22}/>}</button>
        {mode==='voice'?<button type="button" className={`hold-to-talk ${media.recording?'is-recording':''} ${cancelVoice?'is-cancelling':''}`} disabled={locked} aria-label="按住说话" onContextMenu={event=>event.preventDefault()} onPointerDown={press} onPointerMove={event=>{if(pointer.current?.id===event.pointerId){cancelled.current=pointer.current.y-event.clientY>65;setCancelVoice(cancelled.current);}}} onPointerUp={event=>{if(pointer.current?.id===event.pointerId)finish();}} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>{if(pointer.current)finish(true);}} onKeyDown={event=>{if((event.key===' '||event.key==='Enter')&&!event.repeat&&!keyHeld.current){event.preventDefault();keyHeld.current=true;start();}}} onKeyUp={event=>{if((event.key===' '||event.key==='Enter')&&keyHeld.current){event.preventDefault();finish();}}} onBlur={()=>{if(keyHeld.current)finish(true);}}>{media.micPending?'等待麦克风…':media.recording?(cancelVoice?'松开取消':'松开发送'):'按住说话'}</button>:<><label className="sr-only" htmlFor="message-draft">想对大肥鱼说什么</label><textarea ref={textInput} id="message-draft" rows={1} value={draft} onFocus={()=>{if(mode==='emoji')setMode('text');}} onChange={event=>setDraft(event.target.value)} onPaste={event=>{const files=Array.from(event.clipboardData.files).filter(file=>file.type.startsWith('image/'));if(files.length){event.preventDefault();void media.attachFiles(files);const caption=event.clipboardData.getData('text/plain');if(caption)setDraft(draft+caption);}}} placeholder="发消息…" onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&window.matchMedia('(min-width: 721px)').matches){event.preventDefault();void onSubmit();}}}/></>}
        <button type="button" className={`icon-button ${mode==='emoji'?'selected':''}`} aria-label={mode==='emoji'?'切换文字输入':'选择表情'} aria-expanded={mode==='emoji'} aria-controls="sticker-input" disabled={media.recording||media.micPending} onPointerDown={event=>event.preventDefault()} onClick={()=>switchMode(mode==='emoji'?'text':'emoji')}>{mode==='emoji'?<Keyboard size={22}/>:<Smile size={22}/>}</button>
        <button type="button" className="icon-button" aria-label="发送图片" title="也支持粘贴图片" disabled={media.recording||media.micPending} onClick={()=>imageInput.current?.click()}><ImageIcon size={22}/></button>
        {running?<button type="button" className="send-button cancel" aria-label="取消正在生成的回复" onClick={onCancel}><Square size={15}/></button>:mode!=='voice'&&<button type="submit" className="send-button" aria-label="发送消息" disabled={(!draft.trim()&&!media.attachments.length)||locked}>{submitting?<LoaderCircle size={18} className="spin"/>:<ArrowUp size={20}/>}</button>}
      </div>
    </form>
    {mode==='emoji'&&<StickerInput stickers={stickers} disabled={media.uploading>0} onEmoji={value=>setDraft(draft+value)} onSelect={value=>void media.attachSticker(value)} onUpload={()=>stickerInput.current?.click()}/>}
    <p className="composer-footnote">{mode==='voice'?'按住说话，松开发送，上滑取消':'视频链接、好听的歌名，直接发给我就好。'}</p>
  </div>;
}
