import React, { useState } from 'react';
import { useApp } from '../state';
import { Icon } from './kit';
import { Core, Tx, catById } from '../lib/model';
import { ils, money, relDay } from '../lib/format';
import { quoteOfDay } from '../lib/quotes';

export function useFmt() {
  const { lens } = useApp();
  return (n: number, sign = false) => money(n, lens, { sign });
}

export function Money({ n, sign, className = '' }: { n: number; sign?: boolean; className?: string }) {
  const fmt = useFmt();
  return <span className={`money ${className}`}>{fmt(n, sign)}</span>;
}

export function txLabel(t: Tx, core: Core): { name: string; icon: string } {
  if (t.t === 'save' || t.t === 'withdraw') {
    const b = core.buckets.find(x => x.id === t.c);
    return { name: (t.t === 'save' ? 'הפקדה ל' : 'משיכה מ') + (b?.name || 'קופה'), icon: b?.icon || 'piggy-bank' };
  }
  const c = catById(core, t.c);
  return { name: c?.name || 'אחר', icon: c?.icon || 'circle-dashed' };
}

export function TxRow({ t, onClick, showDate }: { t: Tx; onClick?: () => void; showDate?: boolean }) {
  const { v } = useApp();
  const fmt = useFmt();
  const { name, icon } = txLabel(t, v.core);
  const sign = t.t === 'expense' || t.t === 'save' ? -1 : 1;
  const tone = t.t === 'income' ? 'up' : t.t === 'expense' ? '' : 'gold';
  return (
    <button className="li" onClick={onClick}>
      <span className={`glyph ${t.t}`}><Icon name={icon} /></span>
      <span className="grow" style={{ display: 'grid' }}>
        <span className="t">{t.n || name}{t.r && <span className="tag-auto">קבוע</span>}{t.imp && <span className="tag-auto">יובא</span>}{t.demo && <span className="tag-auto">דוגמה</span>}</span>
        <span className="s">{t.n ? name : ''}{t.n && showDate ? ' · ' : ''}{showDate ? relDay(t.d) : ''}</span>
      </span>
      <span className={`amt money ${tone}`} style={t.t === 'income' ? { color: 'var(--c-income)' } : undefined}>
        {fmt(sign * t.a, t.t === 'income')}
      </span>
    </button>
  );
}

export function QuoteCard() {
  const [off, setOff] = useState(0);
  const [en, setEn] = useState(false);
  const q = quoteOfDay(off);
  return (
    <section className="card quote" aria-label="משפט היום">
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="eyebrow">משפט היום · {q.tag}</span>
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" onClick={() => setEn(x => !x)} aria-pressed={en} aria-label="המקור באנגלית"><Icon name="quote" size={18} /></button>
          <button className="icon-btn" onClick={() => { setOff(o => o + 1); setEn(false); }} aria-label="משפט נוסף"><Icon name="refresh-cw" size={18} /></button>
        </div>
      </div>
      <blockquote>{q.he}</blockquote>
      {en && <div className="en">“{q.en}”</div>}
      <div className="who">{q.who}</div>
      {q.src && <div className="src">{q.src}</div>}
    </section>
  );
}

export function Kpi({ k, v, d, tone }: { k: string; v: React.ReactNode; d?: React.ReactNode; tone?: string }) {
  return (
    <div className="tile">
      <span className="k">{k}</span>
      <span className={`v ${tone || ''}`}>{v}</span>
      {d && <span className="d">{d}</span>}
    </div>
  );
}

export { ils };
