import React, { useEffect, useRef } from 'react';
import { ICONS } from './iconData';

export function Icon({ name, size = 20, stroke = 1.8, className, label }: { name: string; size?: number; stroke?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS['circle-dashed'] }}
    />
  );
}

export function Sheet({ title, onClose, children, full, footer, labelledBy }: {
  title?: React.ReactNode; onClose: () => void; children: React.ReactNode; full?: boolean; footer?: React.ReactNode; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      {!full && <div className="scrim" onClick={onClose} />}
      <div className={`sheet${full ? ' full' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref} tabIndex={-1}>
        {!full && <div className="grabber" />}
        <div className="sheet-head">
          <h2 id={labelledBy}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה"><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="wrap" style={{ paddingBlock: '10px 14px', borderTop: '1px solid var(--line)' }}>{footer}</div>}
      </div>
    </>
  );
}

export function Bar({ value, tone = '', mark }: { value: number; tone?: '' | 'gold' | 'spend'; mark?: number }) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`bar ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
      <i style={{ width: `${w}%` }} />
      {mark !== undefined && <span className="mark" style={{ right: `calc(${Math.max(0, Math.min(1, mark)) * 100}% - 1px)` }} />}
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 6, color = 'var(--gold)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />}
      </svg>
      <span className="c">{children}</span>
    </div>
  );
}

export function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${n} כוכבים`}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className={i <= n ? '' : 'off'} aria-hidden="true">
          <path fill="currentColor" d="M11.5 2.6a.6.6 0 0 1 1 0l2.7 5.5 6 .9a.6.6 0 0 1 .3 1l-4.4 4.2 1 6a.6.6 0 0 1-.8.6L12 18l-5.4 2.8a.6.6 0 0 1-.8-.6l1-6-4.3-4.3a.6.6 0 0 1 .3-1l6-.9z" />
        </svg>
      ))}
    </span>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange, className = '' }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`seg ${className}`} role="group">
      {options.map(o => <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="glyph gold"><Icon name={icon} size={24} /></span>
      <b>{title}</b>
      {body && <span className="muted" style={{ fontSize: '.88rem', maxWidth: '22rem' }}>{body}</span>}
      {action}
    </div>
  );
}

export function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } }
