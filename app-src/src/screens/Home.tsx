import React, { useEffect, useMemo, useState } from 'react';
import { cap } from '../lib/claude';
import { exportBackup } from '../lib/backup';
import { useApp } from '../state';
import { Icon, Bar, Stars } from '../ui/kit';
import { Dial } from '../ui/Dial';
import { Rosette } from '../ui/Guilloche';
import { Kpi, Money, QuoteCard, TxRow, useFmt } from '../ui/parts';
import { allTx, freedomDays, insights, ladder, LEVELS, loggingStreak, safeToSpend, savingsRate, sums, txInRange, wealth, isFixed } from '../lib/calc';
import { pct, todayISO, daysBetween, num } from '../lib/format';

export function Home() {
  const { v, setCore, open, setTab, feed, toast, io } = useApp();
  const [coach, setCoach] = useState(false);
  useEffect(() => { void cap('sample', 3000).then(s => setCoach(!!s)); }, []);
  const fmt = useFmt();
  const today = todayISO();
  const safe = useMemo(() => safeToSpend(v, today), [v, today]);
  const s = useMemo(() => sums(txInRange(v, safe.period.start, today), v.core), [v, safe.period.start, today]);
  const rate = savingsRate(s);
  const ins = useMemo(() => insights(v, today), [v, today]);
  const lad = useMemo(() => ladder(v), [v]);
  const w = useMemo(() => wealth(v), [v]);
  const fd = useMemo(() => freedomDays(v, w), [v, w]);
  const streak = useMemo(() => loggingStreak(v, today), [v, today]);
  const recent = useMemo(() => allTx(v).filter(t => t.d <= today).sort((a, b) => (b.d + b.ts).localeCompare(a.d + a.ts)).slice(0, 5), [v, today]);

  const periodTx = txInRange(v, safe.period.start, safe.period.end);
  const fixedTotal = periodTx.filter(t => t.t === 'expense' && isFixed(t, v.core)).reduce((a, t) => a + t.a, 0) + safe.fixedAhead;
  const base = safe.plannedIncome > 0 ? (safe.plannedIncome - Math.max(safe.saveTarget, safe.saved) - fixedTotal) / safe.period.days : 0;

  const spentToday = safe.spentToday > 0;
  const checkedIn = v.core.checkins.includes(today);
  const lastReview = v.core.reviews[v.core.reviews.length - 1]?.date;
  const reviewDue = allTx(v).length >= 5 && (!lastReview || daysBetween(lastReview, today) >= 7) && (new Date().getDay() === 0 || !lastReview || daysBetween(lastReview, today) >= 9);
  const richness = Math.max(0.15, Math.min(1, ((rate ?? 0) + 0.05) / 0.35));
  const top = feed?.picks?.filter(p => p.stars >= 5).slice(0, 3) || [];

  return (
    <div className="wrap stack-l" style={{ paddingTop: 6 }}>
      <section className="hero" aria-label="בטוח להוציא היום">
        <Rosette size={360} petals={safe.period.days} richness={richness} alpha={0.16} style={{ top: -8 }} />
        <Dial safe={safe} base={base} fmt={n => fmt(n)}>
          {safe.hasBasis ? (safe.available < 0 ? (
            <>
              <span className="lbl">החודש מעבר לתוכנית</span>
              <span className="figure money down">{fmt(-safe.available)}</span>
              <span className="sub">יום בלי הוצאות מחזיר אותך למסלול. החודש הבא מתחיל בעוד {safe.daysLeft} ימים.</span>
            </>
          ) : (
            <>
              <span className="lbl">{safe.leftToday >= 0 ? 'בטוח להוציא היום' : 'מעבר לתקציב היום'}</span>
              <span className={`figure money ${safe.leftToday < 0 ? 'down' : ''}`}>{fmt(Math.abs(safe.leftToday))}</span>
              <span className="sub">
                {safe.leftToday >= 0
                  ? <>מתוך <span className="money">{fmt(Math.max(0, safe.allowanceToday))}</span> ליום · עוד {safe.daysLeft} ימים</>
                  : <>מחר: <span className="money">{fmt(Math.max(0, safe.tomorrow))}</span> ליום</>}
              </span>
            </>
          )) : (
            <>
              <span className="lbl">כמה בטוח להוציא היום?</span>
              <button className="btn gold sm" style={{ pointerEvents: 'auto', marginTop: 6 }} onClick={() => open({ k: 'onboard' })}>להגדיר הכנסה</button>
            </>
          )}
        </Dial>
        <div className="legend" aria-hidden="true">
          <span><i style={{ background: 'var(--accent)' }} />בתוך התקציב</span>
          <span><i style={{ background: 'var(--spend)' }} />מעל</span>
          <span><i style={{ background: 'var(--gold)', height: 3, borderRadius: 2 }} />חיסכון החודש {safe.saveTarget > 0 ? pct(Math.min(1, Math.max(0, safe.saved / safe.saveTarget))) : ''}</span>
        </div>
      </section>

      <section className="tiles" aria-label="החודש">
        <Kpi k="הכנסות" v={<Money n={s.income} />} d={safe.plannedIncome > s.income ? <>צפי <Money n={safe.plannedIncome} /></> : 'החודש'} />
        <Kpi k="הוצאות" v={<Money n={s.expense} />} d={<>היום <Money n={safe.spentToday} /></>} />
        <Kpi k="שיעור חיסכון" v={rate === null ? '–' : pct(rate)} tone={rate !== null && rate >= v.core.profile.saveRate ? 'up' : ''} d={`יעד ${pct(v.core.profile.saveRate)}`} />
      </section>

      <div className="chips" role="group" aria-label="פעולות מהירות">
        {!spentToday && !checkedIn && (
          <button className="chip" onClick={() => { setCore(c => ({ ...c, checkins: [...c.checkins, today].slice(-400) })); toast('יום בלי הוצאות נרשם. כל הכבוד'); }}>
            <Icon name="check" size={16} /> היום לא הוצאתי
          </button>
        )}
        <span className="chip" aria-label={`רצף רישום ${streak} ימים`}><Icon name="flame" size={16} className="gold" /> רצף {streak} ימים</span>
        {reviewDue && <button className="chip" style={{ borderColor: 'var(--gold)' }} onClick={() => open({ k: 'review' })}><Icon name="calendar" size={16} /> סקירת שבוע · דקה</button>}
        {coach && <button className="chip" onClick={() => open({ k: 'coach' })}><Icon name="brain-circuit" size={16} /> לשאול את המאמן</button>}
        <button className="chip" onClick={() => open({ k: 'import' })}><Icon name="file-spreadsheet" size={16} /> ייבוא דף חשבון</button>
      </div>

      {io.backend.kind === 'local' && allTx(v).length >= 15 && (!v.core.lastBackup || Date.now() - v.core.lastBackup > 30 * 86_400_000) && (
        <section className="card tight row" style={{ gap: 12 }} aria-label="גיבוי">
          <span className="glyph gold"><Icon name="download" /></span>
          <div className="grow" style={{ fontSize: '.88rem' }}>
            <b>{v.core.lastBackup ? 'עבר חודש מהגיבוי האחרון' : 'עוד לא שמרת גיבוי'}</b>
            <div className="ink2">הנתונים שמורים רק בטלפון הזה. גיבוי מוצפן לוקח שנייה, ונפתח רק עם הקוד שלך.</div>
          </div>
          <button className="btn ghost sm" onClick={async () => {
            const r = await exportBackup(io);
            if (r === 'saved' || r === 'copied') { setCore(c => ({ ...c, lastBackup: Date.now() })); toast(r === 'saved' ? 'הגיבוי נשמר' : 'הגיבוי הועתק ללוח'); }
          }}>גיבוי</button>
        </section>
      )}

      {ins.length > 0 && (
        <section className="stack" aria-label="תובנות">
          <div className="sec-head"><h2 className="h-sec">מה חשוב עכשיו</h2><span className="h-sub">{ins.length} תובנות</span></div>
          <div className="rail">
            {ins.map(i => (
              <article key={i.id} className={`insight ${i.tone}`}>
                <Icon name={i.icon} className="ic" />
                <div className="ttl">{i.title}</div>
                <div className="bd">{i.body}</div>
                {i.action && (
                  <button className="link" style={{ marginTop: 4, justifySelf: 'start' }} onClick={() => {
                    if (i.action!.go === 'save') open({ k: 'add', preset: { t: 'save', c: i.id === 'emergency' ? 'b_emergency' : undefined } });
                    else if (i.action!.go === 'recurring') open({ k: 'recurring' });
                  }}>{i.action.label} <Icon name="chevron-left" size={16} /></button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card" aria-label="ימי חירות">
        <button className="row between" style={{ width: '100%', textAlign: 'start' }} onClick={() => setTab('goals')}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="eyebrow">ימי חירות</span>
            <span className="figure-m">{num(fd)} <span className="muted" style={{ fontSize: '.9rem', fontWeight: 600 }}>ימים</span></span>
            <span className="muted" style={{ fontSize: '.84rem' }}>החיסכון הנזיל שלך מממן כבר {fd >= 60 ? `${num(fd / 30.44, 1)} חודשים` : `${num(fd)} ימים`} של החיים שלך, בלי לעבוד.</span>
          </div>
          <Icon name="chevron-left" className="muted" />
        </button>
        <hr className="hr" style={{ margin: '14px 0 12px' }} />
        <div className="row between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: '.88rem' }}>
            <b className="gold">שלב {lad.level}{lad.level ? ` · ${LEVELS[lad.level - 1].name}` : ''}</b>
            {lad.next && <span className="muted"> → {lad.next.name}</span>}
          </span>
          <span className="muted" style={{ fontSize: '.8rem' }}>{lad.hint}</span>
        </div>
        <Bar value={lad.progress} tone="gold" />
      </section>

      <QuoteCard />

      <section className="card" aria-label="בחירות 5 הכוכבים">
        <div className="sec-head" style={{ marginBottom: 10 }}>
          <h2 className="h-sec">בחירות 5 הכוכבים</h2>
          <button className="link" onClick={() => setTab('grow')}>לכל הבחירות <Icon name="chevron-left" size={16} /></button>
        </div>
        {top.length ? (
          <div className="list">
            {top.map(p => (
              <button key={p.ticker} className="li" onClick={() => setTab('grow')}>
                <span className="ticker" style={{ fontSize: '1.05rem', minWidth: 58 }}>{p.ticker}</span>
                <span className="grow" style={{ display: 'grid' }}><span className="t">{p.name}</span><span className="s">{p.thesis}</span></span>
                <span style={{ display: 'grid', justifyItems: 'end', gap: 2 }}><Stars n={p.stars} size={12} />{p.upside != null && <span className="up" style={{ fontSize: '.8rem', fontWeight: 700 }}>{pct(p.upside)} פוטנציאל</span>}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>{feed === undefined ? 'טוען את בחירות הבוקר…' : 'הבחירות מתעדכנות כל בוקר מתוך מחקר אוטומטי. הן יופיעו כאן כשיהיה חיבור לאינטרנט.'}</p>
        )}
      </section>

      <section className="stack" aria-label="תנועות אחרונות">
        <div className="sec-head"><h2 className="h-sec">אחרונות</h2><button className="link" onClick={() => setTab('activity')}>הכול <Icon name="chevron-left" size={16} /></button></div>
        {recent.length ? (
          <div className="card tight list" style={{ paddingBlock: 2 }}>
            {recent.map(t => <TxRow key={t.id} t={t} showDate onClick={() => open({ k: 'add', preset: { edit: t } })} />)}
          </div>
        ) : (
          <div className="card">
            <div className="empty">
              <span className="glyph gold"><Icon name="plus" size={24} /></span>
              <b>התנועה הראשונה לוקחת שלוש שניות</b>
              <span className="muted" style={{ fontSize: '.88rem' }}>לחץ על המטבע למטה, הקלד סכום ובחר קטגוריה. אפשר גם לייבא דף חשבון מהבנק או מחברת האשראי.</span>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn primary sm" onClick={() => open({ k: 'add' })}>רישום ראשון</button>
                <button className="btn ghost sm" onClick={() => open({ k: 'import' })}>ייבוא קובץ</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
