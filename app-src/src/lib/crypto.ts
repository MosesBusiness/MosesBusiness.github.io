// Envelope encryption: a random data key (DEK) encrypts the vault with AES-GCM-256.
// The DEK is stored only wrapped: once by a key derived from the passcode and once
// by a key derived from the recovery code (PBKDF2-SHA256). Nothing readable leaves the device.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PASS_ITER = 600_000;
export const REC_ITER = 210_000;

export function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export interface Wrapped { iv: string; ct: string }
export interface Sealed { iv: string; ct: string }
export interface Meta {
  v: 1;
  created: number;
  pass: { salt: string; iter: number; w: Wrapped };
  rec: { salt: string; iter: number; w: Wrapped };
}

export async function deriveKEK(secret: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const DEK_AAD = enc.encode('hon-shaket/dek/v1');

async function wrapRaw(raw: Uint8Array, kek: CryptoKey): Promise<Wrapped> {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: DEK_AAD }, kek, raw));
  return { iv: b64(iv), ct: b64(ct) };
}

async function unwrapRaw(w: Wrapped, kek: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv), additionalData: DEK_AAD }, kek, unb64(w.ct));
  return new Uint8Array(raw);
}

const importDEK = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

/** Crockford base32 recovery code: 20 symbols = 100 bits, shown as 4 groups of 5. */
const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newRecoveryCode(): string {
  const b = rand(20);
  const s = Array.from(b, x => ALPH[x & 31]).join('');
  return s.match(/.{5}/g)!.join('-');
}
export function normalizeRecovery(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}

/** Create a new vault key and the meta record that stores it wrapped twice. */
export async function createVault(passcode: string, recovery: string): Promise<{ meta: Meta; dek: CryptoKey }> {
  const raw = rand(32);
  const ps = rand(16), rs = rand(16);
  const [kp, kr] = await Promise.all([
    deriveKEK(passcode, ps, PASS_ITER),
    deriveKEK(normalizeRecovery(recovery), rs, REC_ITER),
  ]);
  const meta: Meta = {
    v: 1,
    created: Date.now(),
    pass: { salt: b64(ps), iter: PASS_ITER, w: await wrapRaw(raw, kp) },
    rec: { salt: b64(rs), iter: REC_ITER, w: await wrapRaw(raw, kr) },
  };
  const dek = await importDEK(raw);
  raw.fill(0);
  return { meta, dek };
}

/** Throws when the passcode is wrong (AES-GCM authentication fails). */
export async function openWithPasscode(meta: Meta, passcode: string): Promise<{ dek: CryptoKey; raw: Uint8Array }> {
  const kek = await deriveKEK(passcode, unb64(meta.pass.salt), meta.pass.iter);
  const raw = await unwrapRaw(meta.pass.w, kek);
  return { dek: await importDEK(raw), raw };
}

export async function openWithRecovery(meta: Meta, code: string): Promise<{ dek: CryptoKey; raw: Uint8Array }> {
  const kek = await deriveKEK(normalizeRecovery(code), unb64(meta.rec.salt), meta.rec.iter);
  const raw = await unwrapRaw(meta.rec.w, kek);
  return { dek: await importDEK(raw), raw };
}

/** Re-wrap an already unwrapped key under a new passcode (and optionally a new recovery code). */
export async function rewrap(meta: Meta, raw: Uint8Array, passcode: string, recovery?: string): Promise<Meta> {
  const ps = rand(16);
  const next: Meta = { ...meta, pass: { salt: b64(ps), iter: PASS_ITER, w: await wrapRaw(raw, await deriveKEK(passcode, ps, PASS_ITER)) } };
  if (recovery) {
    const rs = rand(16);
    next.rec = { salt: b64(rs), iter: REC_ITER, w: await wrapRaw(raw, await deriveKEK(normalizeRecovery(recovery), rs, REC_ITER)) };
  }
  return next;
}

/** Encrypt a JSON value. The document id is bound as associated data so blobs can't be swapped. */
export async function seal(dek: CryptoKey, docId: string, value: unknown): Promise<Sealed> {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(docId) }, dek, enc.encode(JSON.stringify(value))));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function unseal<T>(dek: CryptoKey, docId: string, s: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv), additionalData: enc.encode(docId) }, dek, unb64(s.ct));
  return JSON.parse(dec.decode(pt)) as T;
}
