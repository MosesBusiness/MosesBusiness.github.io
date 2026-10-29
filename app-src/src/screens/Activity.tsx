import React, { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Bar, Icon } from '../ui/kit';
import { CashflowChart } from '../ui/Charts';
import { Money, TxRow, txLabel, useFmt } from '../ui/parts';
import { byCategory, periodOf, savingsRate, shiftPeriod, sums, txInRange } from '../lib/calc';
import { catById, Tx } from '../lib/model';
import { fmtDay, fmtMonth, fmtMonthShort, pct, todayISO, daysBetween } from '../lib/format';

type F = 'all' | 'expense' | 'income' | 'save';

export function Activity() {
  const { v, open } = useApp();
  const fmt = useFmt();
  const sd = v.core.profile.startDay;
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<F>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const cur = periodOf(todayISO(), sd);
  const p = shiftPeriod(cur, offset, sd);
  const txs = useMemo(() => txInRange(v, p.start, p.end), [v, p.start, p.end]);
  const s = sums(txs, v.core);
  const rate = savingsRate(s);
  const cats = byCategory(txs, 'expense');
  const isCurrent = offset === 0;
  const elapsed = isCurrent ? (daysBetween(p.start, todayISO()) + 1) / p.days : 1;

  const flow = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const pp = shiftPeriod(cur, offset - 5 + i, sd);
    const ss = sums(txInRange(v, pp.start, pp.end), v.core);
    return { label: fmtMonthShort(pp.key), income: ss.income, expense: ss.expense };
  }), [v, offset, sd]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs
      .filter(t => filter === 'all' || (filter === 'save' ? t.t === 'save' || t.t === 'withdraw' : t.t === filter))
      .filter(t => !cat || t.c === cat)
      .filter(t => !needle || (t.n || '').toLowerCase().includes(needle) || txLabel(t, v.core).name.includes(needle) || String(t.a).includes(needle))
      .sort((a, b) => (b.d + b.ts).localeCompare(a.d + a.ts));
  }, [txs, filter, cat, q, v.core]);

  const groups: [string, Tx[]][] = [];
  for (const t of list) {
    const g = groups[groups.length - 1];
    if (g && g[0] === t.d) g[1].push(t); else groups.push([t.d, [t]]);
  }

  return (
    <div className="wrap stack-l" style={{ paddingTop: 6 }}>
      <div className="row between">
        <button className="icon-btn" onClick={() => setOffset(o => o - 1)} aria-label="חודש קודם"><Icon name="chevron-right" /></button>
        <div style={{ textAlign: 'center' }}>
          <h1 className="h-sec">{fmtMonth(p.key)}</h1>
          <div className="h-sub">{sd !== 1 ? `${fmtDay(p.start)} עד ${fmtDay(p.end)}` : isCurrent ? 'החודש הנוכחי' : ''}</div>
        </div>
        <button className="icon-btn" onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={isCurrent} aria-label="חודש הבא" style={{ opacity: isCurrent ? 0.3 : 1 }}><Icon name="chevron-left" /></button>
      </div>

      <section className="tiles">
        <div className="tile"><span className="k">הכנסות</span><span className="v money" style={{ color: 'var(--c-income)' }}>{fmt(s.income)}</span></div>
        <div className="tile"><span className="k">הוצאות</span><span className="v money">{fmt(s.expense)}</span><span className="d">צורך {pct(s.expense ? s.need / s.expense : 0)} · רצון {pct(s.expense ? s.want / s.expense : 0)}</span></div>
        <div className="tile"><span className="k">נשאר</span><span className={`v money ${s.income - s.expense >= 0 ? 'up' : 'down'}`}>{fmt(s.income - s.expense)}</span><span className="d">{rate === null ? '' : `חיסכון ${pct(rate)}`}</span></div>
      </section>

      <section className="card">
        <CashflowChart rows={flow} fmt={fmt} />
      </section>

      <section className="stack">
        <div className="sec-head">
          <h2 className="h-sec">לאן הלך הכסף</h2>
          <span className="h-sub">לחיצה מסננת · המטרה קובעת תקרה</span>
        </div>
        {cats.length ? (
          <div className="card tight list" style={{ paddingBlock: 4 }}>
            {cats.map(r => {
              const c = catById(v.core, r.c);
              const lim = v.core.budgets[r.c];
              const share = r.a / (s.expense || 1);
              return (
                <div key={r.c} className="li" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12 }}>
                  <span className="glyph expense"><Icon name={c?.icon || 'circle-dashed'} /></span>
                  <button style={{ display: 'grid', gap: 6, textAlign: 'start', minWidth: 0 }} onClick={() => setCat(x => (x === r.c ? null : r.c))} aria-pressed={cat === r.c}>
                    <span className="row between" style={{ gap: 8 }}>
                      <span className="t" style={{ fontWeight: cat === r.c ? 800 : 600 }}>{c?.name || r.c}</span>
                      <span className="money" style={{ fontWeight: 700, fontSize: '.92rem' }}>{fmt(r.a)}</span>
                    </span>
                    {lim ? <Bar value={r.a / lim} tone={r.a > lim ? 'spend' : r.a > lim * elapsed ? 'gold' : ''} mark={Math.min(1, elapsed)} />
                      : <Bar value={share} />}
                    <span className="s">{lim ? `${pct(r.a / lim)} מתקרה של ${fmt(lim)}` : `${pct(share)} מההוצאות · ${r.n} פעולות`}</span>
                  </button>
                  <button className="btn quiet sm" style={{ paddingInline: 8 }} onClick={() => open({ k: 'budget', cat: r.c })} aria-label={`תקרה ל${c?.name}`}>
                    <Icon name="target" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>אין הוצאות בחודש הזה.</p>}
      </section>

      <section className="stack">
        <div className="sec-head"><h2 className="h-sec">תנועות</h2>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn ghost sm" onClick={() => open({ k: 'recurring' })}><Icon name="repeat" size={16} /> קבועים</button>
            <button className="btn ghost sm" onClick={() => open({ k: 'import' })}><Icon name="upload" size={16} /> ייבוא</button>
          </div>
        </div>
        <div className="row" style={{ position: 'relative' }}>
          <Icon name="search" size={18} className="muted" />
          <input id="tx-search" className="input" style={{ height: 42 }} placeholder="חיפוש לפי בית עסק, קטגוריה או סכום" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="chips">
          {([['all', 'הכול'], ['expense', 'הוצאות'], ['income', 'הכנסות'], ['save', 'חיסכון']] as [F, string][]).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
          {cat && <button className="chip" aria-pressed="true" onClick={() => setCat(null)}>{catById(v.core, cat)?.name} <Icon name="x" size={14} /></button>}
        </div>
        {groups.length ? (
          <div className="card tight" style={{ paddingBlock: 0 }}>
            {groups.map(([d, items]) => {
              const net = items.reduce((a, t) => a + (t.t === 'income' ? t.a : t.t === 'expense' ? -t.a : 0), 0);
              return (
                <div key={d}>
                  <div className="day-head"><span>{fmtDay(d)}</span><Money n={net} sign /></div>
                  <div className="list">{items.map(t => <TxRow key={t.id} t={t} onClick={() => open({ k: 'add', preset: { edit: t } })} />)}</div>
                </div>
              );
            })}
          </div>
        ) : <p className="muted" style={{ margin: 0, textAlign: 'center', padding: 20 }}>אין תנועות להצגה.</p>}
      </section>
    </div>
  );
}
