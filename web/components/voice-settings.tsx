'use client';
import { useState } from 'react';
import { LoaderCircle, Volume2 } from 'lucide-react';
import { useApp } from '@/lib/app-context';
import { type Settings, type Attachment } from '@/lib/companion-types';
import { Toggle } from './interface';

export function VoiceSettings({ value, onChange, cloudEnabled, cloudSaved }: { cloudSaved: boolean; cloudEnabled: boolean; value: Settings['voice']; onChange: (value: Settings['voice']) => void }) {
  const { data, action } = useApp(); const [loading,setLoading]=useState(false),[preview,setPreview]=useState<Attachment|null>(null);
  const capability=data.capabilities.voice;
  return <section className="card settings-section"><div className="settings-section-heading"><span className="settings-section-icon lavender"><Volume2 size={20}/></span><div><h2>大肥鱼的声音</h2><p>有时候打字，有时候想亲口跟你说。</p></div><Toggle checked={value.enabled} label="开启大肥鱼语音回复" onChange={()=>onChange({...value,enabled:!value.enabled})}/></div>
    <div className="form-grid"><label className="field">回复方式<select value={value.mode} onChange={event=>onChange({...value,mode:event.target.value as Settings['voice']['mode']})}><option value="auto">由大肥鱼自己决定</option><option value="voice">短消息尽量用语音</option></select></label><label className="field">本地声音<select disabled={cloudEnabled} value={value.speaker} onChange={event=>onChange({...value,speaker:event.target.value})}>{capability.voices.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field">语速调整<input type="number" min={-20} max={20} value={value.rate} onChange={event=>onChange({...value,rate:Number(event.target.value)})}/><small>百分比，负数更舒缓</small></label></div>
    <div className="setting-toggle-row"><div><strong>收到新语音时自动播放</strong><p>默认关闭，点语音气泡就能听；切换聊天不会重播旧消息。</p></div><Toggle checked={value.autoplay} label="自动播放新语音" onChange={()=>onChange({...value,autoplay:!value.autoplay})}/></div>
    <div className="section-bottom"><p className="helper-text">{cloudEnabled?'使用百炼云端音色，仅发送这条回复文字。请先保存配置再试听。':!capability.available?'语音合成尚未就绪，文字聊天可以正常使用。':value.speaker==='klee'?'使用你提供的参考音频在本机合成；首次准备会稍久，闲置后会释放模型占用。':'语音合成需联网，仅向语音服务发送要说的回复文字，不发送聊天上下文或密钥。'}</p><button type="button" className="button secondary compact" disabled={loading||!capability.available||!data.settings.voice.enabled||!cloudSaved} onClick={async()=>{setLoading(true);try{const result=await action('/voice/preview','POST',{speaker:value.speaker,rate:value.rate});if(result)setPreview(result as Attachment);}finally{setLoading(false);}}}>{loading?<LoaderCircle className="spin" size={15}/>:<Volume2 size={15}/>}听听这个声音</button></div>
    {preview&&<audio className="voice-preview" controls autoPlay src={preview.url} aria-label="试听大肥鱼的声音"/>}
  </section>;
}
