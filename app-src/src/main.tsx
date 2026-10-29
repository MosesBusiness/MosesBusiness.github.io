import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';
import { AppProvider, useApp, Tab } from './state';
import { Icon } from './ui/kit';
import { Rosette } from './ui/Guilloche';
import { Lock } from './screens/Lock';
import { Home } from './screens/Home';
import { Activity } from './screens/Activity';
import { Grow } from './screens/Grow';
import { Goals } from './screens/Goals';
import { AddSheet } from './screens/AddSheet';
import { BucketSheet, BudgetSheet, CoachSheet, HoldingSheet, ImportSheet, MastermindSheet, OnboardSheet, RecurringSheet, ReviewSheet, SecuritySheet, SettingsSheet } from './screens/Panels';
import { Backend, VaultIO, connect } from './lib/store';
import { Meta } from './lib/crypto';
import { Vault, defaultCore } from './lib/model';
import { fmtHebrewDate, greeting } from './lib/format';
import { BASE, WEB } from './lib/env';
import { SyncCfg, markSyncError, mirrored, onSyncStatus, pullAll, reconcile, syncStatus } from './lib/github';

// Web app: offline support, installability, and storage the browser won't evict.
if (WEB) {
  try { if (window.top !== window.self) { window.top!.location.href = window.location.href; } } catch { document.documentElement.innerHTML = ''; throw new Error('framed'); }
  try { if ('serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }); }); } catch { /* unsupported */ }
  try { void navigator.storage?.persist?.(); } catch { /* unsupported */ }
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'היום', icon: 'house' },
  { id: 'activity', label: 'תנועות', icon: 'receipt-text' },
  { id: 'grow', label: 'צמיחה', icon: 'sprout' },
  { id: 'goals', label: 'מטרות', icon: 'target' },
];

function Shell() {
  const { v, tab, setTab, panel, open, setCore, privacy, lock, syncError } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [cloud, setCloud] = useState(syncStatus());
  useEffect(() => onSyncStatus(setCloud), []);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  useEffect(() => { if (!v.core.onboarded) open({ k: 'onboard' }); else if (location.hash === '#add') open({ k: 'add' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lens = v.core.settings.lens;
  const name = v.core.profile.name;
  const body = tab === 'home' ? <Home /> : tab === 'activity' ? <Activity /> : tab === 'grow' ? <Grow /> : <Goals />;

  return (
    <div className={`app${privacy ? ' priv' : ''}`}>
      <header className={`top wrap${scrolled ? ' scrolled' : ''}`}>
        <div className="row between">
          <div className="brand">הון שקט<small>{greeting()}{name ? `, ${name}` : ''} · {fmtHebrewDate()}</small></div>
          <div className="row" style={{ gap: 2 }}>
            <button className="icon-btn" aria-pressed={lens === 'time'} aria-label="עדשת הזמן: סכומים בשעות עבודה"
              onClick={() => setCore(c => ({ ...c, settings: { ...c.settings, lens: c.settings.lens === 'time' ? 'money' : 'time' } }))}
              title={v.core.profile.income ? 'עדשת הזמן' : 'הגדר הכנסה כדי להפעיל'}>
              <Icon name={lens === 'time' ? 'hourglass' : 'clock'} />
            </button>
            <button className="icon-btn" aria-pressed={privacy} aria-label="מצב פרטיות" onClick={() => setCore(c => ({ ...c, settings: { ...c.settings, privacy: !c.settings.privacy } }))}>
              <Icon name={privacy ? 'eye-off' : 'eye'} />
            </button>
            <button className="icon-btn" aria-label="נעילה" onClick={lock}><Icon name="lock" /></button>
            <button className="icon-btn" aria-label="הגדרות" onClick={() => open({ k: 'settings' })}><Icon name="settings" /></button>
          </div>
        </div>
        {lens === 'time' && v.core.profile.income > 0 && (
          <div className="pill gold" style={{ marginTop: 8 }}><Icon name="hourglass" size={12} /> עדשת הזמן: שעה מהזמן שלך שווה ₪{Math.round(v.core.profile.income / v.core.profile.hours)}</div>
        )}
        {(syncError || cloud.state === 'error') && (
          <div className="banner" style={{ marginTop: 8 }}><Icon name="info" size={16} /><span>{syncError || cloud.msg}</span></div>
        )}
      </header>

      <main id="main">{body}</main>

      <nav className="dock" aria-label="ניווט">
        <div className="dock-in">
          {TABS.slice(0, 2).map(t => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><Icon name={t.icon} size={22} />{t.label}</button>
          ))}
          <button className="coin" aria-label="תנועה חדשה" onClick={() => open({ k: 'add' })}><Icon name="plus" size={28} stroke={2.4} /></button>
          {TABS.slice(2).map(t => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}><Icon name={t.icon} size={22} />{t.label}</button>
          ))}
        </div>
      </nav>

      {panel?.k === 'add' && <AddSheet key={panel.preset?.edit?.id || 'new'} preset={panel.preset} />}
      {panel?.k === 'settings' && <SettingsSheet />}
      {panel?.k === 'security' && <SecuritySheet />}
      {panel?.k === 'onboard' && <OnboardSheet />}
      {panel?.k === 'bucket' && <BucketSheet id={panel.id} />}
      {panel?.k === 'holding' && <HoldingSheet id={panel.id} />}
      {panel?.k === 'recurring' && <RecurringSheet />}
      {panel?.k === 'budget' && <BudgetSheet cat={panel.cat} />}
      {panel?.k === 'review' && <ReviewSheet />}
      {panel?.k === 'mastermind' && <MastermindSheet />}
      {panel?.k === 'coach' && <CoachSheet q={panel.q} />}
      {panel?.k === 'import' && <ImportSheet />}
    </div>
  );
}

type Phase = { k: 'boot' } | { k: 'error'; msg: string } | { k: 'lock'; backend: Backend; meta: Meta | null } | { k: 'open'; vault: Vault; io: VaultIO; backend: Backend };

function Root() {
  const [phase, setPhase] = useState<Phase>({ k: 'boot' });

  const boot = useCallback(async () => {
    try {
      const th = localStorage.getItem('hs:theme');
      if (th === 'dark' || th === 'light') document.documentElement.setAttribute('data-theme', th);
    } catch { /* ignore */ }
    try {
      const backend = await connect();
      const docs = await backend.getAll();
      setPhase({ k: 'lock', backend, meta: (docs.meta as Meta) || null });
    } catch {
      setPhase({ k: 'error', msg: 'לא הצלחתי להתחבר לאחסון. בדוק את החיבור ונסה שוב.' });
    }
  }, []);
  useEffect(() => { void boot(); }, [boot]);

  const restored = useRef<SyncCfg | null>(null);

  const onOpen = useCallback(async (backend: Backend, dek: CryptoKey) => {
    try {
      let { vault, io } = await VaultIO.load(backend, dek, await backend.getAll());
      // Web app: bring the cloud copy and this device in step before opening.
      const cfg = restored.current || (vault?.core.sync?.on ? vault.core.sync : null);
      if (WEB && cfg) {
        try {
          const { mirror, changedLocal } = await reconcile(backend, cfg);
          if (changedLocal) ({ vault, io } = await VaultIO.load(backend, dek, await backend.getAll()));
          io.setBackend(mirrored(backend, mirror));
          if (vault && restored.current && JSON.stringify(vault.core.sync) !== JSON.stringify(cfg)) {
            vault = { ...vault, core: { ...vault.core, sync: cfg } };
            io.saveCore(vault.core);
          }
        } catch (e) { markSyncError(e); }
        restored.current = null;
      }
      const v: Vault = vault || { core: defaultCore(), months: {} };
      if (!vault) io.saveCore(v.core);
      setPhase({ k: 'open', vault: v, io, backend });
    } catch {
      setPhase({ k: 'error', msg: 'הנתונים לא נפתחו. ייתכן שהקובץ פגום; נסה שוב או שחזר מגיבוי.' });
    }
  }, []);

  const lock = useCallback(() => {
    setPhase(p => (p.k === 'open' ? { k: 'boot' } : p));
    void boot();
  }, [boot]);

  if (phase.k === 'boot') {
    return (
      <div className="lock wrap" aria-busy="true">
        <div />
        <div style={{ display: 'grid', placeItems: 'center' }}><Rosette size={240} petals={36} richness={0.5} alpha={0.4} /><div className="brand" style={{ position: 'absolute' }}>הון שקט</div></div>
        <div className="muted" style={{ fontSize: '.8rem' }}>טוען…</div>
      </div>
    );
  }
  if (phase.k === 'error') {
    return (
      <div className="lock wrap">
        <div className="brand">הון שקט</div>
        <div className="card stack" style={{ maxWidth: 360 }}><b>{phase.msg}</b><button className="btn primary" onClick={() => { setPhase({ k: 'boot' }); void boot(); }}>ניסיון נוסף</button></div>
        <div />
      </div>
    );
  }
  if (phase.k === 'lock') {
    const restore = WEB ? async (cfg: SyncCfg) => {
      const { docs } = await pullAll(cfg);
      if (!docs.meta) throw new Error('empty');
      for (const [id, d] of Object.entries(docs)) await phase.backend.put(id, d);
      restored.current = cfg;
      setPhase({ k: 'lock', backend: phase.backend, meta: docs.meta as Meta });
    } : undefined;
    return <Lock key={phase.meta ? "has-meta" : "no-meta"} backend={phase.backend} meta={phase.meta} onOpen={dek => void onOpen(phase.backend, dek)} onReset={() => { setPhase({ k: 'boot' }); void boot(); }} onRestore={restore} />;
  }
  return (
    <AppProvider initial={phase.vault} io={phase.io} onLock={lock}>
      <Shell />
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
