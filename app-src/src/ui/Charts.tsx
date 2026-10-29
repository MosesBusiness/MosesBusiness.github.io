import React, { useRef, useState } from 'react';
import { ilsCompact, ils } from '../lib/format';

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return ([1, 2, 3, 4, 5, 6, 8, 10].find(x => n <= x) || 10) * p;
};

/** Monthly income vs expenses, grouped columns. Time runs left to right. */
export function CashflowChart({ rows, fmt }: { rows: { label: string; income: number; expense: number }[]; fmt: (n: number) => string }) {
  const [hi, setHi] = useState<number | null>(null);
  const W = 340, H = 168, padL = 38, padB = 22, padT = 8;
  const max = niceMax(Math.max(...rows.map(r => Math.max(r.income, r.expense)), 1));
  const plotW = W - padL - 6, plotH = H - padB - padT;
  const gw = plotW / rows.length;
  const bw = Math.min(14, gw / 2 - 6);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const bar = (x: number, v: number, color: string) => {
    const top = y(v), h = Math.max(0, padT + plotH - top), r = Math.min(4, h, bw / 2);
    if (h <= 0) return null;
    return <path d={`M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${padT + plotH} Z`} fill={color} />;
  };
  return (
    <div style={{ position: 'relative' }}>
      <div className="legend" style={{ justifyContent: 'flex-start', marginBottom: 6 }}>
        <span><i style={{ background: 'var(--c-income)' }} />הכנסות</span>
        <span><i style={{ background: 'var(--c-expense)' }} />הוצאות</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="הכנסות והוצאות לפי חודש" style={{ direction: 'ltr' }}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line className="grid" x1={padL} x2={W - 4} y1={y(max * f)} y2={y(max * f)} />
            <text x={padL - 6} y={y(max * f) + 4} textAnchor="end">{ilsCompact(max * f).replace('₪', '')}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const gx = padL + i * gw + gw / 2;
          return (
            <g key={i}>
              {hi === i && <rect x={padL + i * gw + 2} y={padT} width={gw - 4} height={plotH} fill="var(--surface-2)" rx={6} />}
              {bar(gx - bw - 1, r.income, 'var(--c-income)')}
              {bar(gx + 1, r.expense, 'var(--c-expense)')}
              <text x={gx} y={H - 6} textAnchor="middle" style={{ fill: hi === i ? 'var(--ink)' : undefined }}>{r.label}</text>
              <rect x={padL + i * gw} y={0} width={gw} height={H} fill="transparent" tabIndex={0}
                onPointerEnter={() => setHi(i)} onPointerDown={() => setHi(i)} onPointerLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)}
                aria-label={`${r.label}: הכנסות ${ils(r.income)}, הוצאות ${ils(r.expense)}`} />
            </g>
          );
        })}
      </svg>
      {hi !== null && rows[hi] && (
        <div className="tip" style={{ top: 26, [((hi + 0.5) / rows.length) > 0.5 ? 'left' : 'right']: 8 } as React.CSSProperties}>
          <div className="muted" style={{ marginBottom: 4 }}>{rows[hi].label}</div>
          <div><span className="k" style={{ background: 'var(--c-income)' }} /><b className="money">{fmt(rows[hi].income)}</b> הכנסות</div>
          <div><span className="k" style={{ background: 'var(--c-expense)' }} /><b className="money">{fmt(rows[hi].expense)}</b> הוצאות</div>
          <div style={{ marginTop: 4 }}>נשאר: <b className={`money ${rows[hi].income - rows[hi].expense >= 0 ? 'up' : 'down'}`}>{fmt(rows[hi].income - rows[hi].expense)}</b></div>
        </div>
      )}
    </div>
  );
}

/** Compound growth: total balance (line + wash) against what you paid in (line). */
export function CompoundChart({ rows }: { rows: { y: number; total: number; paid: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 340, H = 180, padL = 44, padB = 22, padT = 10, padR = 8;
  const max = niceMax(Math.max(...rows.map(r => r.total), 1));
  const n = rows.length - 1;
  const x = (i: number) => padL + (i / Math.max(1, n)) * (W - padL - padR);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const line = (k: 'total' | 'paid') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const area = `${line('total')} L${x(n)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, Math.round(n / 2), n].filter((t, i, a) => a.indexOf(t) === i);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(n, Math.round(((px - padL) / (W - padL - padR)) * n))));
  };
  const last = rows[n];
  return (
    <div style={{ position: 'relative' }}>
      <div className="legend" style={{ justifyContent: 'flex-start', marginBottom: 6 }}>
        <span><i style={{ background: 'var(--accent)', height: 3 }} />שווי התיק</span>
        <span><i style={{ background: 'var(--ink-2)', height: 3 }} />מה שהפקדת</span>
      </div>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} style={{ direction: 'ltr', touchAction: 'pan-y' }} role="img"
        aria-label={`בעוד ${last.y} שנים: ${ils(last.total)}, מתוכם הפקדות ${ils(last.paid)}`}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)}>
        {[0, 0.5, 1].map(f => (
          <g key={f}><line className="grid" x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} />
            <text x={padL - 6} y={y(max * f) + 4} textAnchor="end">{ilsCompact(max * f).replace('₪', '')}</text></g>
        ))}
        {ticks.map(t => <text key={t} x={x(t)} y={H - 6} textAnchor="middle">{t === 0 ? 'היום' : t === n ? `שנה ${rows[t].y}` : `שנה ${rows[t].y}`}</text>)}
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path d={line('paid')} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={line('total')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n)} cy={y(last.total)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {hi !== null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={padT} y2={H - padB} stroke="var(--ink-2)" strokeWidth={1} />
            <circle cx={x(hi)} cy={y(rows[hi].total)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            <circle cx={x(hi)} cy={y(rows[hi].paid)} r={4.5} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hi !== null && rows[hi] && (
        <div className="tip" style={{ top: 26, [hi / Math.max(1, n) > 0.5 ? 'left' : 'right']: 8 } as React.CSSProperties}>
          <div className="muted" style={{ marginBottom: 4 }}>{hi === 0 ? 'היום' : `בעוד ${rows[hi].y} שנים`}</div>
          <div><span className="k" style={{ background: 'var(--accent)' }} /><b>{ils(rows[hi].total)}</b> שווי</div>
          <div><span className="k" style={{ background: 'var(--ink-2)' }} /><b>{ils(rows[hi].paid)}</b> הפקדות</div>
          <div style={{ marginTop: 4 }}>רווח: <b className="up">{ils(rows[hi].total - rows[hi].paid)}</b></div>
        </div>
      )}
    </div>
  );
}

/** Tiny net-worth sparkline. */
export function Spark({ values, w = 120, h = 34 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 6) + 3},${h - 4 - ((v - min) / rng) * (h - 8)}`);
  const [lx, ly] = pts[pts.length - 1].split(',').map(Number);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ direction: 'ltr' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--gold)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
