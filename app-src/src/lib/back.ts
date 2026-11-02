// The phone's back button (and the browser's) = one step back inside the app: the newest open
// layer handles it first (a step inside a sheet, then the sheet, then the previous tab).
// One guard history entry sits above the page, so back never leaves to a blank page while
// there is still something to go back to. At the root, a second back leaves the app.

import { useEffect, useRef } from 'react';

type Handler = { seq: number; fn: () => boolean };
const handlers: Handler[] = [];
let seqN = 0;
let armed = false;
let started = false;
let canExit = true;
let onRoot: () => void = () => {};

function arm() {
  if (armed || !started) return;
  try { history.pushState({ hsBack: 1 }, ''); armed = true; } catch { /* sandboxed */ }
}

function onPop() {
  armed = false;
  const list = [...handlers].sort((a, b) => b.seq - a.seq);
  for (const h of list) {
    let done = false;
    try { done = h.fn(); } catch { /* keep going */ }
    if (done) { arm(); return; }
  }
  // Nothing left to close. Inside a frame (the Claude version) never leave; on the web,
  // say once that the next back closes the app.
  if (!canExit) { arm(); return; }
  onRoot();
}

/** Call once at startup. */
export function startBack(opts: { canExit: boolean; onRoot?: () => void }) {
  if (started) return;
  started = true;
  canExit = opts.canExit;
  if (opts.onRoot) onRoot = opts.onRoot;
  window.addEventListener('popstate', onPop);
  arm();
}

/** Re-arm after the user moved away from the root (opened something, switched tab). */
export const armBack = arm;

/**
 * Registers a back step while `active`. `fn` returns true when it handled the press.
 * Later-rendered components (children, sheets opened later) get the press first.
 */
export function useBack(fn: () => boolean, active = true) {
  const seq = useRef(0);
  if (!seq.current) seq.current = ++seqN;
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    if (!active) return;
    const h: Handler = { seq: seq.current, fn: () => f.current() };
    handlers.push(h);
    arm();
    return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
  }, [active]);
}

/** A short message that works outside the app shell too (the lock screen). */
export function flash(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
