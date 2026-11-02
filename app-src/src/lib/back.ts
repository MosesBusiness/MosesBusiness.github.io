// The phone's back button (and the browser's) = one step back inside the app: the newest open
// layer handles it first (a step inside a sheet, then the sheet, then the previous tab).
// On the main screen, the first back says that the next one leaves.
//
// Where the browser has CloseWatcher (Chrome/Android 120+), back is caught without touching
// history at all, so it can never navigate away. Elsewhere, history entries are used, added
// only right after a tap: Chrome's back button skips every entry of a page that added history
// without a user action, which used to send back past the app to an empty black page.

import { useEffect, useRef } from 'react';

type Handler = { seq: number; fn: () => boolean; steps: number; w?: any };
const handlers: Handler[] = [];
let seqN = 0;
let started = false;
let canExit = true;
let onRoot: () => void = () => {};
let lastTap = 0;

const CW: any = typeof window !== 'undefined' ? (window as any).CloseWatcher : undefined;
/** True when back and Escape are handled by CloseWatcher (sheets then need no Escape listener). */
export const closeWatchers = typeof CW === 'function';

const open = () => handlers.filter(h => h.steps > 0);
const newest = () => open().sort((a, b) => b.seq - a.seq)[0];

function handle(h: Handler | undefined) {
  if (!h) return false;
  try { return h.fn(); } catch { return false; }
}

// ---------- CloseWatcher mode ----------
let rootW: any = null;
let hinted = false;

function watch(h: Handler) {
  if (h.w) return;
  try {
    const w = new CW();
    w.onclose = () => {
      if (h.w !== w) return;
      h.w = null;
      handle(newest());
      // A step inside a layer that stays open: keep catching back for it.
      setTimeout(() => { if (handlers.includes(h) && h.steps > 0) watch(h); syncRoot(); }, 150);
    };
    h.w = w;
  } catch { /* not allowed right now */ }
}
function unwatch(h: Handler) { try { h.w?.destroy(); } catch { /* gone */ } h.w = null; }

// One more watcher under all layers: back on the main screen first shows a hint, then leaves.
// Inside a frame (the Claude version) it never leaves.
function syncRoot() {
  if (!closeWatchers || !started) return;
  if (!rootW && (!hinted || !canExit)) makeRoot();
}
function makeRoot() {
  try {
    const w = new CW();
    w.onclose = () => {
      if (rootW !== w) return;
      rootW = null;
      if (open().length || !canExit) { setTimeout(syncRoot, 150); return; } // closed together with a layer
      hinted = true;
      onRoot();
    };
    rootW = w;
  } catch { /* not allowed right now */ }
}

// ---------- history mode ----------
/** Our entries above the page's own entry (each stores its level in history.state.hsBack). */
let depth = 0;
let dropping = false;
const levelOf = (s: any) => (s && typeof s.hsBack === 'number' ? s.hsBack : 0);
const need = () => open().reduce((n, h) => n + h.steps, 0) + 1;

function activated(): boolean {
  const ua = (navigator as any).userActivation;
  if (ua && typeof ua.isActive === 'boolean') return ua.isActive;
  return Date.now() - lastTap < 4000;
}
function syncHistory() {
  if (closeWatchers || !started || dropping) return;
  const want = need();
  while (depth < want && activated()) {
    try { history.pushState({ hsBack: depth + 1 }, ''); depth++; } catch { return; }
  }
}
function onPop(e: PopStateEvent) {
  depth = levelOf(e.state);
  if (closeWatchers) return;
  if (dropping) { if (depth === 0) dropping = false; return; }
  if (handle(newest())) return;
  if (depth > 0) { dropping = true; history.go(-depth); }
  if (canExit) onRoot();
}

/** Brings back-catching in line with what is open now. */
export function syncBack() {
  if (closeWatchers) { for (const h of open()) watch(h); syncRoot(); } else syncHistory();
}

/** Call once at startup. */
export function startBack(opts: { canExit: boolean; onRoot?: () => void }) {
  if (started) return;
  started = true;
  canExit = opts.canExit;
  if (opts.onRoot) onRoot = opts.onRoot;
  depth = levelOf(history.state);
  window.addEventListener('popstate', onPop);
  const tap = (e: Event) => {
    if (!e.isTrusted || (e as KeyboardEvent).key === 'Escape') return; // Escape is a back press, not a tap
    lastTap = Date.now();
    hinted = false;
    syncBack();
    setTimeout(syncBack, 0);
    setTimeout(syncBack, 120);
  };
  for (const t of ['click', 'keydown', 'touchend', 'pointerup']) window.addEventListener(t, tap, { capture: true, passive: true });
  syncBack();
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
      setTimeout(syncRoot, 0);
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
