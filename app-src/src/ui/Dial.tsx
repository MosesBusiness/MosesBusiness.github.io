import React, { useState } from 'react';
import { Safe } from '../lib/calc';
import { fmtShort } from '../lib/format';

// The month dial: one bar per day of the financial month, clockwise from the top.
// Bar length = that day's variable spending against the planned daily budget (the dashed-free
// hairline circle). Outer gold arc = share of this month's savings target already set aside.

export function Dial({ safe, base, children, fmt }: { safe: Safe; base: number; children: React.ReactNode; fmt: (n: number) => string }) {
  const [sel, setSel] = useState<number | null>(null);
  const N = safe.daily.length;
  const C = 160, r0 = 92, L = 50, over = 1.6;
  const rA = r0 + L / over;
  const today = safe.daily.length - safe.daysLeft;
  const maxSpend = Math.max(...safe.daily.map(d => d.spend), 1);
  const scale = base > 0 ? base : maxSpend / over;
  const width = Math.max(3, Math.min(8, (2 * Math.PI * r0) / N * 0.5));
  const saveProg = safe.saveTarget > 0 ? Math.max(0, Math.min(1, safe.saved / safe.saveTarget)) : 0;
  const rG = 152, circ = 2 * Math.PI * rG;

  const pos = (i: number, r: number) => {
    const th = (-90 + ((i + 0.5) * 360) / N) * (Math.PI / 180);
    return [C + r * Math.cos(th), C + r * Math.sin(th)];
  };

  return (
    <div className="dial">
      <svg viewBox="0 0 320 320" role="img" aria-label={`חוגת החודש: ${N} ימים, היום יום ${today + 1}`}>
        <circle cx={C} cy={C} r={rG} fill="none" stroke="var(--surface-2)" strokeWidth={3} />
        {saveProg > 0 && (
          <circle cx={C} cy={C} r={rG} fill="none" stroke="var(--gold)" strokeWidth={3} strokeLinecap="round"
            strokeDasharray={`${circ * saveProg} ${circ}`} transform={`rotate(-90 ${C} ${C})`} />
        )}
        {base > 0 && <circle cx={C} cy={C} r={rA} fill="none" stroke="var(--ink-2)" strokeOpacity={0.35} strokeWidth={1} />}
        {safe.daily.map((d, i) => {
          const past = i < today, isToday = i === today;
          const v = d.spend / scale;
          const len = past || isToday ? Math.max(2.5, (Math.min(v, over) / over) * L) : 3;
          const [x1, y1] = pos(i, r0);
          const [x2, y2] = pos(i, r0 + len);
          const [hx2, hy2] = pos(i, r0 + L + 6);
          const color = !past && !isToday ? 'var(--line-strong)' : isToday ? 'var(--gold)' : v > 1 && base > 0 ? 'var(--spend)' : 'var(--accent)';
          return (
            <g key={d.d}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sel === i ? width + 2 : width} strokeLinecap="round"
                opacity={!past && !isToday ? 0.7 : 1} />
              {isToday && <circle cx={x2} cy={y2} r={width / 2 + 2.5} fill="none" stroke="var(--gold)" strokeWidth={1.5} opacity={0.6} />}
              <line x1={x1} y1={y1} x2={hx2} y2={hy2} stroke="transparent" strokeWidth={Math.max(14, width + 8)}
                onPointerDown={() => setSel(i)} onPointerLeave={() => setSel(s => (s === i ? null : s))}
                onFocus={() => setSel(i)} onBlur={() => setSel(null)} tabIndex={past || isToday ? 0 : -1}
                aria-label={`${fmtShort(d.d)}: ${fmt(d.spend)}`} style={{ cursor: 'pointer', outline: 'none' }} />
            </g>
          );
        })}
      </svg>
      <div className="dial-center">
        {sel !== null && safe.daily[sel] ? (
          <>
            <span className="lbl">{fmtShort(safe.daily[sel].d)}</span>
            <span className="figure money">{fmt(safe.daily[sel].spend)}</span>
            <span className="sub">הוצאות משתנות ביום הזה</span>
          </>
        ) : children}
      </div>
    </div>
  );
}
