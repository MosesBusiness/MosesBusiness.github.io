// Financial calculations: periods, safe-to-spend, savings rate, buckets, freedom days,
// wealth ladder, FI math, compound projections, recurring catch-up and insights.

import { Bucket, Core, Recurring, Tx, Vault, catById, uid } from './model';
import { addDays, addMonths, daysBetween, daysInMonth, iso, pad, parseISO, todayISO, ymOf } from './format';

export interface Period { start: string; end: string; key: string; days: number }

/** The financial month containing `date`, starting on profile.startDay. */
export function periodOf(date: string, startDay: number): Period {
  const d = parseISO(date);
  let y = d.getFullYear(), m = d.getMonth() + 1;
  const sd = (yy: number, mm: number) => Math.min(startDay, daysInMonth(yy, mm));
  if (d.getDate() < sd(y, m)) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const start = `${y}-${pad(m)}-${pad(sd(y, m))}`;
  let ny = y, nm = m + 1; if (nm === 13) { nm = 1; ny += 1; }
  const end = addDays(`${ny}-${pad(nm)}-${pad(sd(ny, nm))}`, -1);
  return { start, end, key: `${y}-${pad(m)}`, days: daysBetween(start, end) + 1 };
}

export function shiftPeriod(p: Period, n: number, startDay: number): Period {
  return periodOf(addMonths(p.key, n) + '-' + pad(Math.min(startDay, 28)), startDay);
}

export function txInRange(v: Vault, from: string, to: string): Tx[] {
  const out: Tx[] = [];
  let ym = ymOf(from);
  const last = ymOf(to);
  for (let guard = 0; guard < 400 && ym <= last; guard++, ym = addMonths(ym, 1)) {
    for (const t of v.months[ym] || []) if (t.d >= from && t.d <= to) out.push(t);
  }
  return out;
}

export function allTx(v: Vault): Tx[] {
  return Object.values(v.months).flat();
}

export interface Sums { income: number; expense: number; save: number; withdraw: number; need: number; want: number; fixed: number }
export function sums(txs: Tx[], core: Core): Sums {
  const s: Sums = { income: 0, expense: 0, save: 0, withdraw: 0, need: 0, want: 0, fixed: 0 };
  for (const t of txs) {
    if (t.t === 'income') s.income += t.a;
    else if (t.t === 'expense') {
      s.expense += t.a;
      const nw = t.nw || catById(core, t.c)?.nw || 'want';
      if (nw === 'need') s.need += t.a; else s.want += t.a;
      if (isFixed(t, core)) s.fixed += t.a;
    } else if (t.t === 'save') s.save += t.a;
    else s.withdraw += t.a;
  }
  return s;
}

export const isFixed = (t: Tx, core: Core) => !!t.r || !!catById(core, t.c)?.fixed;

export function savingsRate(s: Sums): number | null {
  if (s.income <= 0) return null;
  return (s.income - s.expense) / s.income;
}

export function byCategory(txs: Tx[], type: 'expense' | 'income'): { c: string; a: number; n: number }[] {
  const m = new Map<string, { a: number; n: number }>();
  for (const t of txs) if (t.t === type) { const x = m.get(t.c) || { a: 0, n: 0 }; x.a += t.a; x.n += 1; m.set(t.c, x); }
  return [...m.entries()].map(([c, x]) => ({ c, ...x })).sort((a, b) => b.a - a.a);
}

/** Average monthly expenses over the last up-to-3 complete periods that have data. */
export function avgMonthlyExpense(v: Vault, today = todayISO()): number {
  const sd = v.core.profile.startDay;
  const cur = periodOf(today, sd);
  const vals: number[] = [];
  for (let i = 1; i <= 6 && vals.length < 3; i++) {
    const p = shiftPeriod(cur, -i, sd);
    const txs = txInRange(v, p.start, p.end);
    if (txs.some(t => t.t === 'expense')) vals.push(sums(txs, v.core).expense);
  }
  if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  // No complete month yet: project the current one, else use the profile.
  const s = sums(txInRange(v, cur.start, today), v.core);
  const elapsed = daysBetween(cur.start, today) + 1;
  if (s.expense > 0 && elapsed >= 7) return s.fixed + ((s.expense - s.fixed) / elapsed) * cur.days;
  const inc = v.core.profile.income;
  return inc > 0 ? inc * (1 - v.core.profile.saveRate) : 0;
}

// ---- buckets & net worth ----
export function bucketBalance(v: Vault, b: Bucket): number {
  let bal = b.start;
  for (const t of allTx(v)) if (t.c === b.id) bal += t.t === 'save' ? t.a : t.t === 'withdraw' ? -t.a : 0;
  return bal;
}

export function bucketBalances(v: Vault): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of v.core.buckets) out[b.id] = b.start;
  for (const t of allTx(v)) {
    if (out[t.c] === undefined) continue;
    if (t.t === 'save') out[t.c] += t.a; else if (t.t === 'withdraw') out[t.c] -= t.a;
  }
  return out;
}

export interface Wealth {
  emergency: number; invest: number; goals: number; liquidHoldings: number; pension: number;
  assets: number; debts: number; netWorth: number; consumerDebt: number;
}
export function wealth(v: Vault): Wealth {
  const bal = bucketBalances(v);
  const w: Wealth = { emergency: 0, invest: 0, goals: 0, liquidHoldings: 0, pension: 0, assets: 0, debts: 0, netWorth: 0, consumerDebt: 0 };
  for (const b of v.core.buckets) {
    const x = Math.max(0, bal[b.id] || 0);
    if (b.kind === 'emergency') w.emergency += x; else if (b.kind === 'invest') w.invest += x; else w.goals += x;
  }
  for (const h of v.core.holdings) {
    if (h.kind === 'asset') {
      w.assets += h.value;
      if (h.sub === 'checking') w.liquidHoldings += h.value;
      if (h.sub === 'pension' || h.sub === 'hishtalmut') w.pension += h.value;
    } else {
      w.debts += h.value;
      if (h.sub === 'loan' || h.sub === 'card') w.consumerDebt += h.value;
    }
  }
  w.assets += w.emergency + w.invest + w.goals;
  w.netWorth = w.assets - w.debts;
  return w;
}

/** How many days of your current life your liquid savings already pay for. */
export function freedomDays(v: Vault, w = wealth(v)): number {
  const m = avgMonthlyExpense(v);
  if (m <= 0) return 0;
  return (w.emergency + w.invest + w.liquidHoldings) / (m / 30.44);
}

// ---- safe to spend ----
export interface Safe {
  period: Period; daysLeft: number; plannedIncome: number; incomeSoFar: number; spent: number;
  spentToday: number; saved: number; saveTarget: number; fixedAhead: number; available: number;
  allowanceToday: number; leftToday: number; tomorrow: number; hasBasis: boolean;
  daily: { d: string; spend: number }[];
}

export function safeToSpend(v: Vault, today = todayISO()): Safe {
  const { profile } = v.core;
  const period = periodOf(today, profile.startDay);
  const txs = txInRange(v, period.start, period.end);
  const s = sums(txs.filter(t => t.d <= today), v.core);
  const plannedIncome = Math.max(s.income, profile.income);
  const saveTarget = plannedIncome * profile.saveRate;
  const fixedAhead = recurringAhead(v, today, period.end);
  const spentToday = txs.filter(t => t.d === today && t.t === 'expense').reduce((a, t) => a + t.a, 0);
  const available = plannedIncome - Math.max(saveTarget, s.save - s.withdraw) - s.expense - fixedAhead;
  const daysLeft = daysBetween(today, period.end) + 1;
  const allowanceToday = (available + spentToday) / daysLeft;
  const leftToday = allowanceToday - spentToday;
  const tomorrow = daysLeft > 1 ? available / (daysLeft - 1) : 0;
  const daily: { d: string; spend: number }[] = [];
  for (let i = 0; i < period.days; i++) {
    const d = addDays(period.start, i);
    daily.push({ d, spend: txs.filter(t => t.d === d && t.t === 'expense' && !isFixed(t, v.core)).reduce((a, t) => a + t.a, 0) });
  }
  return {
    period, daysLeft, plannedIncome, incomeSoFar: s.income, spent: s.expense, spentToday, saved: s.save - s.withdraw,
    saveTarget, fixedAhead, available, allowanceToday, leftToday, tomorrow, hasBasis: plannedIncome > 0, daily,
  };
}

/** Recurring expenses still to come in this period (not yet posted). */
export function recurringAhead(v: Vault, today: string, end: string): number {
  let sum = 0;
  for (const r of v.core.recurring) {
    if (!r.active || r.t !== 'expense') continue;
    for (const due of dueDates(r, addDays(today, 1), end)) if (due >= r.start) sum += r.a;
  }
  return sum;
}

function dueDates(r: Recurring, from: string, to: string): string[] {
  const out: string[] = [];
  let ym = ymOf(from);
  for (let g = 0; g < 24 && ym <= ymOf(to); g++, ym = addMonths(ym, 1)) {
    const [y, m] = ym.split('-').map(Number);
    const d = `${ym}-${pad(Math.min(r.day, daysInMonth(y, m)))}`;
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

/** Create transactions for recurring templates that came due. Returns new txs and updated templates. */
export function postRecurring(v: Vault, today = todayISO()): { txs: Tx[]; recurring: Recurring[] } {
  const txs: Tx[] = [];
  const recurring = v.core.recurring.map(r => {
    if (!r.active) return r;
    let ym = r.last ? addMonths(r.last, 1) : ymOf(r.start);
    let last = r.last;
    for (let g = 0; g < 36 && ym <= ymOf(today); g++, ym = addMonths(ym, 1)) {
      const [y, m] = ym.split('-').map(Number);
      const d = `${ym}-${pad(Math.min(r.day, daysInMonth(y, m)))}`;
      if (d > today) break;
      if (d >= r.start) txs.push({ id: uid(), t: r.t, a: r.a, c: r.c, d, n: r.n, nw: r.nw, r: r.id, ts: Date.now(), ...(r.demo ? { demo: 1 as const } : {}) });
      last = ym;
    }
    return last !== r.last ? { ...r, last } : r;
  });
  return { txs, recurring };
}

// ---- ladder ----
export interface Level { n: number; name: string; rule: string }
export const LEVELS: Level[] = [
  { n: 1, name: 'יסודות', rule: 'קרן חירום של חודש הוצאות אחד' },
  { n: 2, name: 'ביטחון', rule: 'קרן חירום של 3 חודשים' },
  { n: 3, name: 'חוסן', rule: '6 חודשים בצד ובלי חובות צרכניים' },
  { n: 4, name: 'צמיחה', rule: 'שיעור חיסכון של 20% ומעלה והשקעה קבועה' },
  { n: 5, name: 'חירות', rule: 'השקעות בגובה 25 שנות הוצאות' },
];

export interface LadderState { level: number; next: Level | null; progress: number; hint: string }
export function ladder(v: Vault): LadderState {
  const m = avgMonthlyExpense(v);
  const w = wealth(v);
  const months = m > 0 ? w.emergency / m : 0;
  const rate = trailingSavingsRate(v);
  const fi = m * 12 * 25;
  const investing = w.invest > 0 || allTx(v).some(t => t.t === 'save' && v.core.buckets.find(b => b.id === t.c)?.kind === 'invest');
  const checks = [
    { ok: m > 0 && months >= 1, prog: months / 1, hint: `עוד ${fmtK(Math.max(0, m - w.emergency))} לקרן החירום` },
    { ok: months >= 3, prog: months / 3, hint: `קרן חירום: ${months.toFixed(1)} מתוך 3 חודשים` },
    { ok: months >= 6 && w.consumerDebt <= 0, prog: Math.min(months / 6, w.consumerDebt > 0 ? 0.95 : 1), hint: w.consumerDebt > 0 ? 'לסגור חובות צרכניים' : `קרן חירום: ${months.toFixed(1)} מתוך 6 חודשים` },
    { ok: (rate ?? 0) >= 0.2 && investing, prog: Math.min((rate ?? 0) / 0.2, investing ? 1 : 0.9), hint: investing ? `שיעור חיסכון ${Math.round((rate ?? 0) * 100)}% מתוך 20%` : 'להתחיל הפקדה קבועה להשקעות' },
    { ok: fi > 0 && w.invest + w.pension >= fi, prog: fi > 0 ? (w.invest + w.pension) / fi : 0, hint: `${Math.round(fi > 0 ? ((w.invest + w.pension) / fi) * 100 : 0)}% ממספר החירות` },
  ];
  let level = 0;
  for (const c of checks) { if (c.ok) level++; else break; }
  const nextC = checks[level];
  return { level, next: LEVELS[level] || null, progress: nextC ? Math.max(0, Math.min(1, nextC.prog)) : 1, hint: nextC?.hint || 'הגעת לחירות כלכלית' };
}
const fmtK = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

export function trailingSavingsRate(v: Vault, n = 3): number | null {
  const sd = v.core.profile.startDay;
  const cur = periodOf(todayISO(), sd);
  let inc = 0, exp = 0;
  for (let i = 0; i <= n; i++) {
    const p = shiftPeriod(cur, -i, sd);
    const s = sums(txInRange(v, p.start, i === 0 ? todayISO() : p.end), v.core);
    if (i === 0 && s.income === 0) continue;
    inc += s.income; exp += s.expense;
  }
  return inc > 0 ? (inc - exp) / inc : null;
}

// ---- FI and compounding ----
export function yearsToFI(annualExpense: number, annualSave: number, assets: number, r: number): number | null {
  const target = annualExpense * 25;
  if (target <= 0) return null;
  let a = assets;
  for (let y = 0; y <= 70; y++) {
    if (a >= target) return y;
    a = a * (1 + r) + annualSave;
  }
  return null;
}

export function compoundSeries(monthly: number, years: number, rate: number, start = 0) {
  const rows: { y: number; total: number; paid: number }[] = [{ y: 0, total: start, paid: start }];
  let total = start, paid = start;
  const mr = Math.pow(1 + rate, 1 / 12) - 1;
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) { total = total * (1 + mr) + monthly; paid += monthly; }
    rows.push({ y, total, paid });
  }
  return rows;
}

/** Future value of a one-time amount if invested instead of spent. */
export const futureValue = (amount: number, years: number, r: number) => amount * Math.pow(1 + r, years);

// ---- streaks ----
export function loggingStreak(v: Vault, today = todayISO()): number {
  const days = new Set<string>(v.core.checkins);
  for (const t of allTx(v)) if (!t.r) days.add(t.d);
  let n = 0, d = today;
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d) && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

// ---- insights ----
export interface Insight { id: string; tone: 'good' | 'warn' | 'info'; icon: string; title: string; body: string; action?: { label: string; go: string } }

export function insights(v: Vault, today = todayISO()): Insight[] {
  const out: Insight[] = [];
  const core = v.core;
  const sd = core.profile.startDay;
  const cur = periodOf(today, sd);
  const curTx = txInRange(v, cur.start, today);
  const s = sums(curTx, core);
  const elapsed = daysBetween(cur.start, today) + 1;
  const avgM = avgMonthlyExpense(v, today);

  // Pay yourself first: income arrived and nothing set aside yet.
  if (s.income > 0 && s.save <= 0) {
    out.push({ id: 'pyf', tone: 'warn', icon: 'piggy-bank', title: 'לשלם קודם לעצמך',
      body: `נכנסו ${fmtK(s.income)} החודש ועוד לא הופרש כלום לעתיד. ${Math.round(core.profile.saveRate * 100)}% הם ${fmtK(s.income * core.profile.saveRate)}.`,
      action: { label: 'להפריש עכשיו', go: 'save' } });
  }

  // Month-end forecast.
  if (s.expense > 0 && elapsed >= 5 && elapsed < cur.days) {
    const variable = s.expense - s.fixed;
    const forecast = s.fixed + recurringAhead(v, today, cur.end) + (variable / elapsed) * cur.days;
    const inc = Math.max(s.income, core.profile.income);
    if (inc > 0) {
      const gap = inc - forecast;
      out.push({ id: 'forecast', tone: gap >= inc * core.profile.saveRate ? 'good' : 'warn', icon: 'chart-line',
        title: gap >= 0 ? `צפי לסוף החודש: עודף של ${fmtK(gap)}` : `צפי לסוף החודש: חריגה של ${fmtK(-gap)}`,
        body: `בקצב הנוכחי ההוצאות יגיעו לכ-${fmtK(forecast)}${gap > 0 ? `, שיעור חיסכון של ${Math.round((gap / inc) * 100)}%.` : '. כדאי להאט בהוצאות המשתנות.'}` });
    }
  }

  // Category spike vs the average of previous periods.
  const prevAvg = new Map<string, number>();
  let prevCount = 0;
  for (let i = 1; i <= 3; i++) {
    const p = shiftPeriod(cur, -i, sd);
    const txs = txInRange(v, p.start, p.end);
    if (!txs.length) continue;
    prevCount++;
    for (const r of byCategory(txs, 'expense')) prevAvg.set(r.c, (prevAvg.get(r.c) || 0) + r.a);
  }
  if (prevCount) {
    for (const r of byCategory(curTx, 'expense')) {
      const base = (prevAvg.get(r.c) || 0) / prevCount;
      const paced = (base * elapsed) / cur.days;
      if (base > 150 && r.a > paced * 1.4 && r.a - paced > 150) {
        const cat = catById(core, r.c);
        out.push({ id: 'spike-' + r.c, tone: 'warn', icon: cat?.icon || 'trending-up',
          title: `${cat?.name || 'קטגוריה'} גבוה מהרגיל`,
          body: `${fmtK(r.a)} עד היום, לעומת ${fmtK(paced)} בדרך כלל בשלב הזה של החודש.` });
        break;
      }
    }
  }

  // Subscriptions per year.
  const subs = core.recurring.filter(r => r.active && r.t === 'expense' && (r.c === 'subs' || r.c === 'comms'));
  if (subs.length >= 2) {
    const yearly = subs.reduce((a, r) => a + r.a, 0) * 12;
    out.push({ id: 'subs', tone: 'info', icon: 'repeat', title: `המנויים שלך: ${fmtK(yearly)} בשנה`,
      body: `${subs.length} חיובים קבועים. מנוי שלא השתמשת בו החודש שווה ביטול; ההפרש יכול לעבור להשקעה.`, action: { label: 'לקבועים', go: 'recurring' } });
  }

  // Big wins: top three categories.
  const cats = byCategory(curTx, 'expense');
  if (s.expense > 0 && cats.length >= 4) {
    const top = cats.slice(0, 3);
    const share = top.reduce((a, r) => a + r.a, 0) / s.expense;
    if (share > 0.55) {
      out.push({ id: 'bigwins', tone: 'info', icon: 'target', title: `${Math.round(share * 100)}% מההוצאות בשלוש קטגוריות`,
        body: `${top.map(r => catById(core, r.c)?.name).join(', ')}. שינוי קטן כאן שווה יותר מעשרות ויתורים קטנים.` });
    }
  }

  // Wants share.
  if (s.expense > 500 && s.income > 0) {
    const ws = s.want / s.income;
    if (ws > 0.3) out.push({ id: 'wants', tone: 'warn', icon: 'scale', title: `רצונות: ${Math.round(ws * 100)}% מההכנסה`,
      body: 'כלל 50/30/20 מציע עד 30% לרצונות. הכסף הזה עובד הכי קשה כשהוא מושקע.' });
    else if (s.expense > 0 && elapsed > 10) out.push({ id: 'wants-ok', tone: 'good', icon: 'scale', title: 'האיזון בין צורך לרצון טוב',
      body: `רצונות הם ${Math.round(ws * 100)}% מההכנסה החודש, בתוך ה-30% המומלצים.` });
  }

  // Emergency fund.
  const w = wealth(v);
  if (avgM > 0 && w.emergency < avgM * 3) {
    out.push({ id: 'emergency', tone: 'info', icon: 'shield-check', title: 'קרן החירום היא הבסיס',
      body: `יש בה ${(w.emergency / avgM).toFixed(1)} חודשי הוצאות. היעד הראשון הוא 3 חודשים (${fmtK(avgM * 3)}).`, action: { label: 'להפקיד', go: 'save' } });
  }

  // No-spend days.
  const noSpend = new Set(core.checkins.filter(d => d >= cur.start && d <= today));
  if (noSpend.size >= 2) out.push({ id: 'nospend', tone: 'good', icon: 'flame', title: `${noSpend.size} ימים בלי הוצאות החודש`, body: 'כל יום כזה מגדיל את הסכום שבטוח להוציא בשאר הימים.' });

  // Savings rate celebration.
  const rate = savingsRate(s);
  if (rate !== null && rate >= core.profile.saveRate && s.income > 0 && elapsed > 7) {
    out.push({ id: 'rate', tone: 'good', icon: 'sprout', title: `שיעור חיסכון ${Math.round(rate * 100)}%`, body: `מעל היעד שלך (${Math.round(core.profile.saveRate * 100)}%). זה המספר שבונה עושר, יותר מגובה ההכנסה.` });
  }
  return out;
}

export function monthsWithData(v: Vault): string[] {
  return Object.keys(v.months).filter(k => v.months[k].length).sort();
}

export { iso };
