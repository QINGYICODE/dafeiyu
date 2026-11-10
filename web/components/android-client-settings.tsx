'use client';
import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

export function AndroidClientSettings() {
  const [native, setNative] = useState(false);
  useEffect(() => { setNative(/DafeiyuAndroid\//.test(navigator.userAgent)); }, []);
  if (!native) return null;
  return <section className="card settings-section"><div className="settings-section-heading"><span className="settings-section-icon sky"><Smartphone size={20}/></span><div><h2>安卓客户端</h2><p>手机和网页版，共用同一座小岛。</p></div></div><p className="helper-text">聊天、记忆和自主冲浪由已连接的伙伴服务保存和运行。服务需要保持在线；麦克风权限可在手机的应用权限中修改。</p><div className="section-bottom"><p className="helper-text">更换地址会连接另一座小岛，不会搬移原服务的数据。</p><a className="button secondary compact" href="dafeiyu://connection">修改服务地址</a></div></section>;
}
