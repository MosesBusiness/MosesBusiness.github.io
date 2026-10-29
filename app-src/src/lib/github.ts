// Cloud copy of the vault in the user's own private GitHub repository, so clearing the browser
// never loses data. Only encrypted documents (and the wrapped-key meta) ever leave the device:
// each is one file vault/<docId>.json. Talks to the GitHub REST API directly from the browser.

import { Backend } from './store';
import { b64, unb64 } from './crypto';

export interface SyncCfg { owner: string; repo: string; token: string; on: boolean }
export type SyncState = { state: 'off' | 'syncing' | 'ok' | 'error'; at?: number; msg?: string };

const API = 'https://api.github.com';
const DIR = 'vault';
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- status shared with the UI ----
let status: SyncState = { state: 'off' };
const subs = new Set<(s: SyncState) => void>();
export const syncStatus = () => status;
export function onSyncStatus(fn: (s: SyncState) => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
function setStatus(s: SyncState) {
  status = s;
  if (s.state === 'ok' && s.at) { try { localStorage.setItem('hs:lastSync', String(s.at)); } catch { /* ignore */ } }
  subs.forEach(f => f(s));
}
export function lastSyncAt(): number | null { try { return Number(localStorage.getItem('hs:lastSync')) || null; } catch { return null; } }

export function parseRepo(s: string): { owner: string; repo: string } | null {
  const m = s.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export class SyncError extends Error {
  constructor(public code: 'auth' | 'notfound' | 'public' | 'readonly' | 'network' | 'other', msg: string) { super(msg); }
}

export function syncMessage(e: unknown): string {
  const code = e instanceof SyncError ? e.code : 'network';
  return {
    auth: 'הטוקן לא תקף או שפג תוקפו. צריך ליצור טוקן חדש ולהזין אותו בהגדרות.',
    notfound: 'המאגר לא נמצא, או שהטוקן לא מורשה אליו.',
    public: 'המאגר ציבורי. הגיבוי נשמר רק במאגר פרטי.',
    readonly: 'לטוקן אין הרשאת כתיבה (Contents: Read and write).',
    network: 'אין חיבור לענן כרגע. הנתונים שמורים בטלפון ויגובו כשהחיבור יחזור.',
    other: 'הגיבוי לענן נכשל. ננסה שוב בעוד רגע.',
  }[code];
}

async function call(cfg: SyncCfg, path: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('network', 'network');
  }
  if (r.status === 401) throw new SyncError('auth', 'auth');
  return r;
}

/** Checks the repository is reachable, private and writable with this token. */
export async function testRepo(cfg: SyncCfg): Promise<void> {
  const r = await call(cfg, '');
  if (r.status === 404 || r.status === 403) throw new SyncError('notfound', 'notfound');
  if (!r.ok) throw new SyncError('other', String(r.status));
  const j = await r.json();
  if (!j.private) throw new SyncError('public', 'public');
  if (j.permissions && j.permissions.push === false) throw new SyncError('readonly', 'readonly');
}

const toB64 = (obj: unknown) => b64(enc.encode(JSON.stringify(obj)));
const fromB64 = (s: string) => JSON.parse(dec.decode(unb64(s.replace(/\s/g, ''))));

/** All vault documents in the repository, with their file shas. */
export async function pullAll(cfg: SyncCfg): Promise<{ docs: Record<string, any>; shas: Record<string, string> }> {
  const r = await call(cfg, `/contents/${DIR}`);
  if (r.status === 404) return { docs: {}, shas: {} };
  if (!r.ok) throw new SyncError(r.status === 403 ? 'notfound' : 'other', String(r.status));
  const list: { name: string; sha: string; type: string }[] = await r.json();
  const docs: Record<string, any> = {}, shas: Record<string, string> = {};
  await Promise.all(list.filter(f => f.type === 'file' && f.name.endsWith('.json')).map(async f => {
    const id = f.name.slice(0, -5);
    const fr = await call(cfg, `/contents/${DIR}/${f.name}`);
    if (!fr.ok) throw new SyncError('other', String(fr.status));
    const j = await fr.json();
    docs[id] = fromB64(j.content);
    shas[id] = j.sha;
  }));
  return { docs, shas };
}

/**
 * Keeps the repository in step with local writes. One upload in flight per document,
 * the latest value wins; a stale sha (the file changed elsewhere) is refreshed and retried.
 */
export class CloudMirror {
  private pending = new Map<string, Record<string, unknown> | null>();
  private running = new Set<string>();
  private timer: any = 0;

  constructor(public cfg: SyncCfg, private shas: Record<string, string> = {}) {}

  enqueue(id: string, data: Record<string, unknown> | null) {
    this.pending.set(id, data);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.drain(), 1200);
  }

  async flush() { clearTimeout(this.timer); await this.drain(); }

  private async drain() {
    const ids = [...this.pending.keys()].filter(id => !this.running.has(id));
    if (!ids.length) return;
    setStatus({ state: 'syncing', at: status.at });
    try {
      await Promise.all(ids.map(id => this.upload(id)));
      if (!this.pending.size) setStatus({ state: 'ok', at: Date.now() });
    } catch (e) {
      setStatus({ state: 'error', at: status.at, msg: syncMessage(e) });
      // try again later; the latest local value is still queued
      this.timer = setTimeout(() => this.drain(), 60_000);
    }
  }

  private async upload(id: string) {
    this.running.add(id);
    try {
      while (this.pending.has(id)) {
        const data = this.pending.get(id)!;
        this.pending.delete(id);
        try {
          await this.write(id, data);
        } catch (e) {
          if (!this.pending.has(id)) this.pending.set(id, data);
          throw e;
        }
      }
    } finally {
      this.running.delete(id);
    }
  }

  private async write(id: string, data: Record<string, unknown> | null, retried = false): Promise<void> {
    const path = `/contents/${DIR}/${id}.json`;
    const sha = this.shas[id];
    let r: Response;
    if (data === null) {
      if (!sha) return;
      r = await call(this.cfg, path, { method: 'DELETE', body: JSON.stringify({ message: 'הסרה', sha }) });
      if (r.ok || r.status === 404) { delete this.shas[id]; return; }
    } else {
      r = await call(this.cfg, path, { method: 'PUT', body: JSON.stringify({ message: 'עדכון מוצפן', content: toB64(data), ...(sha ? { sha } : {}) }) });
      if (r.ok) { this.shas[id] = (await r.json()).content.sha; return; }
    }
    if ((r.status === 409 || r.status === 422) && !retried) {
      const g = await call(this.cfg, path);
      if (g.ok) this.shas[id] = (await g.json()).sha; else delete this.shas[id];
      return this.write(id, data, true);
    }
    if (r.status === 404 || r.status === 403) throw new SyncError('notfound', String(r.status));
    throw new SyncError('other', String(r.status));
  }
}

/** A local backend whose writes are also sent to the cloud copy. */
export function mirrored(local: Backend, mirror: CloudMirror): Backend {
  return {
    kind: local.kind,
    getAll: () => local.getAll(),
    async put(id, data) { await local.put(id, data); mirror.enqueue(id, data); },
    async del(id) { await local.del(id); mirror.enqueue(id, null); },
    watch: local.watch,
  };
}

const stamp = (d: any) => (typeof d?.at === 'number' ? d.at : 0);

/**
 * Two-way reconcile: newer document wins (by its `at` stamp; meta, which has none, prefers the
 * local copy). Writes the winners locally, uploads the local winners. Returns the mirror.
 */
export async function reconcile(local: Backend, cfg: SyncCfg): Promise<{ mirror: CloudMirror; changedLocal: boolean }> {
  setStatus({ state: 'syncing', at: status.at });
  const [{ docs: remote, shas }, mine] = await Promise.all([pullAll(cfg), local.getAll()]);
  const mirror = new CloudMirror(cfg, shas);
  let changedLocal = false;
  const ids = new Set([...Object.keys(remote), ...Object.keys(mine)]);
  for (const id of ids) {
    const r = remote[id], l = mine[id];
    if (r && !l) { await local.put(id, r); changedLocal = true; }
    else if (l && !r) mirror.enqueue(id, l);
    else if (id === 'meta') { if (JSON.stringify(r) !== JSON.stringify(l)) mirror.enqueue(id, l); }
    else if (stamp(r) > stamp(l)) { await local.put(id, r); changedLocal = true; }
    else if (stamp(l) > stamp(r)) mirror.enqueue(id, l);
  }
  await mirror.flush();
  setStatus({ state: 'ok', at: Date.now() });
  return { mirror, changedLocal };
}

/** First-time setup: upload every local document. */
export async function uploadAll(local: Backend, cfg: SyncCfg): Promise<CloudMirror> {
  return (await reconcile(local, cfg)).mirror;
}

export function markSyncError(e: unknown) { setStatus({ state: 'error', at: status.at, msg: syncMessage(e) }); }
