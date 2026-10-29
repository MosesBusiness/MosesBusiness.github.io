import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Core, Tx, Vault, uid } from './lib/model';
import { VaultIO, monthDoc } from './lib/store';
import { Lens, todayISO, ymOf } from './lib/format';
import { Feed, Track, watchFeed } from './lib/feed';
import { postRecurring, wealth } from './lib/calc';
import { guessCategory, merchantKey } from './lib/merchants';

export type Tab = 'home' | 'activity' | 'grow' | 'goals';
export interface AddPreset { t?: Tx['t']; c?: string; a?: number; edit?: Tx; n?: string }
export type Panel =
  | { k: 'add'; preset?: AddPreset }
  | { k: 'settings' } | { k: 'coach'; q?: string } | { k: 'review' } | { k: 'mastermind' } | { k: 'import' }
  | { k: 'bucket'; id?: string } | { k: 'holding'; id?: string } | { k: 'recurring' } | { k: 'budget'; cat: string }
  | { k: 'onboard' } | { k: 'security' };

interface Ctx {
  v: Vault;
  setVault: (fn: (v: Vault) => Vault) => void;
  setCore: (fn: (c: Core) => Core) => void;
  addTx: (t: Omit<Tx, 'id' | 'ts'>) => Tx;
  saveTx: (t: Tx, prev: Tx | null) => void;
  deleteTx: (t: Tx) => void;
  lens: Lens;
  privacy: boolean;
  feed: Feed | null | undefined;
  track: Track | null | undefined;
  tab: Tab; setTab: (t: Tab) => void;
  panel: Panel | null; open: (p: Panel) => void; close: () => void;
  toast: (msg: string, undo?: () => void) => void;
  lock: () => void;
  io: VaultIO;
  syncError: string | null;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;

function withTx(v: Vault, t: Tx): Vault {
  const ym = ymOf(t.d);
  return { ...v, months: { ...v.months, [ym]: [...(v.months[ym] || []), t] } };
}
function withoutTx(v: Vault, t: Tx): Vault {
  const ym = ymOf(t.d);
  const list = v.months[ym] || [];
  if (!list.some(x => x.id === t.id)) return v;
  return { ...v, months: { ...v.months, [ym]: list.filter(x => x.id !== t.id) } };
}

/** Remember the category chosen for a merchant so the next entry fills itself. */
function learn(core: Core, t: Pick<Tx, 't' | 'n' | 'c'>): Core {
  if (!t.n || (t.t !== 'expense' && t.t !== 'income')) return core;
  const key = `${t.t}:${merchantKey(t.n)}`;
  if (core.merchantMap[key] === t.c) return core;
  if (!core.merchantMap[key] && guessCategory(t.n, t.t, {}) === t.c) return core;
  return { ...core, merchantMap: { ...core.merchantMap, [key]: t.c } };
}

export function AppProvider({ initial, io, onLock, children }: { initial: Vault; io: VaultIO; onLock: () => void; children: React.ReactNode }) {
  const [v, setV] = useState<Vault>(initial);
  const prev = useRef<Vault>(initial);
  const remote = useRef(new Set<string>());
  const [tab, setTab] = useState<Tab>(() => (['home', 'activity', 'grow', 'goals'].includes(location.hash.slice(1)) ? location.hash.slice(1) as Tab : 'home'));
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toastState, setToast] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const [feed, setFeed] = useState<Feed | null | undefined>(undefined);
  const [track, setTrack] = useState<Track | null | undefined>(undefined);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Persist whatever changed: core and/or individual months, encrypted.
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (p === v) return;
    if (p.core !== v.core) {
      if (remote.current.has('core')) remote.current.delete('core'); else io.saveCore(v.core);
    }
    const keys = new Set([...Object.keys(p.months), ...Object.keys(v.months)]);
    keys.forEach(ym => {
      if (p.months[ym] === v.months[ym]) return;
      const id = monthDoc(ym);
      if (remote.current.has(id)) { remote.current.delete(id); return; }
      io.saveMonth(ym, v.months[ym] || []);
    });
  }, [v, io]);

  useEffect(() => {
    io.onError = (e: any) => setSyncError(e?.code === 'quota_exceeded' ? 'האחסון מלא. מחק נתונים ישנים או ייצא גיבוי.' : 'השמירה נכשלה. נסה שוב בעוד רגע.');
    io.onIdle = () => setSyncError(null);
    // Changes from the same vault open on another device.
    const stop = io.watch((id, value) => {
      setV(cur => {
        if (id === 'core') { if (!value) return cur; remote.current.add('core'); return { ...cur, core: value }; }
        if (id.startsWith('tx-')) {
          remote.current.add(id);
          const months = { ...cur.months };
          if (value) months[id.slice(3)] = value; else delete months[id.slice(3)];
          return { ...cur, months };
        }
        return cur;
      });
    });
    return stop;
  }, [io]);

  // Post recurring items that came due, now and when the day changes.
  useEffect(() => {
    const run = () => setV(cur => {
      const { txs, recurring } = postRecurring(cur);
      if (!txs.length && recurring.every((r, i) => r === cur.core.recurring[i])) return cur;
      let next: Vault = { ...cur, core: { ...cur.core, recurring } };
      for (const t of txs) next = withTx(next, t);
      return next;
    });
    run();
    const t = setInterval(run, 60_000 * 30);
    return () => clearInterval(t);
  }, []);

  // Keep a monthly net-worth history point.
  useEffect(() => {
    const nw = Math.round(wealth(v).netWorth);
    const m = ymOf(todayISO());
    const h = v.core.nwHistory;
    const last = h[h.length - 1];
    if (last && last.m === m && Math.abs(last.v - nw) < 1) return;
    if (!last && nw === 0) return;
    const next = last && last.m === m ? [...h.slice(0, -1), { m, v: nw }] : [...h, { m, v: nw }].slice(-120);
    setV(cur => ({ ...cur, core: { ...cur.core, nwHistory: next } }));
  }, [v.months, v.core.buckets, v.core.holdings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let stop = () => {};
    watchFeed(setFeed, setTrack).then(s => { stop = s; });
    return () => stop();
  }, []);

  useEffect(() => { try { history.replaceState(null, '', tab === 'home' ? location.pathname + location.search : '#' + tab); } catch { /* sandboxed */ } }, [tab]);

  // Theme.
  useEffect(() => {
    const th = v.core.settings.theme;
    if (th === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    try { localStorage.setItem('hs:theme', th); } catch { /* ignore */ }
  }, [v.core.settings.theme]);

  // Auto-lock: after N minutes hidden or idle.
  useEffect(() => {
    const ms = Math.max(0, v.core.settings.lockMin) * 60_000;
    let hiddenAt = 0;
    let idle = setTimeout(onLock, ms || 60_000);
    const bump = () => { clearTimeout(idle); idle = setTimeout(onLock, ms || 60_000); };
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= ms) onLock();
    };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(idle); evs.forEach(e => window.removeEventListener(e, bump)); document.removeEventListener('visibilitychange', onVis); };
  }, [v.core.settings.lockMin, onLock]);

  const toastTimer = useRef<any>(0);
  const toast = useCallback((msg: string, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, undo, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 5500 : 2600);
  }, []);

  const setVault = useCallback((fn: (v: Vault) => Vault) => setV(fn), []);
  const setCore = useCallback((fn: (c: Core) => Core) => setV(cur => ({ ...cur, core: fn(cur.core) })), []);

  const addTx = useCallback((t: Omit<Tx, 'id' | 'ts'>) => {
    const tx: Tx = { ...t, id: uid(), ts: Date.now() };
    setV(cur => ({ ...withTx(cur, tx), core: learn(cur.core, tx) }));
    return tx;
  }, []);
  const saveTx = useCallback((t: Tx, prevTx: Tx | null) => {
    setV(cur => {
      let next = prevTx ? withoutTx(cur, prevTx) : cur;
      if (prevTx && ymOf(prevTx.d) === ymOf(t.d)) {
        const ym = ymOf(t.d);
        next = { ...cur, months: { ...cur.months, [ym]: (cur.months[ym] || []).map(x => (x.id === t.id ? t : x)) } };
      } else next = withTx(next, t);
      return { ...next, core: learn(next.core, t) };
    });
  }, []);
  const deleteTx = useCallback((t: Tx) => {
    setV(cur => withoutTx(cur, t));
    toast('התנועה נמחקה', () => setV(cur => withTx(cur, t)));
  }, [toast]);

  const lens: Lens = useMemo(() => {
    const p = v.core.profile;
    return { mode: v.core.settings.lens, hourly: p.income > 0 && p.hours > 0 ? p.income / p.hours : 0, hours: p.hours };
  }, [v.core.settings.lens, v.core.profile]);

  const ctx: Ctx = {
    v, setVault, setCore, addTx, saveTx, deleteTx, lens, privacy: v.core.settings.privacy,
    feed, track, tab, setTab, panel, open: setPanel, close: useCallback(() => setPanel(null), []), toast, lock: onLock, io, syncError,
  };

  return (
    <C.Provider value={ctx}>
      {children}
      {toastState && (
        <div className="toast" role="status" key={toastState.id}>
          <span>{toastState.msg}</span>
          {toastState.undo && <button onClick={() => { toastState.undo!(); setToast(null); }}>ביטול</button>}
        </div>
      )}
    </C.Provider>
  );
}
