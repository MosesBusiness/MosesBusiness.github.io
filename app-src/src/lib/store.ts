// Storage backends. Cloud = the artifact's private per-person database (data/users/<id>/...),
// local = this browser only. Both only ever see encrypted blobs, except the meta record
// that holds the wrapped key and its salts.

import { cap } from './claude';
import { Meta, Sealed, seal, unseal } from './crypto';
import { Core, Tx, Vault } from './model';

export interface Backend {
  kind: 'cloud' | 'local';
  getAll(): Promise<Record<string, any>>;
  put(id: string, data: Record<string, unknown>): Promise<void>;
  del(id: string): Promise<void>;
  watch?(cb: (id: string, data: any | null) => void): () => void;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e: any) {
    if (e?.code === 'unavailable') { await sleep(400 + Math.random() * 600); return fn(); }
    throw e;
  }
}

function cloudBackend(db: any, userId: string): Backend {
  const base = `data/users/${userId}`;
  return {
    kind: 'cloud',
    async getAll() {
      const snap = await retry(() => db.collection(base).limit(1000).get()) as any;
      const out: Record<string, any> = {};
      for (const d of snap.docs) if (d.exists) out[d.id] = d.data();
      return out;
    },
    put: (id, data) => retry(() => db.doc(`${base}/${id}`).set(data)),
    del: id => retry(() => db.doc(`${base}/${id}`).delete()),
    watch(cb) {
      return db.collection(base).limit(1000).onSnapshot((snap: any) => {
        for (const ch of snap.docChanges()) {
          if (ch.doc.metadata?.hasPendingWrites) continue;
          cb(ch.doc.id, ch.type === 'removed' ? null : ch.doc.data());
        }
      }, () => {});
    },
  };
}

function localBackend(): Backend {
  const mem = new Map<string, string>();
  const P = 'hs1:';
  const ls = (() => { try { const k = '__hs_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { return null; } })();
  return {
    kind: 'local',
    async getAll() {
      const out: Record<string, any> = {};
      if (ls) {
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i)!;
          if (k.startsWith(P)) { try { out[k.slice(P.length)] = JSON.parse(ls.getItem(k)!); } catch { /* skip */ } }
        }
      } else {
        mem.forEach((v, k) => { out[k] = JSON.parse(v); });
      }
      return out;
    },
    async put(id, data) {
      const s = JSON.stringify(data);
      if (ls) { try { ls.setItem(P + id, s); return; } catch { /* quota: fall through */ } }
      mem.set(id, s);
    },
    async del(id) {
      try { ls?.removeItem(P + id); } catch { /* ignore */ }
      mem.delete(id);
    },
  };
}

export async function connect(): Promise<Backend> {
  const [db, user] = await Promise.all([cap('db'), cap('user')]);
  if (db && user) {
    try {
      const id = await user.id();
      if (id) return cloudBackend(db, id);
    } catch { /* fall back */ }
  }
  return localBackend();
}

export const monthDoc = (ym: string) => `tx-${ym}`;
const WRITER = Math.random().toString(36).slice(2, 10);

/** Serialized, coalesced writes: one in flight per document, the latest value wins. */
export class VaultIO {
  private inflight = new Set<string>();
  private pending = new Map<string, () => Promise<Record<string, unknown> | null>>();
  private known = new Map<string, number>();
  onError: (e: any) => void = () => {};
  onIdle: () => void = () => {};

  readonly local: Backend;
  constructor(public backend: Backend, private dek: CryptoKey) { this.local = backend; }

  /** Route writes through a wrapper (the cloud mirror), or back to the plain local backend. */
  setBackend(b: Backend | null) { this.backend = b || this.local; }

  get busy() { return this.inflight.size > 0 || this.pending.size > 0; }

  static async load(backend: Backend, dek: CryptoKey, docs: Record<string, any>): Promise<{ vault: Vault | null; io: VaultIO }> {
    const io = new VaultIO(backend, dek);
    let core: Core | null = null;
    const months: Record<string, Tx[]> = {};
    for (const [id, doc] of Object.entries(docs)) {
      if (!doc?.ct) continue;
      if (id === 'core') core = await unseal<Core>(dek, id, doc as Sealed);
      else if (id.startsWith('tx-')) months[id.slice(3)] = await unseal<Tx[]>(dek, id, doc as Sealed);
      io.known.set(id, doc.at || 0);
    }
    return { vault: core ? { core, months } : null, io };
  }

  saveCore(core: Core) { this.queue('core', () => this.pack('core', core)); }

  saveMonth(ym: string, txs: Tx[]) {
    const id = monthDoc(ym);
    this.queue(id, async () => (txs.length ? this.pack(id, txs) : null));
  }

  async saveMeta(meta: Meta) { await this.backend.put('meta', meta as any); }

  private async pack(id: string, value: unknown) {
    const s = await seal(this.dek, id, value);
    const at = Date.now();
    this.known.set(id, at);
    return { ...s, w: WRITER, at };
  }

  private queue(id: string, make: () => Promise<Record<string, unknown> | null>) {
    this.pending.set(id, make);
    if (!this.inflight.has(id)) void this.flush(id);
  }

  private async flush(id: string) {
    this.inflight.add(id);
    while (this.pending.has(id)) {
      const make = this.pending.get(id)!;
      this.pending.delete(id);
      try {
        const data = await make();
        if (data) await this.backend.put(id, data);
        else await this.backend.del(id);
      } catch (e) {
        this.onError(e);
      }
    }
    this.inflight.delete(id);
    if (!this.busy) this.onIdle();
  }

  /** Changes written by another device. Calls back with decrypted values. */
  watch(cb: (id: string, value: any | null) => void): () => void {
    if (!this.backend.watch) return () => {};
    return this.backend.watch(async (id, doc) => {
      if (id === 'meta') return;
      if (doc && (doc.w === WRITER || (this.known.get(id) || 0) >= (doc.at || 0))) return;
      if (this.pending.has(id) || this.inflight.has(id)) return;
      try {
        if (!doc) { this.known.delete(id); cb(id, null); return; }
        const val = await unseal<any>(this.dek, id, doc as Sealed);
        this.known.set(id, doc.at || Date.now());
        cb(id, val);
      } catch { /* ignore blobs we can't open */ }
    });
  }
}

// Lockout after repeated wrong passcodes. Kept per browser; the strong KDF is the real barrier.
const LK = 'hs:lockout';
export function lockoutState(): { fails: number; until: number } {
  try { return JSON.parse(localStorage.getItem(LK) || '') || { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; }
}
export function recordFail(): { fails: number; until: number } {
  const s = lockoutState();
  s.fails += 1;
  if (s.fails >= 5) s.until = Date.now() + Math.min(30_000 * 2 ** (s.fails - 5), 30 * 60_000);
  try { localStorage.setItem(LK, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}
export function clearFails() { try { localStorage.removeItem(LK); } catch { /* ignore */ } }
