'use client';
import { useRef, useState } from 'react';
import { Check, Cloud, FileAudio, LoaderCircle, RefreshCw } from 'lucide-react';
import { useApp } from '@/lib/app-context';
import type { Settings } from '@/lib/companion-types';
import { Toggle } from './interface';

export function CloudSpeechSettings({ value, onChange }: {value: Settings['cloudSpeech']; onChange: (value: Settings['cloudSpeech']) => void}) {
  const {data, action, notify} = useApp();
  const status = data.capabilities.cloudSpeech;
  const [busy, setBusy] = useState(''), [transcript, setTranscript] = useState(''), [recording, setRecording] = useState<File | null>(null), [reference, setReference] = useState<File | null>(null);
  const recordingInput = useRef<HTMLInputElement>(null), referenceInput = useRef<HTMLInputElement>(null);
  const verified = status.connection?.ok && status.connection.current;
  const saved = JSON.stringify(value) === JSON.stringify(data.settings.cloudSpeech);
  const available = status.keyConfigured && status.audioReady;
  const cosy = value.ttsModel === 'cosyvoice-v3-flash';
  const change = <K extends keyof Settings['cloudSpeech']>(key: K, next: Settings['cloudSpeech'][K]) => onChange({...value, [key]: next});
  const test = async () => {
    setBusy('test'); setTranscript('');
    try {
      let mediaId: string | undefined;
      if (recording) {
        if (recording.size > 12 * 1024 * 1024) throw new Error('测试录音需小于 12 MB。');
        const response = await fetch('/api/media', {method:'POST',headers:{'Content-Type':recording.type || 'application/octet-stream','X-Media-Kind':'audio','X-File-Name':encodeURIComponent(recording.name)},body:recording});
        const result = await response.json() as {error?: string; id: string}; if (!response.ok) throw new Error(result.error || '录音上传失败。'); mediaId = result.id;
      }
      const result = await action('/speech/test', 'POST', {mediaId}) as {transcript: string} | null;
      if (result) setTranscript(result.transcript);
    } catch (error) { notify(error instanceof Error ? error.message : '录音测试未完成。'); }
    finally { setBusy(''); }
  };
  const clone = async () => {
    setBusy('clone');
    try {
      let payload: {audio?: string; useReference?: boolean; replace?: boolean} = {useReference:true};
      if (reference) {
        if (reference.size > 4 * 1024 * 1024) throw new Error('参考录音需小于 4 MB。');
        const bytes = new Uint8Array(await reference.arrayBuffer()); let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        payload = {audio:btoa(binary),replace:true};
      }
      await action('/speech/clone', 'POST', payload, '音色已提交，请查看下面的实际状态。');
    } catch (error) { notify(error instanceof Error ? error.message : '音色创建未完成。'); }
    finally { setBusy(''); }
  };
  return <section className="card settings-section cloud-speech-settings">
    <div className="settings-section-heading"><span className="settings-section-icon sky"><Cloud size={20}/></span><div><h2>百炼语音服务</h2><p>听懂你的话，也把想说的话变成声音。</p></div><span className={`connection-badge ${verified ? 'connected' : ''}`}>{verified ? <><Check size={12}/>识别已验证</> : status.keyConfigured ? '密钥已读取' : '等待密钥'}</span></div>
    <div className="environment-note"><Cloud size={16}/><div><strong>{status.keyConfigured ? `已读取环境变量 ${status.keySource}` : '请配置 QWEN_API_KEY 或 DASHSCOPE_API_KEY'}</strong><p>密钥只保留在后端。语音发往百炼处理，对话仍由 DeepSeek 回复。</p></div></div>
    <div className="form-grid"><label className="field">语音服务地域<select value={value.region} onChange={e=>change('region',e.target.value as Settings['cloudSpeech']['region'])}><option value="beijing">华北 2 · 北京</option><option value="singapore">新加坡</option></select></label><label className="field">业务空间 ID（选填）<input value={value.workspaceId} onChange={e=>change('workspaceId',e.target.value)} placeholder={status.workspaceFromEnvironment ? '已从环境变量读取' : '留空使用百炼公共域名'}/><small>地域须与 API Key 一致。</small></label></div>
    <div className="setting-toggle-row"><div><strong>用百炼识别我的语音</strong><p>松手后上传录音，完整识别后再交给大肥鱼。</p></div><Toggle checked={value.asrEnabled} label="使用百炼语音识别" onChange={()=>change('asrEnabled',!value.asrEnabled)}/></div>
    <div className="form-grid"><label className="field">语音识别模型<input value={value.asrModel} onChange={e=>change('asrModel',e.target.value)}/></label><label className="field">识别语言<select value={value.language} onChange={e=>change('language',e.target.value as Settings['cloudSpeech']['language'])}><option value="auto">自动识别 · 支持中英混说</option><option value="zh">普通话</option><option value="yue">粤语</option><option value="en">英语</option></select></label></div>
    <label className="field">常用词提示<textarea rows={2} value={value.hotwords} maxLength={800} onChange={e=>change('hotwords',e.target.value)}/><small>写常用人名、称呼、游戏或专有名词，帮助识别；不保证每次准确。</small></label>
    <div className="cloud-speech-actions"><button type="button" className="button secondary compact" onClick={()=>recordingInput.current?.click()}><FileAudio size={15}/>{recording ? '更换测试录音' : '选择测试录音'}</button><span className="helper-text cloud-file-name">{recording?.name || (status.referenceAvailable ? '默认用已有的可莉录音测试' : '最长两分钟')}</span><button type="button" className="button secondary compact" disabled={Boolean(busy)||!available||!saved||(!recording&&!status.referenceAvailable)} onClick={test}>{busy==='test'?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>}测试真实识别</button><input className="sr-only" ref={recordingInput} type="file" accept="audio/*,.wav,.webm,.mp3,.m4a,.ogg" aria-label="测试识别的录音" onChange={e=>setRecording(e.target.files?.[0] || null)}/></div>
    {transcript&&<div className="cloud-transcript" role="status"><strong>实际识别结果</strong><p>{transcript}</p></div>}
    <div className="setting-toggle-row"><div><strong>用百炼生成大肥鱼的声音</strong><p>回复完整生成后再发送语音气泡，沿用下方的回复方式和语速。</p></div><Toggle checked={value.ttsEnabled} label="使用百炼语音合成" onChange={()=>change('ttsEnabled',!value.ttsEnabled)}/></div>
    <div className="form-grid"><label className="field">云端合成模型<select value={value.ttsModel} onChange={e=>onChange({...value,ttsModel:e.target.value,...(e.target.value==='cosyvoice-v3-flash'?{voiceId:'longhuhu_v3'}:value.voiceId==='longhuhu_v3'?{voiceId:e.target.value.endsWith('plus')?'longanlingxin_v3.1':'qiaoxiaojiao_v3.1'}:{})})}><option value="cosyvoice-v3-flash">CosyVoice v3 Flash · 龙呼呼</option><option value="qwen-audio-3.1-tts-flash">Qwen Audio 3.1 Flash</option><option value="qwen-audio-3.1-tts-plus">Qwen Audio 3.1 Plus</option></select></label><label className="field">云端音色 ID<input list="bailian-voices" value={value.voiceId} onChange={e=>e.target.value==='longhuhu_v3'?onChange({...value,ttsModel:'cosyvoice-v3-flash',voiceId:e.target.value}):change('voiceId',e.target.value)}/><datalist id="bailian-voices"><option value="longhuhu_v3">龙呼呼 · 天真烂漫女童（CosyVoice v3）</option><option value="qiaoxiaojiao_v3.1">乔小娇 · 俏丽可爱（Flash）</option><option value="longanlingxin_v3.1">龙安灵心 · 温柔</option><option value="longanhuan_v3.1">龙安欢 · 活泼</option><option value="longanfengyue_v3.1">龙安风悦</option>{status.clone?.status==='OK'&&status.clone.compatible&&<option value={status.clone.voiceId}>我的复刻音色</option>}</datalist><small>{cosy?'系统音色，无需参考录音或声音复刻。龙呼呼音色 ID：longhuhu_v3。':'系统音色或复刻音色，须与合成模型相匹配。'}</small></label></div>
    {!cosy&&<><div className="cloud-speech-actions"><button type="button" className="button secondary compact" disabled={Boolean(busy)||!available||!saved} onClick={async()=>{setBusy('connect');try{await action('/speech/clone/check','POST',{voiceId:value.voiceId});}finally{setBusy('');}}}>{busy==='connect'?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>}连接已有复刻音色</button><span className="helper-text">仅用于你在百炼已创建的音色 ID。</span></div>
    <details className="cloud-clone"><summary>参考录音与声音复刻</summary><p className="helper-text">可用已有的「中文语音可莉.wav」，也可选择 10 至 30 秒、4 MB 以内的清晰单人录音。点击创建会将参考录音上传百炼并按厂商规则计费，结果以平台返回为准。</p><div className="cloud-speech-actions"><button type="button" className="button secondary compact" onClick={()=>referenceInput.current?.click()}><FileAudio size={15}/>{reference?'更换参考录音':'选择参考录音'}</button><span className="helper-text cloud-file-name">{reference?.name || (status.referenceAvailable ? '已找到可莉参考录音' : '尚未选择录音')}</span><button type="button" className="button secondary compact" disabled={Boolean(busy)||!available||!saved||(!reference&&!status.referenceAvailable)} onClick={clone}>{busy==='clone'?<LoaderCircle className="spin" size={15}/>:<Cloud size={15}/>}创建云端音色</button><input className="sr-only" ref={referenceInput} type="file" accept="audio/*,.wav,.mp3,.m4a" aria-label="声音复刻参考录音" onChange={e=>setReference(e.target.files?.[0]||null)}/></div>
    {status.clone&&<div className="cloud-clone-status"><strong>{status.clone.status==='OK'?'音色已就绪':status.clone.status==='DEPLOYING'?'音色正在准备':status.clone.status==='UNDEPLOYED'?'音色未通过或已停用':'音色状态待确认'}</strong><p>{status.clone.voiceId}</p><p className="helper-text">{status.clone.compatible?'与当前模型和账号匹配。':'模型、账号或地域已变化，请切回创建时的配置。'}</p><div className="cloud-speech-actions"><button type="button" className="button secondary compact" disabled={Boolean(busy)||!available||!saved} onClick={async()=>{setBusy('check');try{await action('/speech/clone/check','POST',{});}finally{setBusy('');}}}>{busy==='check'?<LoaderCircle className="spin" size={15}/>:<RefreshCw size={15}/>}更新音色状态</button><button type="button" className="button secondary compact" disabled={status.clone.status!=='OK'||!status.clone.compatible} onClick={()=>{onChange({...value,voiceId:status.clone!.voiceId,ttsEnabled:true});notify('已选中复刻音色，请保存连接与偏好后试听。');}}>使用这个音色</button></div></div>}</details></>}
    <p className="helper-text">{!saved?'有未保存的语音配置，请先保存连接与偏好，再测试或创建音色。':value.ttsEnabled?'云端发声已选中，可以在「大肥鱼的声音」试听。':'当前保留本地发声，开启云端合成并保存后生效。'}</p>
  </section>;
}
