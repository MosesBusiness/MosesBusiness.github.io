// The phone's back button (and the browser's) = one step back inside the app: the newest open
// layer handles it first (a step inside a sheet, then the sheet, then the previous tab).
// On the main screen, the first back says that the next one leaves.
//
// Two mechanisms, always together, because browsers route back differently:
// - CloseWatcher (Chrome 120+, Firefox 149+): back closes the newest layer without history.
//   Firefox's home-screen web apps don't route back to it, so it can't be the only one.
// - One history entry per open layer (+1 for the main screen), added ONLY during a tap.
//   Chrome's back button skips every entry of a page that added history without a user
//   action, and Firefox's skips entries the user never touched; both used to send back past
//   the app to an empty page. An entry added during a tap sits on top of the entry that was
//   current at the tap (touched), so back always lands one layer down, inside the app.

import { useEffect, useRef } from 'react';

type Handler = { seq: number; fn: () => boolean; steps: number; w?: any };
const handlers: Handler[] = [];
let seqN = 0;
let started = false;
let canExit = true;
let onRoot: () => void = () => {};
let lastTap = 0;

const CW: any = typeof window !== 'undefined' ? (window as any).CloseWatcher : undefined;
/** True when the browser has CloseWatcher (it then also turns Escape into "back"). */
export const closeWatchers = typeof CW === 'function';

const open = () => handlers.filter(h => h.steps > 0);
const newest = () => open().sort((a, b) => b.seq - a.seq)[0];
function handle(h: Handler | undefined) {
  if (!h) return false;
  try { return h.fn(); } catch { return false; }
}

// ---------- CloseWatcher ----------
function watch(h: Handler) {
  if (!closeWatchers || h.w) return;
  try {
    const w = new CW();
    w.onclose = () => {
      if (h.w !== w) return;
      h.w = null;
      handle(newest());
      // A step inside a layer that stays open: keep catching back for it.
      setTimeout(() => { if (handlers.includes(h) && h.steps > 0) watch(h); syncBack(); }, 150);
    };
    h.w = w;
  } catch { /* not allowed right now */ }
}
function unwatch(h: Handler) { try { h.w?.destroy(); } catch { /* gone */ } h.w = null; }

// ---------- history ----------
/** Our entries above the page's own entry (each stores its level in history.state.hsBack). */
let depth = 0;
/** While we pop our own extra entries: the level we're going to. */
let dropTo: number | null = null;
let trimTimer: any = 0;
const levelOf = (s: any) => (s && typeof s.hsBack === 'number' ? s.hsBack : 0);
const need = () => open().reduce((n, h) => n + h.steps, 0) + 1;

function activated(): boolean {
  const ua = (navigator as any).userActivation;
  if (ua && typeof ua.isActive === 'boolean') return ua.isActive;
  return Date.now() - lastTap < 4000;
}
let pushTimer: any = 0;
function syncHistory() {
  if (!started || dropTo !== null) return;
  const want = need();
  // Added a moment after the tap, so the browser has already marked the current entry as
  // touched (Firefox records that asynchronously; a push racing it would steal the mark).
  if (depth < want && activated() && !pushTimer) {
    pushTimer = setTimeout(() => {
      pushTimer = 0;
      if (dropTo !== null) return;
      const w = need();
      while (depth < w && activated()) {
        try { history.pushState({ hsBack: depth + 1 }, ''); depth++; } catch { return; }
      }
    }, 80);
  }
  // A layer closed without back (its X, or back taken by a CloseWatcher): drop its entry.
  if (depth > want) {
    clearTimeout(trimTimer);
    trimTimer = setTimeout(() => {
      const w = need();
      if (dropTo !== null || depth <= w) return;
      dropTo = w;
      history.go(w - depth);
    }, 60);
  }
}
function onPop(e: PopStateEvent) {
  depth = levelOf(e.state);
  if (dropTo !== null) {
    if (depth <= dropTo) { dropTo = null; syncHistory(); }
    return;
  }
  if (handle(newest())) return;
  // Nothing open: say once that the next back leaves (inside a frame, never leave).
  if (!canExit) { syncHistory(); return; }
  if (depth > 0) { dropTo = 0; history.go(-depth); }
  onRoot();
}

/** Brings back-catching in line with what is open now. */
export function syncBack() {
  for (const h of open()) watch(h);
  syncHistory();
}

/** Call once at startup. */
export function startBack(opts: { canExit: boolean; onRoot?: () => void }) {
  if (started) return;
  started = true;
  canExit = opts.canExit;
  if (opts.onRoot) onRoot = opts.onRoot;
  depth = levelOf(history.state);
  window.addEventListener('popstate', onPop);
  // Taps are when entries may be added: during the tap and right after its handlers ran.
  const tap = (e: Event) => {
    if (!e.isTrusted || (e as KeyboardEvent).key === 'Escape') return; // Escape is a back press
    lastTap = Date.now();
    syncBack();
    setTimeout(syncBack, 0);
    setTimeout(syncBack, 120);
  };
  for (const t of ['click', 'keydown', 'touchend', 'pointerup']) window.addEventListener(t, tap, { capture: true, passive: true });
}

/**
 * Registers a back step while `steps` > 0 (true = 1). `fn` returns true when it handled the press.
 * Later-rendered components (children, sheets opened later) get the press first.
 */
export function useBack(fn: () => boolean, steps: number | boolean = true) {
  const n = typeof steps === 'number' ? Math.max(0, steps) : steps ? 1 : 0;
  const seq = useRef(0);
  if (!seq.current) seq.current = ++seqN;
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    if (!n) return;
    const h: Handler = { seq: seq.current, fn: () => f.current(), steps: n };
    handlers.push(h);
    syncBack();
    return () => {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
      unwatch(h);
      setTimeout(syncBack, 0);
    };
  }, [n]);
}

/** A short message that works outside the app shell too (the lock screen). */
export function flash(msg: string) {
  document.querySelectorAll('.toast.flash').forEach(el => el.remove());
  const el = document.createElement('div');
  el.className = 'toast flash';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
