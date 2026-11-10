'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BookOpen, Check, ChevronRight, Clock3, Compass, ExternalLink, Heart, Home, Image as ImageIcon, Leaf, Link2, LoaderCircle, Menu, MessageCircle, RefreshCw, Settings2, ShieldCheck, Waves, X, CircleHelp } from 'lucide-react';
import { Character } from '@/components/character';
import { PlatformLogo } from '@/components/platform-logo';
import { Modal } from '@/components/interface';
import { HomePage } from '@/components/pages/home';
import { ChatPage } from '@/components/pages/chat';
import { LifePage, MemoriesPage, StickersPage } from '@/components/pages/life';
import { SettingsPage } from '@/components/pages/settings';
import { AppContext } from '@/lib/app-context';
import { useMobileViewport } from '@/lib/use-mobile-viewport';
import { api, platformNames, when, type CompanionState, type Experience, type Page } from '@/lib/companion-types';
const navItems = [{ page:'home', icon:Home, title:'我的小岛' },{page:'chat',icon:MessageCircle,title:'和大肥鱼聊天'},{page:'life',icon:Compass,title:'大肥鱼的生活'},{page:'memories',icon:BookOpen,title:'记得的小事'},{page:'stickers',icon:ImageIcon,title:'表情收藏夹'}] as const;
const titles:Record<Page,string>={home:'我的小岛',chat:'和大肥鱼聊天',life:'大肥鱼的生活',memories:'记得的小事',stickers:'表情收藏夹',settings:'连接与偏好'};
export default function App(){
 const [data,setData]=useState<CompanionState|null>(null),[page,setPage]=useState<Page>('home'),[offline,setOffline]=useState(''),[toast,setToast]=useState(''),[mobileNav,setMobileNav]=useState(false),[notifications,setNotifications]=useState(false),[detail,setDetail]=useState<Experience|null>(null),[busy,setBusy]=useState(false);
 const knownJobs=useRef(new Set<string>()),initialLoaded=useRef(false),sidebar=useRef<HTMLElement>(null);
 useMobileViewport(page);
 useEffect(()=>{
  const desktop=window.matchMedia('(min-width: 721px)');
  const close=()=>{if(desktop.matches)setMobileNav(false);};
  desktop.addEventListener('change',close);
  return()=>desktop.removeEventListener('change',close);
 },[]);
 useEffect(()=>{
  if(!mobileNav)return;
  const previous=document.activeElement as HTMLElement|null;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const buttons=()=>Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')||[]);
  buttons()[0]?.focus();
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setMobileNav(false);}
   if(event.key==='Tab'){
    const items=buttons(),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onKey);previous?.focus({preventScroll:true});};
 },[mobileNav]);
 const notify=useCallback((message:string)=>setToast(message),[]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
 const refresh=useCallback(async()=>{try{const next=await api<CompanionState>('/state');setData(next);setOffline('');if(initialLoaded.current)for(const job of next.jobs)if(!knownJobs.current.has(job.id)&&['failed','completed'].includes(job.status)){if(job.status==='failed')notify(job.error||'这次任务没有完成。');if(job.kind==='explore'&&job.status==='completed')notify('大肥鱼回来了，带回了一点新见闻。');}for(const job of next.jobs.filter(j=>j.status!=='running'))knownJobs.current.add(job.id);initialLoaded.current=true;}catch(error){setOffline((error as Error).message);}},[notify]);
 useEffect(()=>{refresh();const timer=setInterval(refresh,1800);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{const update=()=>{const next=window.location.hash.slice(1) as Page;if(next in titles)setPage(next);};update();window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 const go=useCallback((next:Page)=>{setPage(next);setMobileNav(false);window.location.hash=next;},[]);
 const action=useCallback(async(endpoint:string,method='POST',body?:unknown,message?:string)=>{try{setBusy(true);const value=await api(endpoint,method,body??{});await refresh();if(message)notify(message);return value;}catch(error){notify((error as Error).message);return null;}finally{setBusy(false);}},[refresh,notify]);
 const explore=async(url?:string)=>{const result=await action('/explore','POST',url?{url}:{});if(result){go('life');}};
 if(!data)return <div className="boot"><Character/><h1>大肥鱼</h1><p>{offline||'给大肥鱼留一小片海……'}</p>{offline?<button className="button primary" onClick={refresh}><RefreshCw size={16}/>重新连接</button>:<LoaderCircle className="spin" size={20}/>}</div>;
 const running=data.jobs.find(j=>j.kind==='explore'&&j.status==='running');
 return <AppContext.Provider value={{data,go,action,refresh,notify,busy,explore,openDetail:setDetail,shareLink:()=>go('chat')}}><div className={`app-shell ${page==='chat'?'chat-shell':''}`}>
 {mobileNav&&<button className="nav-backdrop" aria-label="关闭导航" onClick={()=>setMobileNav(false)}/>}
 <aside id="island-navigation" ref={sidebar} className={`sidebar ${mobileNav?'mobile-open':''}`}><button className="icon-button mobile-nav-close" aria-label="收起导航" onClick={()=>setMobileNav(false)}><X size={21}/></button><button className="brand" onClick={()=>go('home')} aria-label="返回我的小岛"><span className="brand-mark"><Character small/></span><span>大肥鱼<span className="brand-en">DAFEIYU</span></span></button><div className="sidebar-section-label">在这座小岛</div><nav aria-label="主要导航">{navItems.map(({page:item,icon:Icon,title},i)=><div key={item}>{i===3&&<div className="sidebar-section-label second-label">一点点收藏</div>}<button className={`nav-item ${page===item?'active':''}`} onClick={()=>go(item)} aria-current={page===item?'page':undefined}><Icon size={19}/><span>{title}</span>{item==='chat'&&<span className="nav-shortcut" aria-hidden="true">↵</span>}{item==='life'&&running&&<span className="nav-dot"/>}</button></div>)}</nav><div className="sidebar-bottom"><div className="mini-companion"><div className="mini-whale"><Character small mood={data.personality.mood}/></div><div><strong>大肥鱼在这里</strong><span><i/>{data.personality.mood}，慢慢来就好</span></div><Heart size={15}/></div><button className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>go('settings')} aria-current={page==='settings'?'page':undefined}><Settings2 size={18}/><span>连接与偏好</span></button><div className="sidebar-footnote"><span className="live-dot"/>本机小岛 · 数据留在这里<ShieldCheck size={12}/></div></div></aside>
 <div className="workspace" inert={mobileNav}><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="打开导航" aria-controls="island-navigation" aria-expanded={mobileNav} onClick={()=>setMobileNav(true)}><Menu size={21}/></button><Waves size={16}/><span>大肥鱼</span><ChevronRight size={12}/><strong>{titles[page]}</strong></div><div className="topbar-right"><span className={`service-status ${offline?'disconnected':''}`}><i/>{offline?'服务连接中断':'小岛服务已连接'}</span><span className="topbar-divider"/><div className="notification-wrap"><button className={`icon-button ${notifications?'selected':''}`} aria-label="查看最近动态" aria-expanded={notifications} onClick={()=>setNotifications(!notifications)}><Bell size={18}/>{data.jobs.length>0&&<span className="bell-dot"/>}</button>{notifications&&<div className="notification-popover"><h3>小岛的动静</h3>{data.jobs.length?data.jobs.slice(0,4).map(job=><div key={job.id} className="notification-item"><span className={`activity-dot ${job.status}`}/><div><strong>{job.kind==='chat'?'一次聊天':job.kind==='voice-output'?'准备语音':'一次探索'}</strong><p>{job.status==='running'?job.stage||'正在输入中……':job.status==='completed'?'已经完成':job.error||'已取消'}</p><small>{when(job.createdAt,true)}</small></div></div>):<p className="muted small">还没有新的动静，先和大肥鱼打个招呼吧。</p>}</div>}</div><button className="user-avatar" aria-label="查看连接设置" onClick={()=>go('settings')}>{data.personality.preferredName?.slice(-1)||'你'}</button></div></header>{offline&&<div className="offline-banner"><CircleHelp size={15}/>{offline}<button onClick={refresh}>重试</button></div>}
 <main className={`main-content page-${page}`}>{page==='home'&&<HomePage/>}{page==='chat'&&<ChatPage/>}{page==='life'&&<LifePage/>}{page==='memories'&&<MemoriesPage/>}{page==='stickers'&&<StickersPage/>}{page==='settings'&&<SettingsPage/>}</main>{page!=='chat'&&<footer className="app-footer"><span>一小片海，一个慢慢认识你的伙伴。</span><span>大肥鱼 <span className="footer-dot">·</span> 每一天，都有一点点不同 <Leaf size={12}/></span></footer>}</div>
 <nav className="mobile-tabbar" aria-label="手机导航" inert={mobileNav}>{navItems.slice(0,4).map(({page:item,icon:Icon,title})=><button key={item} className={page===item?'active':''} aria-current={page===item?'page':undefined} onClick={()=>go(item)}><Icon size={20}/><span>{item==='chat'?'聊天':item==='memories'?'记忆':item==='life'?'生活':'小岛'}</span></button>)}<button className={['settings','stickers'].includes(page)?'active':''} onClick={()=>go('settings')}><Settings2 size={20}/><span>设置</span></button></nav>
 {toast&&<div className="toast" role="status"><span>{toast}</span><button onClick={()=>setToast('')} aria-label="关闭提示"><X size={15}/></button></div>}
 {detail&&<Modal title={detail.purpose==='lookup'?'大肥鱼查了查':detail.kind==='reading'?'大肥鱼带回的见闻':'相处的一小段'} onClose={()=>setDetail(null)}><div className="detail-meta">{detail.platform&&<><PlatformLogo platform={detail.platform}/>{platformNames[detail.platform]}<span>·</span></>}{when(detail.createdAt,true)}</div><h3 className="detail-title">{detail.title}</h3>{detail.reflection&&<blockquote>{detail.reflection}</blockquote>}<p className="detail-text">{detail.description||detail.excerpt||detail.reflection||'已经收好这次经历，等待整理想法。'}</p>{detail.contentBasis&&<p className="helper-text"><BookOpen size={13}/>{detail.contentBasis}，不代表已看完视频。</p>}{detail.url&&<a className="button secondary" href={detail.url} target="_blank" rel="noopener noreferrer">去原页面看看<ExternalLink size={15}/></a>}</Modal>}

 </div></AppContext.Provider>;
}
