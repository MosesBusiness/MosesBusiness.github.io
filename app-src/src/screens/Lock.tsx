import React, { useEffect, useState } from 'react';
import { Icon, haptic } from '../ui/kit';
import { Rosette } from '../ui/Guilloche';
import { Meta, createVault, newRecoveryCode, openWithPasscode, openWithRecovery, rewrap } from '../lib/crypto';
import { Backend, clearFails, lockoutState, recordFail } from '../lib/store';
import { fmtHebrewDate, fmtDay, todayISO } from '../lib/format';
import { SyncCfg, parseRepo, syncMessage, SyncError } from '../lib/github';

type Mode = 'restore' | 'intro' | 'pin' | 'confirm' | 'working' | 'recovery' | 'unlock' | 'opening' | 'forgot' | 'newpin' | 'newconfirm' | 'reset';

function useSize() {
  const [s, set] = useState(() => Math.min(window.innerWidth, 560));
  useEffect(() => { const f = () => set(Math.min(window.innerWidth, 560)); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return s;
}

function Pad({ onKey, okLabel = 'אישור' }: { onKey: (k: string) => void; okLabel?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  return (
    <div className="pad">
      {keys.map(k => (
        <button key={k} onClick={() => { haptic(); onKey(k); }} aria-label={k === 'del' ? 'מחיקה' : k === 'ok' ? okLabel : k}
          style={k === 'ok' ? { background: 'var(--gold)', color: '#1d1606' } : undefined}>
          {k === 'del' ? <Icon name="delete" size={24} /> : k === 'ok' ? <Icon name="check" size={26} stroke={2.4} /> : k}
        </button>
      ))}
    </div>
  );
}

export function Lock({ backend, meta, onOpen, onReset, onRestore }: {
  backend: Backend; meta: Meta | null;
  onOpen: (dek: CryptoKey, fresh: boolean) => void;
  onReset: () => void;
  onRestore?: (cfg: SyncCfg) => Promise<void>;
}) {
  const size = useSize();
  const [mode, setMode] = useState<Mode>(meta ? 'unlock' : 'intro');
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [text, setText] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(0);
  const [recovery, setRecovery] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{ dek: CryptoKey } | null>(null);
  const [recInput, setRecInput] = useState('');
  const [recRaw, setRecRaw] = useState<Uint8Array | null>(null);
  const [resetText, setResetText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lock = lockoutState();
  const lockedFor = Math.max(0, lock.until - now);

  useEffect(() => { if (lockedFor > 0) { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); } }, [lockedFor > 0]);

  const fail = (msg: string) => { setErr(msg); setShake(s => s + 1); setCode(''); haptic(60); };

  async function submit(value = code) {
    if (mode === 'pin' || mode === 'newpin') {
      if (value.length < 6) return fail('לפחות 6 תווים');
      setFirst(value); setCode(''); setErr(''); setMode(mode === 'pin' ? 'confirm' : 'newconfirm');
    } else if (mode === 'confirm') {
      if (value !== first) { setMode('pin'); setFirst(''); return fail('הקודים לא תואמים. נסה שוב'); }
      setMode('working'); setErr('');
      const rec = newRecoveryCode();
      const { meta: m, dek } = await createVault(value, rec);
      await backend.put('meta', m as any);
      setRecovery(rec); setPending({ dek }); setMode('recovery');
    } else if (mode === 'newconfirm') {
      if (value !== first || !meta || !recRaw) { setMode('newpin'); setFirst(''); return fail('הקודים לא תואמים. נסה שוב'); }
      setMode('working');
      const next = await rewrap(meta, recRaw, value);
      await backend.put('meta', next as any);
      recRaw.fill(0);
      clearFails();
      const { dek } = await openWithPasscode(next, value);
      setMode('opening');
      setTimeout(() => onOpen(dek, false), 650);
    } else if (mode === 'unlock' && meta) {
      if (lockedFor > 0 || !value) return;
      setMode('opening'); setErr('');
      try {
        const { dek, raw } = await openWithPasscode(meta, value);
        raw.fill(0);
        clearFails();
        setTimeout(() => onOpen(dek, false), 650);
      } catch {
        const s = recordFail();
        setMode('unlock');
        fail(s.until > Date.now() ? 'יותר מדי ניסיונות. המתן רגע' : `קוד שגוי${s.fails >= 3 ? ` · ניסיון ${s.fails}` : ''}`);
        setNow(Date.now());
      }
    }
  }

  function onKey(k: string) {
    setErr('');
    if (k === 'del') setCode(c => c.slice(0, -1));
    else if (k === 'ok') void submit();
    else setCode(c => (c.length < 32 ? c + k : c));
  }

  async function useRecovery() {
    if (!meta) return;
    setMode('working');
    try {
      const { raw } = await openWithRecovery(meta, recInput);
      setRecRaw(raw); setRecInput(''); setMode('newpin'); setErr('');
    } catch {
      setMode('forgot'); fail('קוד השחזור לא נכון');
    }
  }

  async function wipe() {
    const all = await backend.getAll();
    for (const id of Object.keys(all)) await backend.del(id);
    clearFails();
    onReset();
  }

  const opening = mode === 'opening';
  const title = {
    pin: 'בחר קוד כניסה', confirm: 'הקלד את הקוד שוב', unlock: 'הקלד את הקוד', newpin: 'בחר קוד חדש', newconfirm: 'הקלד את הקוד החדש שוב',
  } as Record<string, string>;

  const pinScreen = ['pin', 'confirm', 'unlock', 'newpin', 'newconfirm', 'opening'].includes(mode);

  return (
    <div className="lock wrap">
      <Rosette size={size * 1.15} petals={36} richness={0.7} alpha={0.28} converge={opening ? 1 : 0}
        tone={err ? 'warn' : 'foil'} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-55%)' }} />
      <header style={{ display: 'grid', gap: 6, justifyItems: 'center', textAlign: 'center' }}>
        <div className="brand">הון שקט<small>{fmtDay(todayISO())} · {fmtHebrewDate()}</small></div>
      </header>

      <main style={{ width: '100%', maxWidth: 360, display: 'grid', gap: 18, justifyItems: 'center' }}>
        {mode === 'intro' && (
          <div className="stack" style={{ textAlign: 'center', justifyItems: 'center' }}>
            <p style={{ fontFamily: 'var(--f-display)', fontSize: '1.4rem', margin: 0, lineHeight: 1.35 }}>עושר הוא מה שלא רואים.</p>
            <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>מורגן האוסל, הפסיכולוגיה של הכסף</p>
            <div className="card" style={{ display: 'grid', gap: 12, textAlign: 'start', marginTop: 8, width: '100%' }}>
              {[
                ['shield-check', 'מוצפן בכספת אישית', 'רק הקוד שלך פותח את הנתונים. אף אחד אחר, גם לא אנחנו.'],
                ['zap', 'רישום בשתי נגיעות', 'סכום וקטגוריה. בית העסק מזוהה לבד, וקבועים נרשמים מעצמם.'],
                ['star', 'בחירות 5 הכוכבים', 'מניות שעברו חמישה מבחנים, מתעדכנות כל בוקר.'],
              ].map(([ic, t, b]) => (
                <div className="row" key={t} style={{ alignItems: 'flex-start' }}>
                  <span className="glyph gold"><Icon name={ic} /></span>
                  <div className="grow"><b>{t}</b><div className="muted" style={{ fontSize: '.86rem' }}>{b}</div></div>
                </div>
              ))}
            </div>
            <button className="btn primary block" onClick={() => setMode('pin')}>יצירת כספת</button>
            {onRestore && <button className="btn quiet block" onClick={() => { setErr(''); setMode('restore'); }}><Icon name="refresh-cw" size={16} /> יש לי כבר כספת בענן: שחזור</button>}
          </div>
        )}

        {pinScreen && (
          <>
            <div style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
              <b style={{ fontSize: '1.1rem' }}>{opening ? 'פותח את הכספת' : title[mode]}</b>
              <span className="muted" style={{ fontSize: '.84rem', minHeight: '1.3em' }} role="alert">
                {err || (lockedFor > 0 ? `נעול ל-${Math.ceil(lockedFor / 1000)} שניות` : mode === 'pin' ? 'לפחות 6 ספרות. הקוד לא נשמר בשום מקום.' : opening ? 'מפענח…' : '')}
              </span>
            </div>
            {text ? (
              <form onSubmit={e => { e.preventDefault(); void submit(); }} style={{ width: '100%', display: 'grid', gap: 10 }} className={shake ? 'shake' : ''} key={shake}>
                <input id="pass-text" className="input" type="password" autoFocus autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'}
                  value={code} onChange={e => { setCode(e.target.value); setErr(''); }} aria-label="סיסמה" disabled={opening || lockedFor > 0} />
                <button className="btn gold block" disabled={opening || lockedFor > 0}>אישור</button>
              </form>
            ) : (
              <>
                <div className={`dots ${shake ? 'shake' : ''}`} key={shake} aria-label={`${code.length} ספרות`}>
                  {Array.from({ length: Math.max(6, code.length) }).map((_, i) => <i key={i} className={i < code.length ? 'on' : ''} />)}
                </div>
                <div className="lock-pad" style={{ opacity: opening || lockedFor > 0 ? 0.4 : 1, pointerEvents: opening || lockedFor > 0 ? 'none' : 'auto' }}>
                  <Pad onKey={onKey} />
                </div>
              </>
            )}
            {!opening && (
              <div className="row" style={{ justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                <button className="btn quiet sm" onClick={() => { setText(t => !t); setCode(''); }}>{text ? 'מקלדת מספרים' : 'סיסמה עם אותיות'}</button>
                {mode === 'unlock' && <button className="btn quiet sm" onClick={() => { setMode('forgot'); setErr(''); }}>שכחתי את הקוד</button>}
              </div>
            )}
          </>
        )}

        {mode === 'restore' && onRestore && (
          <form className="card stack" style={{ width: '100%' }} onSubmit={async e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const r = parseRepo(String(f.get('repo') || ''));
            const token = String(f.get('token') || '').trim();
            if (!r || !token) { setErr('צריך שם מאגר וטוקן'); return; }
            setErr(''); setRestoring(true);
            try { await onRestore({ ...r, token, on: true }); }
            catch (x) { setErr(x instanceof SyncError ? (x.code === 'auth' ? 'הטוקן לא תקף. בדוק שהעתקת אותו במלואו, או צור טוקן חדש לאותו מאגר.' : syncMessage(x)) : 'לא נמצאה כספת במאגר הזה.'); }
            finally { setRestoring(false); }
          }}>
            <div className="row"><span className="glyph gold"><Icon name="refresh-cw" /></span><b>שחזור הכספת מהענן</b></div>
            <p className="ink2" style={{ margin: 0, fontSize: '.88rem' }}>המאגר הפרטי שלך ב-GitHub שומר עותק מוצפן של כל הנתונים. Chrome זוכר את הטוקן ויציע למלא אותו.</p>
            <label className="field"><span>מאגר</span><input id="rs-repo" name="repo" className="input ltr" defaultValue="MosesBusiness/hon-shaket-data" autoComplete="username" spellCheck={false} /></label>
            <label className="field"><span>טוקן</span><input id="rs-token" name="token" className="input ltr" type="password" autoComplete="current-password" spellCheck={false} /></label>
            {err && <span className="down" role="alert" style={{ fontSize: '.86rem' }}>{err}</span>}
            <button className="btn primary block" disabled={restoring}>{restoring ? 'מוריד…' : 'שחזור'}</button>
            <button type="button" className="btn quiet sm" onClick={() => { setErr(''); setMode('intro'); }}>חזרה</button>
          </form>
        )}

        {mode === 'working' && <div className="muted" role="status">יוצר מפתחות הצפנה…</div>}

        {mode === 'recovery' && (
          <div className="card stack" style={{ width: '100%' }}>
            <div className="row"><span className="glyph gold"><Icon name="key-round" /></span><b style={{ fontSize: '1.08rem' }}>קוד השחזור שלך</b></div>
            <p className="ink2" style={{ margin: 0, fontSize: '.9rem' }}>זו הדרך היחידה לפתוח את הכספת אם תשכח את הקוד. שמור אותו מחוץ לטלפון: על דף, או במנהל סיסמאות. אף אחד לא יכול לשחזר אותו בשבילך.</p>
            <div className="code" id="rec-code">{recovery}</div>
            <button className="btn ghost sm" onClick={() => {
              navigator.clipboard?.writeText(recovery).then(() => setErr('הועתק'), () => {
                const r = document.createRange(); const el = document.getElementById('rec-code'); if (el) { r.selectNodeContents(el); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
              });
            }}><Icon name="copy" size={16} /> העתקה</button>
            <label className="row" style={{ fontSize: '.92rem' }}>
              <input type="checkbox" id="rec-saved" checked={saved} onChange={e => setSaved(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
              שמרתי את הקוד במקום בטוח
            </label>
            <button className="btn primary block" disabled={!saved} onClick={() => { setRecovery(''); if (pending) onOpen(pending.dek, true); }}>כניסה לאפליקציה</button>
          </div>
        )}

        {mode === 'forgot' && (
          <form className="card stack" style={{ width: '100%' }} onSubmit={e => { e.preventDefault(); void useRecovery(); }}>
            <b>שחזור עם קוד השחזור</b>
            <p className="ink2" style={{ margin: 0, fontSize: '.88rem' }}>הקוד בן 20 התווים שקיבלת ביצירת הכספת.</p>
            <input id="rec-input" className="input ltr" value={recInput} onChange={e => setRecInput(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            {err && <span className="down" style={{ fontSize: '.86rem' }}>{err}</span>}
            <button className="btn primary block" disabled={recInput.replace(/[^0-9a-z]/gi, '').length < 20}>המשך</button>
            <div className="row between">
              <button type="button" className="btn quiet sm" onClick={() => { setMode('unlock'); setErr(''); }}>חזרה</button>
              <button type="button" className="btn quiet sm" style={{ color: 'var(--danger)' }} onClick={() => setMode('reset')}>אין לי את הקוד</button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form className="card stack" style={{ width: '100%' }} onSubmit={e => { e.preventDefault(); if (resetText.trim() === 'מחק') void wipe(); }}>
            <b style={{ color: 'var(--danger)' }}>מחיקת הכספת והתחלה מחדש</b>
            <p className="ink2" style={{ margin: 0, fontSize: '.88rem' }}>בלי הקוד ובלי קוד השחזור אי אפשר לפענח את הנתונים, זה כל הרעיון של ההצפנה. אפשר רק למחוק הכול ולהתחיל כספת חדשה. כדי לאשר, הקלד: מחק</p>
            <input id="reset-input" className="input" value={resetText} onChange={e => setResetText(e.target.value)} autoComplete="off" />
            <button className="btn danger block" disabled={resetText.trim() !== 'מחק'}>מחיקה לצמיתות</button>
            <button type="button" className="btn quiet sm" onClick={() => setMode('forgot')}>חזרה</button>
          </form>
        )}
      </main>

      <footer className="muted" style={{ fontSize: '.74rem', textAlign: 'center', display: 'flex', gap: 6, alignItems: 'center' }}>
        <Icon name="lock" size={13} /> הצפנת AES-256 · מפתח נגזר מהקוד שלך ({backend.kind === 'cloud' ? 'מסונכרן בחשבון Claude שלך' : 'הקוד לא נשמר בשום מקום'})
      </footer>
    </div>
  );
}
