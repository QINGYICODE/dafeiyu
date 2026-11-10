'use client';
import { useState } from 'react';
import { Image as ImageIcon, Music2, Search, Upload, Smile } from 'lucide-react';
import { Modal } from './interface';
import { type Attachment, type Sticker } from '@/lib/companion-types';

export function MessageMedia({ attachments, onOpen, onLoad }: { attachments: Attachment[]; onOpen: (item: Attachment) => void; onLoad: () => void }) {
  return <div className={`message-attachments ${attachments.length > 1 ? 'multiple' : ''}`}>{attachments.map(item => !item.available ? <p className="attachment-unavailable" key={item.id}>这个附件已不在本机了。</p> : item.kind === 'audio' ? <div className="audio-message" key={item.id}><div><Music2 size={16}/><span>语音{item.duration ? ` · ${Math.ceil(item.duration)} 秒` : ''}</span></div><audio controls preload="metadata" src={item.url} aria-label="播放语音消息"/>{item.transcript && <details><summary>转文字</summary><p>{item.transcript}</p></details>}</div> : <button className={`message-picture ${item.kind === 'sticker' ? 'is-sticker' : ''}`} key={item.id} aria-label={item.kind === 'sticker' ? '查看表情原图' : '查看图片原图'} onClick={() => onOpen(item)}><img src={item.url} alt={item.kind === 'sticker' ? '发来的表情' : item.name || '发来的图片'} onLoad={onLoad}/></button>)}</div>;
}

export function MediaPreview({ item, onClose }: { item: Attachment; onClose: () => void }) {
  return <Modal title={item.kind === 'sticker' ? '这张表情' : '这张图片'} onClose={onClose}><img className="media-preview-image" src={item.url} alt={item.name}/><a className="button secondary full" href={item.url} target="_blank" rel="noopener noreferrer">打开原图</a></Modal>;
}

const emoji = ['😂','🥹','😭','🥲','😅','🤔','😶','🙃','😎','😤','🫠','🥰','😴','🤯','👀','✨','🫶','👍','🫡','🤝','🐱','🐟','🌊','❤️'];
export function StickerInput({ stickers, onSelect, onEmoji, onUpload, disabled = false }: { stickers: Sticker[]; onSelect: (id: string) => void; onEmoji: (value: string) => void; onUpload: () => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'emoji' | 'stickers'>('emoji');
  const items = stickers.filter(item => item.available && `${item.meaning}${item.tags.join(' ')}`.includes(query));
  return <section className="composer-panel" id="sticker-input" aria-label="表情输入"><div className="sticker-panel-tabs" role="tablist" aria-label="表情分类"><button type="button" role="tab" id="emoji-tab" aria-controls="emoji-content" aria-selected={tab==='emoji'} onClick={()=>setTab('emoji')}><Smile size={17}/>表情</button><button type="button" role="tab" id="stickers-tab" aria-controls="stickers-content" aria-selected={tab==='stickers'} onClick={()=>setTab('stickers')}><ImageIcon size={17}/>收藏</button><button type="button" className="text-button" disabled={disabled} onClick={onUpload}><Upload size={15}/>上传表情</button></div><div className="sticker-panel-scroll" role="tabpanel" id={tab==='emoji'?'emoji-content':'stickers-content'} aria-labelledby={tab==='emoji'?'emoji-tab':'stickers-tab'}>{tab==='emoji'?<div className="emoji-grid">{emoji.map(value=><button type="button" key={value} disabled={disabled} aria-label={`插入表情 ${value}`} onPointerDown={event=>event.preventDefault()} onClick={()=>onEmoji(value)}>{value}</button>)}</div>:<><label className="search-field picker-search"><Search size={16}/><input type="search" aria-label="搜索可发送的表情" placeholder="找个能接上话的表情" value={query} onChange={event=>setQuery(event.target.value)}/></label>{items.length?<div className="sticker-picker-grid">{items.map(item=><button type="button" key={item.id} disabled={disabled} onClick={()=>onSelect(item.id)} aria-label={`选择表情：${item.meaning}`}><img src={item.imageUrl} alt={item.meaning} loading="lazy"/><span>{item.meaning}</span></button>)}</div>:<div className="picker-empty"><ImageIcon size={26}/><p>{query?'没有找到，换个词试试。':'还没攒到合适的小表情，可以上传你自己的图片或 GIF。'}</p></div>}</>}</div></section>;
}
