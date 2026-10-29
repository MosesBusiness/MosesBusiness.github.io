// Sample data to explore the app. Every item is flagged demo:1 and can be removed in one tap.

import { Core, Holding, Recurring, Tx, Vault, uid, Bucket } from './model';
import { addDays, addMonths, iso, pad, todayISO, ymOf, daysInMonth } from './format';

function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function makeDemo(core: Core): { months: Record<string, Tx[]>; core: Core } {
  const rnd = seeded(42);
  const today = todayISO();
  const txs: Tx[] = [];
  const add = (t: Tx['t'], a: number, c: string, d: string, n?: string, extra: Partial<Tx> = {}) => {
    if (d > today) return;
    txs.push({ id: uid(), t, a: Math.round(a * 10) / 10, c, d, n, ts: Date.now(), demo: 1, ...extra });
  };
  const startYm = addMonths(ymOf(today), -3);
  const startDate = `${startYm}-01`;

  const recurring: Recurring[] = [
    { id: uid(), t: 'income', a: 18600, c: 'salary', n: 'משכורת', day: 9, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 5200, c: 'housing', n: 'שכר דירה', day: 1, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 59, c: 'comms', n: 'פרטנר', day: 12, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 109, c: 'comms', n: 'הוט אינטרנט', day: 14, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 54.9, c: 'subs', n: 'Netflix', day: 18, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 23.9, c: 'subs', n: 'Spotify', day: 21, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 219, c: 'sport', n: 'הולמס פלייס', day: 5, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'expense', a: 186, c: 'insurance', n: 'ביטוח בריאות', day: 15, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'save', a: 1500, c: 'b_emergency', n: 'הפקדה חודשית', day: 10, start: startDate, active: true, demo: 1 },
    { id: uid(), t: 'save', a: 1800, c: 'b_invest', n: 'קרן מחקה S&P 500', day: 10, start: startDate, active: true, demo: 1 },
  ];
  // Post the recurring items for past months, the way the app does on open.
  for (const r of recurring) {
    let ym = startYm;
    while (ym <= ymOf(today)) {
      const [y, m] = ym.split('-').map(Number);
      add(r.t, r.a, r.c, `${ym}-${pad(Math.min(r.day, daysInMonth(y, m)))}`, r.n, { r: r.id });
      r.last = ym;
      ym = addMonths(ym, 1);
    }
    // Leave this month's not-yet-due items unposted.
    const [y, m] = ymOf(today).split('-').map(Number);
    if (`${ymOf(today)}-${pad(Math.min(r.day, daysInMonth(y, m)))}` > today) r.last = addMonths(ymOf(today), -1);
  }

  const groceries = ['שופרסל דיל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'מאפיית השכונה', 'ירקן'];
  const coffee = ['ארומה', 'קפה גרג', 'לנדוור', 'קפה קפה'];
  const food = ['Wolt', 'תן ביס', 'פיצה האט', 'סושי בר'];
  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    const dow = new Date(d).getDay();
    if (dow === 5 || (dow === 2 && rnd() > 0.5)) add('expense', 240 + rnd() * 340, 'food', d, groceries[Math.floor(rnd() * groceries.length)]);
    if (rnd() > 0.6) add('expense', 14 + rnd() * 20, 'dining', d, coffee[Math.floor(rnd() * coffee.length)], { nw: 'want' });
    if (rnd() > 0.82) add('expense', 70 + rnd() * 90, 'dining', d, food[Math.floor(rnd() * food.length)], { nw: 'want' });
    if (rnd() > 0.9) add('expense', 240 + rnd() * 90, 'transport', d, rnd() > 0.5 ? 'פז' : 'סונול');
    if (rnd() > 0.93) add('expense', 12 + rnd() * 30, 'transport', d, 'פנגו חניה');
    if (rnd() > 0.95) add('expense', 50 + rnd() * 140, 'health', d, 'סופר-פארם');
    if (rnd() > 0.965) add('expense', 90 + rnd() * 160, 'fun', d, rnd() > 0.5 ? 'יס פלאנט' : 'הופעה');
    if (rnd() > 0.975) add('expense', 150 + rnd() * 300, 'clothing', d, rnd() > 0.5 ? 'זארה' : 'קסטרו', { nw: 'want' });
    if (rnd() > 0.98) add('expense', 120 + rnd() * 220, 'gifts', d, 'מתנה ליום הולדת');
    if (rnd() > 0.985) add('expense', 200 + rnd() * 500, 'home', d, 'איקאה');
  }
  // Bi-monthly bills.
  for (let i = 0; i < 4; i++) {
    const ym = addMonths(startYm, i);
    if (i % 2 === 0) { add('expense', 420 + rnd() * 120, 'bills', `${ym}-17`, 'חברת החשמל'); add('expense', 640, 'bills', `${ym}-03`, 'ארנונה'); }
    else add('expense', 160 + rnd() * 40, 'bills', `${ym}-22`, 'תאגיד המים');
  }
  // Opening balances, so buckets and freedom days look lived-in.
  add('save', 16500, 'b_emergency', startDate, 'יתרת פתיחה');
  add('save', 38000, 'b_invest', startDate, 'יתרת פתיחה');
  const trip: Bucket = { id: 'b_demo_trip', name: 'טיול ליפן', icon: 'plane', kind: 'goal', start: 0, target: 24000, deadline: addMonths(ymOf(today), 10), created: Date.now(), demo: 1 };
  add('save', 6200, trip.id, startDate, 'יתרת פתיחה');
  for (let i = 0; i < 3; i++) add('save', 700, trip.id, `${addMonths(startYm, i + 1)}-11`, 'הפקדה');

  const holdings: Holding[] = [
    { id: uid(), name: 'עו"ש בבנק', kind: 'asset', sub: 'checking', value: 9400, updated: Date.now(), demo: 1 },
    { id: uid(), name: 'קרן פנסיה', kind: 'asset', sub: 'pension', value: 186000, updated: Date.now(), demo: 1 },
    { id: uid(), name: 'קרן השתלמות', kind: 'asset', sub: 'hishtalmut', value: 64000, updated: Date.now(), demo: 1 },
    { id: uid(), name: 'הלוואת רכב', kind: 'debt', sub: 'loan', value: 21500, updated: Date.now(), demo: 1 },
  ];

  const months: Record<string, Tx[]> = {};
  for (const t of txs) (months[ymOf(t.d)] ||= []).push(t);
  const next: Core = {
    ...core,
    profile: core.profile.income ? core.profile : { ...core.profile, income: 18600 },
    recurring: [...core.recurring, ...recurring],
    buckets: [...core.buckets, trip],
    holdings: [...core.holdings, ...holdings],
    budgets: { dining: 900, ...core.budgets },
  };
  return { months, core: next };
}

export function stripDemo(v: Vault): Vault {
  const months: Record<string, Tx[]> = {};
  for (const [k, list] of Object.entries(v.months)) months[k] = list.filter(t => !t.demo);
  const c = v.core;
  return {
    months,
    core: {
      ...c,
      recurring: c.recurring.filter(r => !r.demo),
      buckets: c.buckets.filter(b => !b.demo),
      holdings: c.holdings.filter(h => !h.demo),
    },
  };
}

export const hasDemo = (v: Vault) => Object.values(v.months).some(l => l.some(t => t.demo)) || v.core.holdings.some(h => h.demo);

export { iso };
