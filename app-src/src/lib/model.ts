// Data model for the encrypted vault. Everything here lives only inside the vault.

export type TxType = 'expense' | 'income' | 'save' | 'withdraw';
export type NeedWant = 'need' | 'want';

export interface Tx {
  id: string;
  t: TxType;
  a: number;          // amount, always positive
  c: string;          // category id, or bucket id for save/withdraw
  d: string;          // YYYY-MM-DD
  n?: string;         // note / merchant
  nw?: NeedWant;      // expenses only
  r?: string;         // recurring template id that created it
  imp?: 1;            // imported from a file
  demo?: 1;           // sample data
  ts: number;         // created at (ms)
}

export interface Recurring {
  id: string;
  t: TxType;
  a: number;
  c: string;
  n?: string;
  nw?: NeedWant;
  day: number;        // day of month 1-31 (clamped to month length)
  start: string;      // YYYY-MM-DD first due date
  last?: string;      // YYYY-MM of the last month posted
  active: boolean;
  demo?: 1;
}

export type BucketKind = 'emergency' | 'invest' | 'goal';

export interface Bucket {
  id: string;
  name: string;
  icon: string;
  kind: BucketKind;
  start: number;      // balance when created
  target?: number;
  deadline?: string;  // YYYY-MM
  created: number;
  demo?: 1;
}

export type HoldingSub = 'checking' | 'pension' | 'hishtalmut' | 'property' | 'car' | 'other' | 'mortgage' | 'loan' | 'card';

export interface Holding {
  id: string;
  name: string;
  kind: 'asset' | 'debt';
  sub: HoldingSub;
  value: number;
  updated: number;
  demo?: 1;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  t: 'expense' | 'income';
  nw?: NeedWant;
  fixed?: boolean;    // housing, bills... excluded from the daily dial
  custom?: boolean;
}

export interface Profile {
  name: string;
  income: number;     // expected monthly net income
  hours: number;      // work hours per month, for the time lens
  saveRate: number;   // target share of income to keep (0-1)
  startDay: number;   // first day of the financial month (1-28)
  returnRate: number; // expected yearly return for projections
}

export interface Settings {
  lockMin: number;    // auto-lock after N minutes in the background / idle
  theme: 'system' | 'dark' | 'light';
  privacy: boolean;   // blur amounts
  lens: 'money' | 'time';
}

export interface Review { date: string; commitment: string }

export interface Core {
  v: 1;
  profile: Profile;
  settings: Settings;
  customCats: Category[];
  buckets: Bucket[];
  holdings: Holding[];
  recurring: Recurring[];
  budgets: Record<string, number>;
  merchantMap: Record<string, string>;
  reviews: Review[];
  checkins: string[];         // no-spend days
  nwHistory: { m: string; v: number }[];
  onboarded: boolean;
  createdAt: number;
  coachLog?: { q: string; a: string; at: number }[];
  lastBackup?: number;
}

export interface Vault {
  core: Core;
  months: Record<string, Tx[]>; // YYYY-MM -> transactions
}

export const EXPENSE_CATS: Category[] = [
  { id: 'food', name: 'סופר ומזון', icon: 'shopping-cart', t: 'expense', nw: 'need' },
  { id: 'dining', name: 'מסעדות וקפה', icon: 'utensils', t: 'expense', nw: 'want' },
  { id: 'transport', name: 'תחבורה ודלק', icon: 'car', t: 'expense', nw: 'need' },
  { id: 'housing', name: 'דיור', icon: 'house', t: 'expense', nw: 'need', fixed: true },
  { id: 'bills', name: 'חשבונות הבית', icon: 'zap', t: 'expense', nw: 'need', fixed: true },
  { id: 'comms', name: 'תקשורת', icon: 'smartphone', t: 'expense', nw: 'need', fixed: true },
  { id: 'subs', name: 'מנויים ודיגיטל', icon: 'tv', t: 'expense', nw: 'want', fixed: true },
  { id: 'health', name: 'בריאות', icon: 'heart-pulse', t: 'expense', nw: 'need' },
  { id: 'insurance', name: 'ביטוחים', icon: 'umbrella', t: 'expense', nw: 'need', fixed: true },
  { id: 'kids', name: 'ילדים וחינוך', icon: 'baby', t: 'expense', nw: 'need' },
  { id: 'clothing', name: 'ביגוד והנעלה', icon: 'shirt', t: 'expense', nw: 'want' },
  { id: 'home', name: 'קניות לבית', icon: 'sofa', t: 'expense', nw: 'want' },
  { id: 'fun', name: 'בילוי ופנאי', icon: 'ticket', t: 'expense', nw: 'want' },
  { id: 'care', name: 'טיפוח', icon: 'sparkles', t: 'expense', nw: 'want' },
  { id: 'sport', name: 'ספורט', icon: 'dumbbell', t: 'expense', nw: 'want' },
  { id: 'growth', name: 'לימודים והתפתחות', icon: 'graduation-cap', t: 'expense', nw: 'need' },
  { id: 'gifts', name: 'מתנות ותרומות', icon: 'gift', t: 'expense', nw: 'want' },
  { id: 'travel', name: 'חופשות', icon: 'plane', t: 'expense', nw: 'want' },
  { id: 'pets', name: 'חיות מחמד', icon: 'paw-print', t: 'expense', nw: 'need' },
  { id: 'debt', name: 'הלוואות וחובות', icon: 'credit-card', t: 'expense', nw: 'need', fixed: true },
  { id: 'business', name: 'הוצאות עסק', icon: 'briefcase', t: 'expense', nw: 'need' },
  { id: 'other', name: 'אחר', icon: 'circle-dashed', t: 'expense', nw: 'want' },
];

export const INCOME_CATS: Category[] = [
  { id: 'salary', name: 'משכורת', icon: 'banknote', t: 'income' },
  { id: 'freelance', name: 'עסק / עצמאי', icon: 'briefcase', t: 'income' },
  { id: 'bonus', name: 'בונוס', icon: 'award', t: 'income' },
  { id: 'refund', name: 'החזרים', icon: 'rotate-ccw', t: 'income' },
  { id: 'invest_inc', name: 'השקעות ודיבידנדים', icon: 'trending-up', t: 'income' },
  { id: 'rent_inc', name: 'שכירות', icon: 'building', t: 'income' },
  { id: 'allowance', name: 'קצבאות', icon: 'landmark', t: 'income' },
  { id: 'gift_inc', name: 'מתנה', icon: 'gift', t: 'income' },
  { id: 'other_inc', name: 'אחר', icon: 'circle-dashed', t: 'income' },
];

export const CUSTOM_ICONS = ['coffee', 'fuel', 'bus', 'book-open', 'music', 'palette', 'wrench', 'gem', 'flag', 'heart-pulse', 'plane', 'gift', 'coins', 'star'];

export const BUCKET_ICONS = ['shield-check', 'trending-up', 'plane', 'car', 'house', 'graduation-cap', 'gift', 'gem', 'heart-pulse', 'baby', 'flag', 'mountain'];

export const HOLDING_SUBS: { id: HoldingSub; name: string; kind: 'asset' | 'debt' }[] = [
  { id: 'checking', name: 'עו"ש ומזומן', kind: 'asset' },
  { id: 'pension', name: 'פנסיה וגמל', kind: 'asset' },
  { id: 'hishtalmut', name: 'קרן השתלמות', kind: 'asset' },
  { id: 'property', name: 'נדל"ן', kind: 'asset' },
  { id: 'car', name: 'רכב', kind: 'asset' },
  { id: 'other', name: 'נכס אחר', kind: 'asset' },
  { id: 'mortgage', name: 'משכנתא', kind: 'debt' },
  { id: 'loan', name: 'הלוואה', kind: 'debt' },
  { id: 'card', name: 'מינוס / אשראי', kind: 'debt' },
];

export const uid = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(b, x => x.toString(36).padStart(2, '0')).join('').slice(0, 14);
};

export function defaultCore(): Core {
  const now = Date.now();
  return {
    v: 1,
    profile: { name: '', income: 0, hours: 182, saveRate: 0.2, startDay: 1, returnRate: 0.07 },
    settings: { lockMin: 3, theme: 'system', privacy: false, lens: 'money' },
    customCats: [],
    buckets: [
      { id: 'b_emergency', name: 'קרן חירום', icon: 'shield-check', kind: 'emergency', start: 0, created: now },
      { id: 'b_invest', name: 'השקעות לטווח ארוך', icon: 'trending-up', kind: 'invest', start: 0, created: now },
    ],
    holdings: [],
    recurring: [],
    budgets: {},
    merchantMap: {},
    reviews: [],
    checkins: [],
    nwHistory: [],
    onboarded: false,
    createdAt: now,
  };
}

export function allCats(core: Core): Category[] {
  return [...EXPENSE_CATS, ...INCOME_CATS, ...core.customCats];
}

export function catById(core: Core, id: string): Category | undefined {
  return allCats(core).find(c => c.id === id);
}
