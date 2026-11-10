'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import type { Attachment } from '@/lib/companion-types';

export function VoiceMessage({ item, text, autoplay = false }: { item: Attachment; text: string; autoplay?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null), attempted = useRef(false);
  const [playing, setPlaying] = useState(false), [duration, setDuration] = useState(item.duration || 0), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const play = async () => {
    const player = audio.current; if (!player) return;
    if (!player.paused) { player.pause(); return; }
    if (player.ended) player.currentTime = 0;
    try { setError(''); await player.play(); } catch { setPlaying(false); setError('点一下，再听听'); }
  };
  useEffect(() => { if (autoplay && !attempted.current) { attempted.current = true; void play(); } }, [autoplay]);
  useEffect(() => { const player=audio.current; return () => { player?.pause(); }; }, []);
  return <div className="assistant-voice">
    <audio ref={audio} src={item.url} preload="metadata" aria-label="大肥鱼的语音消息" onLoadedMetadata={event=>{const value=event.currentTarget.duration;if(Number.isFinite(value))setDuration(value);}} onPlay={event=>{document.querySelectorAll('audio').forEach(other=>{if(other!==event.currentTarget)other.pause();});setPlaying(true);}} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setProgress(0);}} onTimeUpdate={event=>{const player=event.currentTarget;setProgress(player.duration?player.currentTime/player.duration:0);}} onError={()=>{setError('这段声音暂时播不了，可以看文字');setPlaying(false);}}/>
    <button type="button" className={`voice-message-button ${playing?'is-playing':''}`} aria-label={playing?'暂停大肥鱼的语音':'播放大肥鱼的语音'} onClick={()=>void play()}>{playing?<Pause size={17}/>:<Play size={17}/>}<span className="voice-message-wave" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></span><span>{Math.max(1,Math.ceil(duration))}″</span><Volume2 size={15}/><span className="voice-message-progress" style={{width:`${progress*100}%`}}/></button>
    {error&&<p className="voice-playback-note" role="status">{error}</p>}
    <details className="voice-transcript"><summary>查看文字</summary><p>{text}</p></details>
  </div>;
}
