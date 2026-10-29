// Money, time-lens and date formatting (Hebrew, shekels).

export interface Lens { mode: 'money' | 'time'; hourly: number; hours: number }

const nf0 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function num(n: number, digits = 0): string {
  if (!isFinite(n)) return '–';
  return digits === 0 ? nf0.format(Math.round(n)) : digits === 1 ? nf1.format(n) : nf2.format(n);
}

/** ₪1,234 — cents only for small non-round amounts. */
export function ils(n: number, opts: { sign?: boolean; cents?: boolean } = {}): string {
  if (!isFinite(n)) return '–';
  const abs = Math.abs(n);
  const cents = opts.cents ?? (abs < 100 && Math.round(abs * 100) % 100 !== 0);
  const body = cents ? nf2.format(abs) : nf0.format(Math.round(abs));
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}₪${body}`;
}

/** Compact: ₪12.4K, ₪1.2M */
export function ilsCompact(n: number): string {
  const abs = Math.abs(n), sign = n < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}₪${nf1.format(abs / 1e6)}M`;
  if (abs >= 1e4) return `${sign}₪${nf1.format(abs / 1e3)}K`;
  return ils(n);
}

/** Money as working time: minutes, hours, work days, work months, work years. */
export function asTime(n: number, lens: Lens): string {
  if (!lens.hourly) return ils(n);
  const sign = n < 0 ? '−' : '';
  const h = Math.abs(n) / lens.hourly;
  const perDay = lens.hours / 21.67;
  if (h < 1) return `${sign}${Math.max(1, Math.round(h * 60))} דק׳`;
  if (h < perDay * 1.5) return `${sign}${nf1.format(h)} שע׳`;
  const days = h / perDay;
  if (days < 21.67 * 1.5) return `${sign}${nf1.format(days)} ימי עבודה`;
  const months = days / 21.67;
  if (months < 18) return `${sign}${nf1.format(months)} חודשי עבודה`;
  return `${sign}${nf1.format(months / 12)} שנות עבודה`;
}

export function money(n: number, lens: Lens, opts: { sign?: boolean } = {}): string {
  return lens.mode === 'time' && lens.hourly > 0 ? asTime(n, lens) : ils(n, opts);
}

export function pct(x: number, digits = 0): string {
  if (!isFinite(x)) return '–';
  return `${(x * 100).toFixed(digits)}%`;
}

// ---- dates ----
export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => iso(new Date());
export const ymOf = (isoDate: string) => isoDate.slice(0, 7);
export function parseISO(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
export function addDays(s: string, n: number): string { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
export function daysBetween(a: string, b: string): number { return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000); }
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const daysInMonth = (y: number, m1: number) => new Date(y, m1, 0).getDate();

const dfDay = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const dfShort = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' });
const dfMonth = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });
const dfMonthShort = new Intl.DateTimeFormat('he-IL', { month: 'short' });
let dfHeb: Intl.DateTimeFormat | null = null;
try { dfHeb = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { dfHeb = null; }

/** Gematria: 17 -> י״ז, 5787 -> תשפ״ז (thousands dropped, as on calendars). */
export function hebNum(n: number): string {
  n = n % 1000;
  const H = [['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'], ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']];
  const h = Math.floor(n / 100), rest = n % 100;
  let s = H[0][h];
  if (rest === 15) s += 'טו'; else if (rest === 16) s += 'טז';
  else s += H[1][Math.floor(rest / 10)] + H[2][rest % 10];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

export const fmtDay = (s: string) => dfDay.format(parseISO(s));
export const fmtShort = (s: string) => dfShort.format(parseISO(s));
export const fmtMonth = (ym: string) => dfMonth.format(parseISO(ym + '-01'));
export const fmtMonthShort = (ym: string) => dfMonthShort.format(parseISO(ym + '-01'));
export function fmtHebrewDate(d = new Date()): string {
  if (!dfHeb) return '';
  try {
    const parts = dfHeb.formatToParts(d);
    const day = Number(parts.find(p => p.type === 'day')?.value);
    const year = Number(parts.find(p => p.type === 'year')?.value);
    const month = parts.find(p => p.type === 'month')?.value || '';
    if (!day || !year || !month) return dfHeb.format(d);
    return `${hebNum(day)} ב${month.replace(/^ב/, '')} ${hebNum(year)}`;
  } catch { return ''; }
}

export function relDay(s: string): string {
  const diff = daysBetween(s, todayISO());
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  if (diff === 2) return 'שלשום';
  return fmtDay(s);
}

export function greeting(h = new Date().getHours()): string {
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}
