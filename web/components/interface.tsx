'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) { return <div className="empty-state"><div className="empty-symbol">{icon}</div><h3>{title}</h3><p>{children}</p>{action}</div>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
 const ref = useRef<HTMLDialogElement>(null), titleId = useId(); useEffect(() => { const overflow=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.showModal();return()=>{document.body.style.overflow=overflow;}; }, []);
 return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={onClose} onClick={e => { if(e.target === ref.current) {const r=ref.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();} }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) { return <button className={`toggle ${checked ? 'on' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} disabled={disabled}><span/></button>; }
