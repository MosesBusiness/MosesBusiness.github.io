// The daily market feed, written by Claude's scheduled research run into the shared `feed` path.
// Read-only for the app. Absent when the app is opened outside Claude.

import { cap } from './claude';
import { BASE, WEB } from './env';

export interface Source { label: string; url: string }
export interface Pick {
  ticker: string; name: string; sector?: string; stars: number;
  price?: number | null; currency?: string; priceAsOf?: string;
  target?: number | null; upside?: number | null; consensus?: string;
  criteria?: Partial<Record<'consensus' | 'upside' | 'momentum' | 'quality' | 'smartMoney', boolean>>;
  thesis?: string; risk?: string; sources?: Source[];
}
export interface MarketItem { key: string; label?: string; value: number | null; unit?: string; changePct?: number | null; asOf?: string; source?: string }
export interface ScannerStatus {
  phase?: string; phaseName?: string; phaseDates?: string; isLive?: boolean;
  pickToday?: { ticker?: string | null; note?: string; agreement?: number; n_sources?: number } | null;
  liveHit1?: number | null; liveHit5?: number | null; liveN?: number;
  oosHit1?: number | null; oosHit5?: number | null; oosN?: number; oosPeriod?: string;
  topSources?: { name: string; type: string; hit: number; n: number }[];
  lesson?: string; updated?: string;
}
export interface Feed {
  asOf: string; updatedAt?: string; marketNote?: string; method?: string;
  picks: Pick[]; avoid?: { ticker: string; name?: string; reason: string; sources?: Source[] }[];
  market?: MarketItem[]; scanner?: ScannerStatus; facts?: Record<string, string>;
}
export interface TrackRow { date: string; ticker: string; stars: number; entry: number; last?: number | null; ret?: number | null; spy?: number | null; closed?: boolean }
export interface Track { updatedAt?: string; rows: TrackRow[]; summary?: { n: number; avgRet?: number | null; avgSpy?: number | null; beat?: number | null } }

export async function watchFeed(onFeed: (f: Feed | null) => void, onTrack: (t: Track | null) => void): Promise<() => void> {
  if (WEB) return watchFile(onFeed, onTrack);
  const db = await cap<any>('db');
  if (!db) { onFeed(null); onTrack(null); return () => {}; }
  const u1 = db.doc('feed/today').onSnapshot((s: any) => onFeed(s.exists ? (s.data() as Feed) : null), () => onFeed(null));
  const u2 = db.doc('feed/track').onSnapshot((s: any) => onTrack(s.exists ? (s.data() as Track) : null), () => onTrack(null));
  return () => { u1(); u2(); };
}

/** Web app: the daily feed is a static file next to the app; keep the last good copy for offline use. */
function watchFile(onFeed: (f: Feed | null) => void, onTrack: (t: Track | null) => void): () => void {
  const KEY = 'hs:feed';
  let have = false;
  const apply = (o: any) => { if (o?.today?.picks) { have = true; onFeed(o.today); onTrack(o.track || null); } };
  try { apply(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { /* no cache */ }
  const load = async () => {
    try {
      const r = await fetch(BASE + 'feed.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const o = await r.json();
      apply(o);
      try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* quota */ }
    } catch {
      if (!have) { onFeed(null); onTrack(null); }
    }
  };
  void load();
  const t = setInterval(load, 30 * 60_000);
  const vis = () => { if (!document.hidden) void load(); };
  document.addEventListener('visibilitychange', vis);
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
}

/** Only plain https links from the feed are ever rendered. */
export const safeUrl = (u: unknown): string | null => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);
