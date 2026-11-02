// Quick unlock with the phone's fingerprint or face, without weakening the vault.
// A passkey on this device (WebAuthn, platform authenticator, user verification required)
// returns a secret through the PRF extension only after the fingerprint/face check; that secret
// wraps the vault key once more (meta.bio). Nothing that can open the vault is stored readable.

import { WEB } from './env';
import { BioEntry, Meta, b64, importDEK, kekFromSecret, rand, unb64, unwrapKey, wrapKey } from './crypto';

const HERE = 'hs:bio-id';
const ASKED = 'hs:bio-ask';

const b64url = (u8: Uint8Array) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const u8 = (b: ArrayBuffer | ArrayBufferView) => (b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength));

export class BioError extends Error {
  constructor(public code: 'cancel' | 'unsupported' | 'other') { super(code); }
}
function asBioError(e: unknown): BioError {
  if (e instanceof BioError) return e;
  const n = (e as any)?.name;
  return new BioError(n === 'NotAllowedError' || n === 'AbortError' ? 'cancel' : n === 'NotSupportedError' ? 'unsupported' : 'other');
}

let avail: Promise<boolean> | null = null;
/** True when this browser can do a fingerprint/face passkey with the PRF extension. */
export function bioAvailable(): Promise<boolean> {
  if (!avail) avail = (async () => {
    if (!WEB || !window.isSecureContext || !window.PublicKeyCredential) return false;
    try {
      const PKC = PublicKeyCredential as any;
      if (PKC.getClientCapabilities) {
        const caps = await PKC.getClientCapabilities();
        if (caps['extension:prf'] === false || caps.userVerifyingPlatformAuthenticator === false) return false;
      }
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
  })();
  return avail;
}

/** Enrolled on this device (the passkey id is remembered locally; the wrapped key lives in meta). */
export function bioHere(meta: Meta | null): boolean {
  try { const id = localStorage.getItem(HERE); return !!id && !!meta?.bio?.some(e => e.id === id); } catch { return false; }
}

/** Offer quick unlock after a passcode unlock: supported, not set up here, not declined lately. */
export async function shouldOfferBio(meta: Meta | null): Promise<boolean> {
  if (!meta || bioHere(meta)) return false;
  try { if (Date.now() - Number(localStorage.getItem(ASKED) || 0) < 30 * 864e5) return false; } catch { /* ignore */ }
  return bioAvailable();
}
export function declineBio() { try { localStorage.setItem(ASKED, String(Date.now())); } catch { /* ignore */ } }

async function prfGet(entries: BioEntry[]): Promise<{ entry: BioEntry; secret: Uint8Array }> {
  const evalByCredential: Record<string, { first: Uint8Array }> = {};
  for (const e of entries) evalByCredential[b64url(unb64(e.id))] = { first: unb64(e.salt) };
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      allowCredentials: entries.map(e => ({ type: 'public-key' as const, id: unb64(e.id), transports: ['internal' as AuthenticatorTransport] })),
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { evalByCredential } } as any,
    },
  }) as PublicKeyCredential | null;
  if (!a) throw new BioError('cancel');
  const id = b64(u8(a.rawId));
  const entry = entries.find(e => e.id === id);
  const first = (a.getClientExtensionResults() as any).prf?.results?.first;
  if (!entry || !first) throw new BioError('unsupported');
  return { entry, secret: u8(first) };
}

/** Creates a passkey on this device and adds a quick-unlock entry for it to meta. */
export async function enrollBio(meta: Meta, raw: Uint8Array): Promise<Meta> {
  try {
    const salt = rand(32);
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'הון שקט' },
        user: { id: rand(16), name: 'הון שקט', displayName: 'הון שקט · כניסה מהירה' },
        challenge: rand(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required', requireResidentKey: true },
        timeout: 60_000,
        attestation: 'none',
        extensions: { prf: { eval: { first: salt } } } as any,
      },
    }) as PublicKeyCredential | null;
    if (!cred) throw new BioError('cancel');
    const id = b64(u8(cred.rawId));
    const prf = (cred.getClientExtensionResults() as any).prf;
    if (prf?.enabled === false) throw new BioError('unsupported');
    const draft: BioEntry = { id, salt: b64(salt), w: { iv: '', ct: '' }, at: Date.now() };
    // Some phones return the secret right away; others only on the first sign-in.
    const secret = prf?.results?.first ? u8(prf.results.first) : (await prfGet([draft])).secret;
    draft.w = await wrapKey(raw, await kekFromSecret(secret));
    secret.fill(0);
    try { localStorage.setItem(HERE, id); } catch { /* ignore */ }
    return { ...meta, bio: [...(meta.bio || []).filter(e => e.id !== id), draft].slice(-8) };
  } catch (e) { throw asBioError(e); }
}

/** Opens the vault with the fingerprint/face check. */
export async function openWithBio(meta: Meta): Promise<{ dek: CryptoKey; raw: Uint8Array }> {
  const list = meta.bio || [];
  if (!list.length) throw new BioError('unsupported');
  try {
    let here: string | null = null;
    try { here = localStorage.getItem(HERE); } catch { /* ignore */ }
    const mine = list.filter(e => e.id === here);
    const { entry, secret } = await prfGet(mine.length ? mine : list);
    const raw = await unwrapKey(entry.w, await kekFromSecret(secret));
    secret.fill(0);
    return { dek: await importDEK(raw), raw };
  } catch (e) { throw asBioError(e); }
}

/** Turns quick unlock off on this device. */
export function removeBioHere(meta: Meta): Meta {
  let id: string | null = null;
  try { id = localStorage.getItem(HERE); localStorage.removeItem(HERE); } catch { /* ignore */ }
  const bio = (meta.bio || []).filter(e => e.id !== id);
  const next: Meta = { ...meta, bio };
  if (!bio.length) delete next.bio;
  return next;
}
