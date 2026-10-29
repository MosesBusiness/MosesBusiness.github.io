import React, { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Bar, Icon, Stars } from '../ui/kit';
import { CompoundChart } from '../ui/Charts';
import { useFmt } from '../ui/parts';
import { avgMonthlyExpense, compoundSeries, trailingSavingsRate, wealth, yearsToFI } from '../lib/calc';
import { ils, ilsCompact, num, pct } from '../lib/format';
import { DASHBOARD_URL } from '../lib/claude';
import { ISRAEL_TOOLS } from '../lib/israel';
import { Pick, safeUrl } from '../lib/feed';
import { ARTIFACT_URL, WEB } from '../lib/env';
import { daysBetween, todayISO } from '../lib/format';

const CRIT: [keyof NonNullable<Pick['criteria']>, string][] = [
  ['consensus', 'קונצנזוס'], ['upside', 'פוטנציאל'], ['momentum', 'מומנטום'], ['quality', 'איכות'], ['smartMoney', 'כסף חכם'],
];

function PickCard({ p }: { p: Pick }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card pick">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span className="ticker">{p.ticker}</span>
          <span className="ink2" style={{ fontSize: '.88rem' }}>{p.name}{p.sector ? ` · ${p.sector}` : ''}</span>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
          <Stars n={p.stars} />
          {p.upside != null && <span className="pill good">{pct(p.upside)} לפי היעד</span>}
        </div>
      </div>
      {p.thesis && <p style={{ margin: 0, fontSize: '.95rem' }}>{p.thesis}</p>}
      {(p.price != null || p.target != null) && (
        <div className="row" style={{ gap: 16, fontSize: '.84rem', flexWrap: 'wrap' }}>
          {p.price != null && <span className="muted">מחיר <b className="ink2 ltr">{p.currency === 'ILS' ? '₪' : '$'}{num(p.price, 2)}</b></span>}
          {p.target != null && <span className="muted">יעד ממוצע <b className="ink2 ltr">{p.currency === 'ILS' ? '₪' : '$'}{num(p.target, 2)}</b></span>}
          {p.priceAsOf && <span className="muted">נכון ל-{p.priceAsOf.split('-').reverse().join('.')}</span>}
        </div>
      )}
      {p.consensus && <div className="muted" style={{ fontSize: '.84rem' }}>{p.consensus}</div>}
      <div className="crit">
        {CRIT.map(([k, l]) => {
          const ok = p.criteria?.[k];
          return <span key={k} className={`pill ${ok ? 'good' : ''}`} style={ok ? undefined : { opacity: 0.6 }}><Icon name={ok ? 'check' : 'x'} size={12} stroke={2.6} />{l}</span>;
        })}
      </div>
      {(p.risk || p.sources?.length) && (
        <button className="link" onClick={() => setOpen(o => !o)} style={{ justifySelf: 'start' }}>{open ? 'פחות' : 'סיכון ומקורות'} <Icon name="chevron-down" size={16} /></button>
      )}
      {open && (
        <div className="stack" style={{ gap: 8 }}>
          {p.risk && <div className="banner" style={{ background: 'var(--spend-soft)' }}><Icon name="circle-alert" size={16} /><span>{p.risk}</span></div>}
          {p.sources?.length ? <div className="src-links">{p.sources.map(s => safeUrl(s.url) && <a key={s.url} href={safeUrl(s.url)!} target="_blank" rel="noopener noreferrer">{s.label}</a>)}</div> : null}
        </div>
      )}
    </article>
  );
}

export function Grow() {
  const { v, feed, track } = useApp();
  const fmt = useFmt();
  const w = useMemo(() => wealth(v), [v]);
  const avgM = useMemo(() => avgMonthlyExpense(v), [v]);
  const rate = useMemo(() => trailingSavingsRate(v), [v]);
  const income = v.core.profile.income;
  const monthlySave = Math.max(0, rate !== null && income ? income * rate : income * v.core.profile.saveRate);
  const [monthly, setMonthly] = useState(() => Math.max(500, Math.round(monthlySave / 100) * 100 || 1500));
  const [years, setYears] = useState(25);
  const [ret, setRet] = useState(Math.round(v.core.profile.returnRate * 100));
  const series = useMemo(() => compoundSeries(monthly, years, ret / 100, Math.round(w.invest)), [monthly, years, ret, w.invest]);
  const last = series[series.length - 1];

  const fiNumber = avgM * 12 * 25;
  const fiAssets = w.invest + w.pension;
  const annualSave = monthlySave * 12;
  const yrs = yearsToFI(avgM * 12, annualSave, fiAssets, 0.05);
  const yrsMore = yearsToFI(avgM * 12 * 0.95, annualSave + income * 12 * 0.05, fiAssets, 0.05);
  const satellite = w.invest * 0.1;
  const feeGap = compoundSeries(monthly, 30, 0.07 - 0.002, w.invest)[30].total - compoundSeries(monthly, 30, 0.07 - 0.007, w.invest)[30].total;

  const s = feed?.scanner;
  const picks = feed?.picks || [];
  const updated = feed?.updatedAt ? new Date(feed.updatedAt) : null;

  return (
    <div className="wrap stack-l" style={{ paddingTop: 6 }}>
      <header className="stack" style={{ gap: 6 }}>
        <h1 className="h-sec" style={{ fontSize: '1.5rem' }}>צמיחה</h1>
        <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>הכסף שלך עובד בשבילך: בחירות הבוקר, מצב השוק, ומכונת הזמן של ריבית דריבית.</p>
      </header>

      <section className="stack" aria-labelledby="picks-h">
        <div className="sec-head">
          <h2 className="h-sec" id="picks-h">בחירות 5 הכוכבים</h2>
          <span className="pill gold"><Icon name="refresh-cw" size={12} /> {updated ? `עודכן ${updated.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} ${updated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'מתעדכן כל בוקר'}</span>
        </div>
        {feed?.marketNote && <p className="ink2" style={{ margin: 0, fontSize: '.92rem' }}>{feed.marketNote}</p>}
        {WEB && feed?.asOf && daysBetween(feed.asOf, todayISO()) > 3 && (
          <div className="banner"><Icon name="info" size={16} /><span>הבחירות כאן מ-{feed.asOf.split('-').reverse().join('.')}. העדכון של הבוקר נמצא תמיד בגרסת Claude: <a href={ARTIFACT_URL + '#grow'} target="_blank" rel="noopener noreferrer">לפתוח</a></span></div>
        )}
        {picks.length ? picks.map(p => <PickCard key={p.ticker} p={p} />) : (
          <div className="card"><p className="muted" style={{ margin: 0 }}>{feed === undefined ? 'טוען…' : WEB ? 'אין חיבור כרגע. הבחירות האחרונות יופיעו כאן כשהחיבור יחזור.' : 'הבחירות נכתבות לכאן אוטומטית בכל בוקר מסחר, כשהאפליקציה פתוחה ב-Claude.'}</p></div>
        )}
        <details className="card flat">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>איך נבחרת מניה של 5 כוכבים?</summary>
          <ol style={{ margin: '10px 0 0', paddingInlineStart: 20, display: 'grid', gap: 6, fontSize: '.9rem' }} className="ink2">
            <li><b>קונצנזוס:</b> לפחות 15 אנליסטים מכסים, ו-75% ומעלה ממליצים לקנות.</li>
            <li><b>פוטנציאל:</b> מחיר היעד הממוצע ל-12 חודשים גבוה ב-15% לפחות מהמחיר.</li>
            <li><b>מומנטום:</b> תחזיות הרווח עולות, או שבתי השקעות גדולים העלו המלצה החודש.</li>
            <li><b>איכות:</b> חברה רווחית עם תזרים מזומנים חיובי ומאזן בריא.</li>
            <li><b>כסף חכם:</b> מנהלים קונים מניות בכסף שלהם, או דוח חזק עם תחזית שהועלתה.</li>
          </ol>
          {feed?.method && <p className="muted" style={{ fontSize: '.84rem', marginBottom: 0 }}>{feed.method}</p>}
          <p className="muted" style={{ fontSize: '.8rem', marginBottom: 0 }}>אופק של 6 עד 12 חודשים. מקסימום 2 מניות מאותו ענף. זה מחקר אוטומטי, לא ייעוץ השקעות, ואין שיטה שמבטיחה רווח.</p>
        </details>
        {feed?.avoid?.length ? (
          <div className="card tight">
            <div className="eyebrow" style={{ marginBottom: 6 }}>להתרחק כרגע</div>
            <div className="list">
              {feed.avoid.map(a => (
                <div key={a.ticker} className="li" style={{ alignItems: 'flex-start' }}>
                  <span className="ticker" style={{ fontSize: '1rem', minWidth: 56, color: 'var(--spend)' }}>{a.ticker}</span>
                  <span className="grow ink2" style={{ fontSize: '.88rem', whiteSpace: 'normal' }}>{a.reason}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {track?.rows?.length ? (
          <div className="card tight">
            <div className="sec-head" style={{ marginBottom: 6 }}>
              <span className="eyebrow">איך הבחירות הקודמות עשו</span>
              {track.summary?.beat != null && <span className="pill gold">{pct(track.summary.beat)} עקפו את S&P 500</span>}
            </div>
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>תאריך</th><th>מניה</th><th>כוכבים</th><th>תשואה</th><th>S&amp;P 500</th></tr></thead>
                <tbody>
                  {track.rows.slice(-12).reverse().map(r => (
                    <tr key={r.date + r.ticker}>
                      <td className="num">{r.date.split('-').reverse().slice(0, 2).join('.')}</td>
                      <td className="ltr" style={{ fontWeight: 700 }}>{r.ticker}</td>
                      <td><Stars n={r.stars} size={10} /></td>
                      <td className={`num ${(r.ret ?? 0) >= 0 ? 'up' : 'down'}`}>{r.ret == null ? '–' : pct(r.ret, 1)}</td>
                      <td className="num muted">{r.spy == null ? '–' : pct(r.spy, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {s && (
        <section className="card stack" aria-labelledby="scan-h">
          <div className="sec-head">
            <h2 className="h-sec" id="scan-h" style={{ fontSize: '1.08rem' }}>סורק הקונצנזוס</h2>
            <a className="link" href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer">ללוח המלא <Icon name="external-link" size={14} /></a>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {s.phaseName && <span className="pill gold">{s.phase} · {s.phaseName}{s.phaseDates ? ` · ${s.phaseDates}` : ''}</span>}
            <span className={`pill ${s.isLive ? 'good' : ''}`}>{s.isLive ? 'המלצה חיה' : 'בבדיקה, עוד לא המלצה'}</span>
          </div>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <span className="eyebrow">הבחירה היומית של הסורק</span>
              <span className="ticker" style={{ color: 'var(--accent)' }}>{s.pickToday?.ticker || '—'}</span>
              <span className="muted" style={{ fontSize: '.84rem', maxWidth: '22rem' }}>{s.pickToday?.ticker ? `${s.pickToday.n_sources ?? ''} מקורות מדויקים מסכימים` : s.pickToday?.note || 'אין היום קונצנזוס שעובר את הכלל. יום בלי בחירה עדיף על בחירה חלשה.'}</span>
            </div>
            <div style={{ display: 'grid', gap: 2, textAlign: 'end' }}>
              <span className="eyebrow">פגיעה ב-5 ימים</span>
              <span className="figure-m">{s.liveN ? pct(s.liveHit5 ?? 0) : s.oosHit5 != null ? pct(s.oosHit5) : '–'}</span>
              <span className="muted" style={{ fontSize: '.76rem' }}>{s.liveN ? `${s.liveN} בחירות חיות` : s.oosN ? `בדיקה היסטורית, ${s.oosN} ימים` : ''}</span>
            </div>
          </div>
          {s.lesson && <div className="banner"><Icon name="info" size={16} /><span>{s.lesson}</span></div>}
        </section>
      )}

      {feed?.market?.length ? (
        <section className="stack" aria-labelledby="mkt-h">
          <h2 className="h-sec" id="mkt-h">דופק השוק</h2>
          <div className="mkt">
            {feed.market.map(m => (
              <div key={m.key} className="tile">
                <span className="k">{m.label || m.key}</span>
                <span className="v ltr" style={{ textAlign: 'right' }}>{m.value == null ? '–' : m.unit === '%' ? `${num(m.value, 2)}%` : num(m.value, m.value < 100 ? 3 : m.value < 10000 ? 2 : 0)}</span>
                {m.changePct != null && (m.changePct === 0
                  ? <span className="d">ללא שינוי</span>
                  : <span className={`d ${m.changePct > 0 ? 'up' : 'down'}`} style={{ fontWeight: 700 }}>{m.changePct > 0 ? '▲' : '▼'} {Math.abs(m.changePct).toFixed(2)}%</span>)}
                {m.asOf && <span className="d">{m.asOf.split('-').reverse().slice(0, 2).join('.')}</span>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="cs-h">
        <h2 className="h-sec" id="cs-h" style={{ fontSize: '1.08rem' }}>ליבה ולוויין</h2>
        <p className="ink2" style={{ margin: 0, fontSize: '.92rem' }}>הליבה, 90% ומעלה, במדדים רחבים וזולים: S&amp;P 500 או מדד עולמי. הלוויין, עד 10%, לבחירות כמו אלה שלמעלה. כך הדעה שלך על מניה אחת לא מסכנת את העתיד.</p>
        <div className="tiles" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="tile"><span className="k">הליבה שלך היום</span><span className="v money">{fmt(w.invest * 0.9)}</span></div>
          <div className="tile"><span className="k">מקסימום למניות בודדות</span><span className="v money gold">{fmt(satellite)}</span></div>
        </div>
      </section>

      <section className="card stack" aria-labelledby="tm-h">
        <div className="sec-head"><h2 className="h-sec" id="tm-h" style={{ fontSize: '1.08rem' }}>מכונת הזמן</h2><span className="h-sub">ריבית דריבית</span></div>
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow">בעוד {years} שנים</div>
          <div className="figure money" style={{ fontSize: '2.4rem', marginTop: 4 }}>{ilsCompact(last.total)}</div>
          <div className="muted" style={{ fontSize: '.86rem' }}>מתוכם <b className="ink2 money">{ils(last.paid)}</b> הפקדות ו-<b className="up money">{ils(last.total - last.paid)}</b> רווח שהכסף עשה לבד</div>
        </div>
        <CompoundChart rows={series} />
        <label className="field"><span>הפקדה חודשית: <b className="ink2">{ils(monthly)}</b></span>
          <input type="range" id="sim-monthly" min={100} max={20000} step={100} value={monthly} onChange={e => setMonthly(+e.target.value)} /></label>
        <label className="field"><span>שנים: <b className="ink2">{years}</b></span>
          <input type="range" id="sim-years" min={1} max={45} value={years} onChange={e => setYears(+e.target.value)} /></label>
        <label className="field"><span>תשואה שנתית: <b className="ink2">{ret}%</b> <span className="muted">(S&amp;P 500 מאז 1957: כ-10% בשנה לפני אינפלציה)</span></span>
          <input type="range" id="sim-ret" min={2} max={12} value={ret} onChange={e => setRet(+e.target.value)} /></label>
        <div className="muted" style={{ fontSize: '.8rem' }}>ההתחלה כוללת את יתרת קופת ההשקעות שלך ({ils(w.invest)}). תשואות עבר אינן מבטיחות תשואות עתידיות.</div>
      </section>

      <section className="card stack" aria-labelledby="fi-h">
        <h2 className="h-sec" id="fi-h" style={{ fontSize: '1.08rem' }}>מספר החירות שלך</h2>
        {avgM > 0 ? (
          <>
            <p className="ink2" style={{ margin: 0, fontSize: '.9rem' }}>25 פעמים ההוצאות השנתיות שלך. מהסכום הזה אפשר למשוך כ-4% בשנה לאורך עשרות שנים (מחקר טריניטי, 1998).</p>
            <div className="row between"><span className="figure-m money">{fmt(fiNumber)}</span><span className="pill gold">{pct(fiNumber ? fiAssets / fiNumber : 0)} בדרך</span></div>
            <Bar value={fiNumber ? fiAssets / fiNumber : 0} tone="gold" />
            <div className="ink2" style={{ fontSize: '.9rem' }}>
              {yrs === null ? 'בקצב החיסכון הנוכחי היעד רחוק. כל אחוז חיסכון נוסף מקרב אותו.' : yrs === 0 ? 'הגעת. הכסף שלך יכול לממן את החיים שלך.' : <>בקצב הנוכחי: עוד <b>{yrs} שנים</b>.</>}
              {yrs !== null && yrsMore !== null && yrs - yrsMore > 0 && <> אם תחסוך עוד 5% מההכנסה: <b className="up">{yrs - yrsMore} שנים מוקדם יותר</b>.</>}
            </div>
            <div className="muted" style={{ fontSize: '.78rem' }}>מבוסס על ממוצע ההוצאות ({fmt(avgM)} לחודש), השקעות ופנסיה ({fmt(fiAssets)}), ותשואה ריאלית של 5%.</div>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>אחרי חודש של רישום, יופיע כאן מתי הכסף שלך יוכל לממן את החיים שלך.</p>}
      </section>

      <section className="stack" aria-labelledby="il-h">
        <h2 className="h-sec" id="il-h">ארגז הכלים הישראלי</h2>
        <div className="card tight">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="glyph gold"><Icon name="scale" /></span>
            <div className="grow" style={{ fontSize: '.9rem' }}>
              <b>דמי ניהול: 0.2% מול 0.7%</b>
              <div className="ink2">על הפקדה של {ils(monthly)} בחודש ל-30 שנה, ההפרש הוא <b className="gold">{ils(feeGap)}</b>. ג׳ון בוגל: "אל תתנו לרודנות של עלויות מצטברות לבלוע את הקסם של תשואות מצטברות".</div>
            </div>
          </div>
        </div>
        {ISRAEL_TOOLS.map(t => (
          <details key={t.id} className="card tight">
            <summary className="row" style={{ cursor: 'pointer', listStyle: 'none' }}>
              <span className="glyph"><Icon name={t.icon} /></span>
              <span className="grow" style={{ display: 'grid' }}><b>{t.title}</b><span className="muted" style={{ fontSize: '.82rem' }}>{t.what}</span></span>
              <Icon name="chevron-down" className="muted" />
            </summary>
            <div className="stack" style={{ gap: 6, marginTop: 10, fontSize: '.9rem' }}>
              <div className="ink2">{t.why}</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4 }}>
                {(feed?.facts?.[t.id] ? [feed.facts[t.id]] : []).concat(t.facts).map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              {t.src && <a className="muted" style={{ fontSize: '.78rem' }} href={t.src} target="_blank" rel="noopener noreferrer">מקור · {t.asOf}</a>}
            </div>
          </details>
        ))}
        <p className="muted" style={{ fontSize: '.78rem', margin: 0 }}>מידע כללי ולא ייעוץ השקעות או מס. לפני החלטה גדולה כדאי לבדוק מול יועץ פנסיוני או השקעות מורשה.</p>
      </section>
    </div>
  );
}
