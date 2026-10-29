import React, { useMemo } from 'react';
import { useApp } from '../state';
import { Bar, Icon, Ring } from '../ui/kit';
import { Spark } from '../ui/Charts';
import { useFmt } from '../ui/parts';
import { LEVELS, avgMonthlyExpense, bucketBalances, freedomDays, ladder, wealth } from '../lib/calc';
import { HOLDING_SUBS } from '../lib/model';
import { fmtMonth, num, todayISO, ymOf } from '../lib/format';

function monthsUntil(ym: string): number {
  const [y1, m1] = ymOf(todayISO()).split('-').map(Number);
  const [y2, m2] = ym.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function Goals() {
  const { v, open } = useApp();
  const fmt = useFmt();
  const w = useMemo(() => wealth(v), [v]);
  const bal = useMemo(() => bucketBalances(v), [v]);
  const lad = useMemo(() => ladder(v), [v]);
  const fd = useMemo(() => freedomDays(v, w), [v, w]);
  const avgM = useMemo(() => avgMonthlyExpense(v), [v]);
  const hist = v.core.nwHistory.map(h => h.v);

  return (
    <div className="wrap stack-l" style={{ paddingTop: 6 }}>
      <header className="stack" style={{ gap: 6 }}>
        <h1 className="h-sec" style={{ fontSize: '1.5rem' }}>מטרות</h1>
        <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>לאן הכסף שלך הולך, ומה הוא כבר קנה לך: זמן.</p>
      </header>

      <section className="card stack" aria-labelledby="lad-h">
        <div className="sec-head">
          <h2 className="h-sec" id="lad-h" style={{ fontSize: '1.08rem' }}>סולם העושר</h2>
          <span className="pill gold">שלב {lad.level} מתוך 5</span>
        </div>
        <div className="ladder">
          {LEVELS.map(l => (
            <div key={l.n} className={`step ${l.n <= lad.level ? 'done' : l.n === lad.level + 1 ? 'now' : ''}`}>
              <span className="n">{l.n <= lad.level ? <Icon name="check" size={16} stroke={2.6} /> : l.n}</span>
              <span>{l.name}</span>
            </div>
          ))}
        </div>
        {lad.next ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between" style={{ fontSize: '.9rem' }}><b>הבא: {lad.next.name}</b><span className="muted">{lad.hint}</span></div>
            <Bar value={lad.progress} tone="gold" />
            <div className="muted" style={{ fontSize: '.84rem' }}>{lad.next.rule}. הסדר הזה מגן עליך: קודם רשת ביטחון, אחר כך צמיחה.</div>
          </div>
        ) : <b className="gold">הגעת לחירות כלכלית. הכסף שלך עובד, ואתה בוחר.</b>}
      </section>

      <section className="tiles" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="tile">
          <span className="k">ימי חירות</span>
          <span className="v" style={{ fontSize: '1.6rem' }}>{num(fd)}</span>
          <span className="d">ימים שהחיסכון הנזיל מממן</span>
        </div>
        <div className="tile">
          <span className="k">שווי נקי</span>
          <span className="v money" style={{ fontSize: '1.3rem' }}>{fmt(w.netWorth)}</span>
          <span className="d" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{hist.length > 1 ? <Spark values={hist} w={90} h={26} /> : 'נכסים פחות חובות'}</span>
        </div>
      </section>

      <section className="stack" aria-labelledby="b-h">
        <div className="sec-head"><h2 className="h-sec" id="b-h">קופות</h2><button className="link" onClick={() => open({ k: 'bucket' })}><Icon name="plus" size={16} /> קופה חדשה</button></div>
        <p className="muted" style={{ margin: 0, fontSize: '.84rem' }}>כסף עם שם ומטרה נשאר בצד. כל הפקדה נרשמת כחיסכון, לא כהוצאה.</p>
        <div className="stack" style={{ gap: 10 }}>
          {v.core.buckets.map(b => {
            const balance = bal[b.id] || 0;
            const target = b.target || (b.kind === 'emergency' && avgM > 0 ? avgM * 6 : 0);
            const prog = target ? balance / target : 0;
            const left = b.deadline ? monthsUntil(b.deadline) : 0;
            const perMonth = target && left > 0 ? Math.max(0, (target - balance) / left) : 0;
            return (
              <div key={b.id} className="card tight row" style={{ alignItems: 'center', gap: 14 }}>
                <Ring value={prog} size={58} color={b.kind === 'invest' ? 'var(--accent)' : 'var(--gold)'}>
                  {target ? `${Math.min(999, Math.round(prog * 100))}%` : <Icon name={b.icon} size={20} />}
                </Ring>
                <button className="grow" style={{ display: 'grid', gap: 2, textAlign: 'start', minWidth: 0 }} onClick={() => open({ k: 'bucket', id: b.id })}>
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</b>
                  <span className="money" style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmt(balance)}</span>
                  <span className="muted" style={{ fontSize: '.78rem' }}>
                    {target ? `יעד ${fmt(target)}${b.kind === 'emergency' && !b.target ? ' (6 חודשים)' : ''}` : b.kind === 'invest' ? 'ליבה במדדים, לטווח ארוך' : ''}
                    {perMonth > 0 ? ` · ${fmt(perMonth)} בחודש עד ${fmtMonth(b.deadline!)}` : ''}
                  </span>
                </button>
                <button className="btn ghost sm" onClick={() => open({ k: 'add', preset: { t: 'save', c: b.id } })} aria-label={`הפקדה ל${b.name}`}><Icon name="plus" size={16} /></button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack" aria-labelledby="nw-h">
        <div className="sec-head"><h2 className="h-sec" id="nw-h">נכסים וחובות</h2><button className="link" onClick={() => open({ k: 'holding' })}><Icon name="plus" size={16} /> הוספה</button></div>
        <div className="card tight list" style={{ paddingBlock: 2 }}>
          <div className="li"><span className="glyph save"><Icon name="piggy-bank" /></span><span className="grow t">הקופות שלך</span><span className="amt money">{fmt(w.emergency + w.invest + w.goals)}</span></div>
          {v.core.holdings.map(h => (
            <button key={h.id} className="li" onClick={() => open({ k: 'holding', id: h.id })}>
              <span className={`glyph ${h.kind === 'debt' ? 'expense' : 'gold'}`}><Icon name={h.kind === 'debt' ? 'credit-card' : h.sub === 'property' ? 'house' : h.sub === 'car' ? 'car' : h.sub === 'checking' ? 'wallet' : 'landmark'} /></span>
              <span className="grow" style={{ display: 'grid' }}><span className="t">{h.name}</span><span className="s">{HOLDING_SUBS.find(s => s.id === h.sub)?.name}</span></span>
              <span className={`amt money ${h.kind === 'debt' ? 'down' : ''}`}>{h.kind === 'debt' ? '−' : ''}{fmt(h.value)}</span>
            </button>
          ))}
          {!v.core.holdings.length && <div className="muted" style={{ padding: '12px 0', fontSize: '.86rem' }}>הוסף עו"ש, פנסיה, קרן השתלמות או הלוואה כדי לראות את השווי הנקי המלא.</div>}
          <div className="li" style={{ borderTop: '1px solid var(--line-strong)' }}><b className="grow">שווי נקי</b><b className="amt money">{fmt(w.netWorth)}</b></div>
        </div>
      </section>

      <section className="card tight row" style={{ gap: 12 }}>
        <span className="glyph gold"><Icon name="sprout" /></span>
        <div className="grow" style={{ fontSize: '.88rem' }}>
          <b>הזדמנות לחיסכון אוטומטי</b>
          <div className="ink2">הוראת קבע ביום המשכורת לקופת ההשקעות, ורישום שלה כקבוע כאן. מה שאוטומטי לא תלוי בכוח רצון.</div>
        </div>
        <button className="btn ghost sm" onClick={() => open({ k: 'recurring' })}>קבועים</button>
      </section>
    </div>
  );
}
