import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../state';
import { Icon, Seg, Sheet, Switch } from '../ui/kit';
import { useFmt } from '../ui/parts';
import { BUCKET_ICONS, Bucket, BucketKind, HOLDING_SUBS, Holding, HoldingSub, Recurring, Tx, catById, uid, EXPENSE_CATS, INCOME_CATS } from '../lib/model';
import { addDays, ils, pct, todayISO, ymOf, addMonths, daysBetween } from '../lib/format';
import { allTx, avgMonthlyExpense, byCategory, bucketBalances, freedomDays, periodOf, safeToSpend, sums, trailingSavingsRate, txInRange, wealth, ladder, LEVELS } from '../lib/calc';
import { MASTERMIND, RESEARCH } from '../lib/mastermind';
import { makeDemo, stripDemo, hasDemo } from '../lib/demo';
import { cap } from '../lib/claude';
import { Meta, openWithPasscode, rewrap, newRecoveryCode } from '../lib/crypto';
import { readFile, detect, extract, Mapping, Row, Parsed } from '../lib/importer';
import { exportBackup, saveFile } from '../lib/backup';
import { WEB } from '../lib/env';
import { guessCategory } from '../lib/merchants';

// ---------- onboarding / profile ----------
export function OnboardSheet() {
  const { v, setCore, setVault, close, toast } = useApp();
  const p = v.core.profile;
  const [name, setName] = useState(p.name);
  const [income, setIncome] = useState(p.income ? String(p.income) : '');
  const [hours, setHours] = useState(String(p.hours || 182));
  const [rate, setRate] = useState(Math.round(p.saveRate * 100));
  const [day, setDay] = useState(p.startDay);
  const [demo, setDemo] = useState(false);
  const empty = allTx(v).length === 0;

  function done() {
    const inc = Math.max(0, parseFloat(income) || 0);
    setCore(c => ({ ...c, onboarded: true, profile: { ...c.profile, name: name.trim().slice(0, 30), income: inc, hours: Math.max(20, parseFloat(hours) || 182), saveRate: rate / 100, startDay: day } }));
    if (demo && empty) {
      setVault(cur => { const d = makeDemo(cur.core); return { core: d.core, months: d.months }; });
      toast('נתוני הדוגמה נטענו. אפשר למחוק אותם בהגדרות');
    } else toast('הפרופיל נשמר');
    close();
  }

  return (
    <Sheet title={v.core.onboarded ? 'הפרופיל שלי' : 'ארבע שאלות קצרות'} onClose={done} labelledBy="ob-h"
      footer={<button className="btn primary block" onClick={done}>{v.core.onboarded ? 'שמירה' : 'מתחילים'}</button>}>
      <div className="stack">
        {!v.core.onboarded && <p className="ink2" style={{ margin: 0, fontSize: '.92rem' }}>מהתשובות האלה האפליקציה מחשבת כמה בטוח להוציא כל יום, כמה שווה שעה מהזמן שלך, ומתי תגיע לחירות כלכלית. אפשר לשנות הכול אחר כך.</p>}
        <label className="field"><span>איך לקרוא לך?</span><input id="ob-name" className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" /></label>
        <label className="field"><span>הכנסה חודשית נטו (בערך)</span><input id="ob-income" className="input ltr" inputMode="decimal" value={income} onChange={e => setIncome(e.target.value.replace(/[^\d.]/g, ''))} placeholder="₪" /></label>
        <label className="field"><span>כמה שעות אתה עובד בחודש? <span className="muted">(משרה מלאה ≈ 182)</span></span><input id="ob-hours" className="input ltr" inputMode="numeric" value={hours} onChange={e => setHours(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="field"><span>יעד חיסכון: <b className="ink2">{rate}% מההכנסה</b> <span className="muted">(כלל 50/30/20 ממליץ על 20%)</span></span>
          <input type="range" id="ob-rate" min={5} max={60} step={1} value={rate} onChange={e => setRate(+e.target.value)} /></label>
        <label className="field"><span>החודש הפיננסי מתחיל ב-</span>
          <select id="ob-day" className="input" value={day} onChange={e => setDay(+e.target.value)}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d === 1 ? '1 בחודש (רגיל)' : `${d} בחודש${d === 10 ? ' (יום משכורת נפוץ)' : ''}`}</option>)}
          </select></label>
        {empty && (
          <div className="row between card flat tight">
            <span style={{ fontSize: '.9rem' }}><b>לטעון נתוני דוגמה?</b><br /><span className="muted">שלושה חודשים לדוגמה כדי לראות הכול בפעולה. נמחקים בלחיצה.</span></span>
            <Switch on={demo} onChange={setDemo} label="נתוני דוגמה" />
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------- buckets ----------
export function BucketSheet({ id }: { id?: string }) {
  const { v, setCore, close, toast, open } = useApp();
  const b = v.core.buckets.find(x => x.id === id);
  const bal = bucketBalances(v);
  const [name, setName] = useState(b?.name || '');
  const [icon, setIcon] = useState(b?.icon || 'flag');
  const [kind, setKind] = useState<BucketKind>(b?.kind || 'goal');
  const [target, setTarget] = useState(b?.target ? String(b.target) : '');
  const [deadline, setDeadline] = useState(b?.deadline || addMonths(ymOf(todayISO()), 12));
  const [start, setStart] = useState(b ? '' : '');
  const [monthly, setMonthly] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const t = parseFloat(target) || 0;
  const months = Math.max(1, (Number(deadline.slice(0, 4)) - Number(todayISO().slice(0, 4))) * 12 + Number(deadline.slice(5, 7)) - Number(todayISO().slice(5, 7)));
  const perMonth = t > 0 ? Math.max(0, (t - (b ? bal[b.id] || 0 : parseFloat(start) || 0)) / months) : 0;

  function save() {
    if (!name.trim()) return;
    const nb: Bucket = { ...(b || { id: 'b_' + uid().slice(0, 10), created: Date.now(), start: parseFloat(start) || 0 }), name: name.trim().slice(0, 30), icon, kind, target: t || undefined, deadline: kind === 'goal' && t ? deadline : undefined };
    setCore(c => {
      const buckets = b ? c.buckets.map(x => (x.id === b.id ? nb : x)) : [...c.buckets, nb];
      const recurring = monthly && perMonth > 0
        ? [...c.recurring, { id: uid(), t: 'save' as const, a: Math.ceil(perMonth / 10) * 10, c: nb.id, n: 'הפקדה חודשית', day: 10, start: `${ymOf(addDays(todayISO(), 20))}-10`, active: true }]
        : c.recurring;
      return { ...c, buckets, recurring };
    });
    toast(b ? 'הקופה עודכנה' : 'קופה חדשה נפתחה');
    close();
  }
  function remove() {
    if (!b) return;
    setCore(c => ({ ...c, buckets: c.buckets.filter(x => x.id !== b.id), recurring: c.recurring.filter(r => r.c !== b.id) }));
    toast('הקופה נמחקה');
    close();
  }

  return (
    <Sheet title={b ? 'עריכת קופה' : 'קופה חדשה'} onClose={close} labelledBy="bk-h"
      footer={<div className="row">{b && <button className="btn danger" onClick={() => (confirmDel ? remove() : setConfirmDel(true))}>{confirmDel ? 'למחוק?' : <Icon name="trash-2" />}</button>}<button className="btn primary grow" onClick={save} disabled={!name.trim()}>שמירה</button></div>}>
      <div className="stack">
        {b && <div className="card flat tight row between"><span>יתרה</span><b className="money">{ils(bal[b.id] || 0)}</b></div>}
        <label className="field"><span>שם</span><input id="bk-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="למשל: דירה, רכב, טיול" /></label>
        <Seg<BucketKind> value={kind} onChange={setKind} options={[{ v: 'goal', label: 'מטרה' }, { v: 'emergency', label: 'חירום' }, { v: 'invest', label: 'השקעה' }]} />
        <div className="chips" style={{ flexWrap: 'wrap' }}>{BUCKET_ICONS.map(ic => <button key={ic} className="chip" aria-pressed={icon === ic} onClick={() => setIcon(ic)} aria-label={ic}><Icon name={ic} size={16} /></button>)}</div>
        <label className="field"><span>סכום יעד</span><input id="bk-target" className="input ltr" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="₪ (לא חובה)" /></label>
        {kind === 'goal' && t > 0 && (
          <label className="field"><span>עד מתי?</span><input id="bk-deadline" type="month" className="input ltr" value={deadline} min={ymOf(todayISO())} onChange={e => setDeadline(e.target.value)} /></label>
        )}
        {!b && <label className="field"><span>כמה כבר יש בה?</span><input id="bk-start" className="input ltr" inputMode="decimal" value={start} onChange={e => setStart(e.target.value.replace(/[^\d.]/g, ''))} placeholder="₪0" /></label>}
        {perMonth > 0 && (
          <div className="card flat tight stack" style={{ gap: 8 }}>
            <div>כדי להגיע ליעד: <b className="gold money">{ils(perMonth)}</b> בחודש</div>
            <div className="row between"><span style={{ fontSize: '.88rem' }}>לקבוע הפקדה אוטומטית ב-10 לכל חודש</span><Switch on={monthly} onChange={setMonthly} label="הפקדה אוטומטית" /></div>
            <span className="muted" style={{ fontSize: '.78rem' }}>תוכנית עם יום קבוע מגדילה את הסיכוי לבצע (גולוויצר ושירן, 2006). הגדר הוראת קבע תואמת בבנק.</span>
          </div>
        )}
        {b && <button className="btn ghost" onClick={() => open({ k: 'add', preset: { t: 'withdraw', c: b.id } })}><Icon name="arrow-up-right" size={16} /> משיכה מהקופה</button>}
      </div>
    </Sheet>
  );
}

// ---------- holdings ----------
export function HoldingSheet({ id }: { id?: string }) {
  const { v, setCore, close, toast } = useApp();
  const h = v.core.holdings.find(x => x.id === id);
  const [name, setName] = useState(h?.name || '');
  const [sub, setSub] = useState<HoldingSub>(h?.sub || 'checking');
  const [value, setValue] = useState(h ? String(h.value) : '');
  const kind = HOLDING_SUBS.find(s => s.id === sub)!.kind;
  function save() {
    const val = parseFloat(value) || 0;
    const nh: Holding = { id: h?.id || uid(), name: name.trim() || HOLDING_SUBS.find(s => s.id === sub)!.name, kind, sub, value: val, updated: Date.now() };
    setCore(c => ({ ...c, holdings: h ? c.holdings.map(x => (x.id === h.id ? nh : x)) : [...c.holdings, nh] }));
    toast('נשמר');
    close();
  }
  return (
    <Sheet title={h ? 'עדכון ערך' : 'נכס או חוב'} onClose={close} labelledBy="hd-h"
      footer={<div className="row">{h && <button className="btn danger" onClick={() => { setCore(c => ({ ...c, holdings: c.holdings.filter(x => x.id !== h.id) })); close(); }}><Icon name="trash-2" /></button>}<button className="btn primary grow" onClick={save}>שמירה</button></div>}>
      <div className="stack">
        <label className="field"><span>סוג</span>
          <select id="hd-sub" className="input" value={sub} onChange={e => setSub(e.target.value as HoldingSub)}>
            <optgroup label="נכסים">{HOLDING_SUBS.filter(s => s.kind === 'asset').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
            <optgroup label="חובות">{HOLDING_SUBS.filter(s => s.kind === 'debt').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          </select></label>
        <label className="field"><span>שם</span><input id="hd-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder={HOLDING_SUBS.find(s => s.id === sub)!.name} /></label>
        <label className="field"><span>{kind === 'debt' ? 'יתרת החוב' : 'שווי נוכחי'}</span><input id="hd-value" className="input ltr" inputMode="decimal" value={value} onChange={e => setValue(e.target.value.replace(/[^\d.]/g, ''))} placeholder="₪" /></label>
        {sub === 'pension' && <p className="muted" style={{ margin: 0, fontSize: '.82rem' }}>את היתרה המדויקת אפשר לראות בדוח השנתי או במסלקה הפנסיונית (הר הכסף).</p>}
      </div>
    </Sheet>
  );
}

// ---------- recurring ----------
export function RecurringSheet() {
  const { v, setCore, close } = useApp();
  const fmt = useFmt();
  const list = v.core.recurring;
  const monthly = (t: Recurring['t']) => list.filter(r => r.active && r.t === t).reduce((a, r) => a + r.a, 0);
  const label = (r: Recurring) => r.t === 'save' || r.t === 'withdraw' ? v.core.buckets.find(b => b.id === r.c)?.name : catById(v.core, r.c)?.name;
  return (
    <Sheet title="קבועים" onClose={close} labelledBy="rc-h">
      <div className="stack">
        <div className="tiles">
          <div className="tile"><span className="k">הכנסות קבועות</span><span className="v money" style={{ color: 'var(--c-income)' }}>{fmt(monthly('income'))}</span></div>
          <div className="tile"><span className="k">חיובים קבועים</span><span className="v money">{fmt(monthly('expense'))}</span><span className="d">{fmt(monthly('expense') * 12)} בשנה</span></div>
          <div className="tile"><span className="k">חיסכון אוטומטי</span><span className="v money up">{fmt(monthly('save'))}</span></div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '.84rem' }}>קבועים נרשמים לבד ביום שלהם. כדי להוסיף, סמן "חוזר כל חודש" ברישום תנועה.</p>
        {list.length ? (
          <div className="list">
            {list.map(r => (
              <div key={r.id} className="li">
                <span className={`glyph ${r.t}`}><Icon name={r.t === 'save' ? 'piggy-bank' : catById(v.core, r.c)?.icon || 'repeat'} /></span>
                <span className="grow" style={{ display: 'grid' }}><span className="t">{r.n || label(r)}</span><span className="s">כל {r.day} בחודש · {label(r)}</span></span>
                <span className="amt money" style={{ opacity: r.active ? 1 : 0.4 }}>{fmt(r.a)}</span>
                <Switch on={r.active} onChange={on => setCore(c => ({ ...c, recurring: c.recurring.map(x => (x.id === r.id ? { ...x, active: on, last: on ? addMonths(ymOf(todayISO()), new Date().getDate() >= x.day ? 0 : -1) : x.last } : x)) }))} label={`${r.n || label(r)} פעיל`} />
                <button className="icon-btn" onClick={() => setCore(c => ({ ...c, recurring: c.recurring.filter(x => x.id !== r.id) }))} aria-label="מחיקה"><Icon name="trash-2" size={18} /></button>
              </div>
            ))}
          </div>
        ) : <p className="muted">עוד אין קבועים.</p>}
      </div>
    </Sheet>
  );
}

// ---------- budget cap ----------
export function BudgetSheet({ cat }: { cat: string }) {
  const { v, setCore, close, toast } = useApp();
  const c = catById(v.core, cat);
  const cur = v.core.budgets[cat];
  const avg = useMemo(() => {
    const sd = v.core.profile.startDay;
    let sum = 0, n = 0;
    for (let i = 1; i <= 3; i++) {
      const p = periodOf(addDays(periodOf(todayISO(), sd).start, -1 - (i - 1) * 30), sd);
      const a = txInRange(v, p.start, p.end).filter(t => t.t === 'expense' && t.c === cat).reduce((x, t) => x + t.a, 0);
      if (a > 0) { sum += a; n++; }
    }
    return n ? sum / n : 0;
  }, [v, cat]);
  const [val, setVal] = useState(cur ? String(cur) : avg ? String(Math.round((avg * 0.9) / 10) * 10) : '');
  return (
    <Sheet title={`תקרה ל${c?.name || ''}`} onClose={close} labelledBy="bd-h"
      footer={<div className="row">{cur && <button className="btn ghost" onClick={() => { setCore(x => { const b = { ...x.budgets }; delete b[cat]; return { ...x, budgets: b }; }); close(); }}>הסרה</button>}
        <button className="btn primary grow" onClick={() => { const n = parseFloat(val) || 0; setCore(x => ({ ...x, budgets: { ...x.budgets, [cat]: n } })); toast('התקרה נשמרה'); close(); }}>שמירה</button></div>}>
      <div className="stack">
        <label className="field"><span>תקרה חודשית</span><input id="bd-val" className="input ltr" inputMode="decimal" value={val} onChange={e => setVal(e.target.value.replace(/[^\d.]/g, ''))} autoFocus /></label>
        {avg > 0 && <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>הממוצע שלך: {ils(avg)} בחודש. התחלה של 10% מתחת לממוצע היא יעד שאפשר לעמוד בו.</p>}
      </div>
    </Sheet>
  );
}

// ---------- weekly review ----------
export function ReviewSheet() {
  const { v, setCore, close, toast, open } = useApp();
  const fmt = useFmt();
  const [step, setStep] = useState(0);
  const [worth, setWorth] = useState<'yes' | 'no' | null>(null);
  const today = todayISO();
  const wk = (from: string, to: string) => sums(txInRange(v, from, to), v.core);
  const thisW = wk(addDays(today, -6), today), lastW = wk(addDays(today, -13), addDays(today, -7));
  const wantCats = byCategory(txInRange(v, addDays(today, -6), today).filter(t => t.t === 'expense' && (t.nw || catById(v.core, t.c)?.nw) === 'want'), 'expense');
  const leak = wantCats[0];
  const leakCat = leak ? catById(v.core, leak.c) : null;
  const diff = thisW.expense - lastW.expense;
  const save = Math.max(50, Math.round((Math.max(0, safeToSpend(v).available) * 0.15) / 10) * 10);
  const commits = [
    { id: 'save', label: `להעביר ${ils(save)} לחיסכון עכשיו`, go: () => open({ k: 'add', preset: { t: 'save', a: save } }) },
    ...(leakCat ? [{ id: 'cap', label: `תקרה ל${leakCat.name}`, go: () => open({ k: 'budget', cat: leak!.c }) }] : []),
    { id: 'nospend', label: 'שני ימים בלי הוצאות השבוע', go: () => close() },
    { id: 'subs', label: 'לבדוק ולבטל מנוי אחד', go: () => open({ k: 'recurring' }) },
  ];
  function finish(cid: string, go: () => void) {
    const label = commits.find(c => c.id === cid)!.label;
    setCore(c => ({ ...c, reviews: [...c.reviews, { date: today, commitment: label }].slice(-104) }));
    toast('הסקירה נשמרה. נתראה בשבוע הבא');
    go();
  }
  return (
    <Sheet title="סקירת השבוע" onClose={close} labelledBy="rv-h">
      <div className="stack">
        <div className="row" style={{ gap: 6 }}>{[0, 1, 2].map(i => <span key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? 'var(--gold)' : 'var(--surface-2)' }} />)}</div>
        {step === 0 && (
          <>
            <h3 style={{ fontFamily: 'var(--f-display)', fontSize: '1.2rem' }}>השבוע במספרים</h3>
            <div className="tiles">
              <div className="tile"><span className="k">הוצאות</span><span className="v money">{fmt(thisW.expense)}</span><span className={`d ${diff > 0 ? 'down' : 'up'}`}>{lastW.expense ? `${diff > 0 ? '+' : '−'}${ils(Math.abs(diff))} משבוע שעבר` : ''}</span></div>
              <div className="tile"><span className="k">הכנסות</span><span className="v money">{fmt(thisW.income)}</span></div>
              <div className="tile"><span className="k">לעתיד</span><span className="v money up">{fmt(thisW.save)}</span></div>
            </div>
            <p className="ink2" style={{ margin: 0 }}>{diff <= 0 ? 'הוצאת פחות מהשבוע שעבר. זה בדיוק הכיוון.' : 'הוצאת יותר מהשבוע שעבר. לא נורא, השבוע הבא מתחיל עכשיו.'}</p>
            <button className="btn primary block" onClick={() => setStep(1)}>הבא</button>
          </>
        )}
        {step === 1 && (
          <>
            <h3 style={{ fontFamily: 'var(--f-display)', fontSize: '1.2rem' }}>דליפה אחת</h3>
            {leak ? (
              <>
                <p style={{ margin: 0 }}>השבוע הלכו <b className="money">{ils(leak.a)}</b> על {leakCat?.name}, ב-{leak.n} פעולות.</p>
                <p className="ink2" style={{ margin: 0 }}>זה היה שווה את זה?</p>
                <div className="row"><button className="btn ghost grow" aria-pressed={worth === 'yes'} onClick={() => setWorth('yes')}>כן, שווה</button><button className="btn ghost grow" aria-pressed={worth === 'no'} onClick={() => setWorth('no')}>לא ממש</button></div>
                {worth && <p className="muted" style={{ margin: 0, fontSize: '.88rem' }}>{worth === 'yes' ? 'מעולה. להוציא בלי אשמה על מה שחשוב לך זה חלק מתוכנית טובה.' : 'בדיוק בשביל זה עושים סקירה. התחייבות קטנה בשלב הבא תעזור.'}</p>}
              </>
            ) : <p className="ink2" style={{ margin: 0 }}>לא נרשמו השבוע הוצאות מסוג "רצון". שבוע ממושמע.</p>}
            <button className="btn primary block" onClick={() => setStep(2)}>הבא</button>
          </>
        )}
        {step === 2 && (
          <>
            <h3 style={{ fontFamily: 'var(--f-display)', fontSize: '1.2rem' }}>התחייבות אחת לשבוע הבא</h3>
            <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>צעד אחד קטן וברור עובד יותר מעשר החלטות גדולות.</p>
            {commits.map(c => <button key={c.id} className="btn ghost block" style={{ justifyContent: 'space-between' }} onClick={() => finish(c.id, c.go)}>{c.label}<Icon name="chevron-left" /></button>)}
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------- mastermind ----------
export function MastermindSheet() {
  const { close } = useApp();
  const [tab, setTab] = useState<'people' | 'research'>('people');
  return (
    <Sheet title="המאסטרמיינד" onClose={close} full labelledBy="mm-h">
      <div className="stack">
        <p className="ink2" style={{ margin: 0 }}>כל החלטה באפליקציה נשענת על עבודה שפורסמה של 20 מומחים בכלכלה התנהגותית, השקעות, הרגלים ועיצוב, ועל מחקרים שמדדו מה באמת משנה התנהגות. הם לא היו מעורבים בבנייה; אלה העקרונות שלהם, בפעולה.</p>
        <Seg<'people' | 'research'> value={tab} onChange={setTab} options={[{ v: 'people', label: '20 המומחים' }, { v: 'research', label: 'המחקר' }]} />
        {tab === 'people' ? MASTERMIND.map((e, i) => (
          <article key={e.name} className="card tight stack" style={{ gap: 6 }}>
            <div className="row between"><b style={{ fontSize: '1.02rem' }}>{e.name}</b><span className="muted num" style={{ fontSize: '.8rem' }}>{i + 1}/20</span></div>
            <span className="eyebrow">{e.field}</span>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: '1.02rem' }}>{e.principle}</div>
            <div className="ink2" style={{ fontSize: '.88rem' }}><b className="gold">באפליקציה: </b>{e.applied}</div>
          </article>
        )) : RESEARCH.map(f => (
          <article key={f.title} className="card tight stack" style={{ gap: 6 }}>
            <b>{f.title}</b>
            <div className="ink2" style={{ fontSize: '.9rem' }}>{f.result}</div>
            <div style={{ fontSize: '.88rem' }}><b className="gold">באפליקציה: </b>{f.applied}</div>
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="muted" style={{ fontSize: '.78rem' }}>למקור</a>
          </article>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- AI coach ----------
const SUGGEST = ['איך לחסוך עוד ₪500 החודש?', 'אני בדרך הנכונה לחירות כלכלית?', 'מה לעשות עם בונוס של ₪10,000?', 'איך לבנות קרן חירום מהר יותר?', 'תכין לי תוכנית ל-90 יום'];

export function CoachSheet({ q }: { q?: string }) {
  const { v, setCore, close } = useApp();
  const [input, setInput] = useState(q || '');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<{ me: boolean; text: string }[]>(() => (v.core.coachLog || []).slice(-3).flatMap(x => [{ me: true, text: x.q }, { me: false, text: x.a }]));
  const [err, setErr] = useState('');
  const abort = useRef<AbortController | null>(null);

  function context() {
    const p = periodOf(todayISO(), v.core.profile.startDay);
    const s = sums(txInRange(v, p.start, todayISO()), v.core);
    const w = wealth(v);
    const lad = ladder(v);
    return {
      today: todayISO(), dayOfPeriod: daysBetween(p.start, todayISO()) + 1, periodDays: p.days,
      profile: { monthlyNetIncome: v.core.profile.income, savingsTargetPct: Math.round(v.core.profile.saveRate * 100) },
      thisMonth: { income: Math.round(s.income), expenses: Math.round(s.expense), needs: Math.round(s.need), wants: Math.round(s.want), setAside: Math.round(s.save - s.withdraw) },
      topExpenseCategories: byCategory(txInRange(v, p.start, todayISO()), 'expense').slice(0, 8).map(r => ({ category: catById(v.core, r.c)?.name, amount: Math.round(r.a) })),
      safeToSpendToday: Math.round(safeToSpend(v).leftToday),
      avgMonthlyExpenses3m: Math.round(avgMonthlyExpense(v)),
      savingsRate3m: trailingSavingsRate(v),
      emergencyFund: Math.round(w.emergency), investments: Math.round(w.invest), pensionAndHishtalmut: Math.round(w.pension), consumerDebt: Math.round(w.consumerDebt), netWorth: Math.round(w.netWorth),
      freedomDays: Math.round(freedomDays(v, w)),
      wealthLadder: { level: lad.level, next: lad.next?.name, levels: LEVELS.map(l => l.name) },
      goals: v.core.buckets.filter(b => b.kind === 'goal').map(b => ({ name: b.name, target: b.target, deadline: b.deadline })),
      recurringMonthly: v.core.recurring.filter(r => r.active).map(r => ({ type: r.t, amount: r.a, name: r.n })),
    };
  }

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setErr('');
    const sample = await cap<any>('sample');
    if (!sample) { setErr(WEB ? 'המאמן החכם זמין בגרסת Claude של האפליקציה.' : 'המאמן זמין כשהאפליקציה פתוחה ב-Claude.'); return; }
    const history = msgs.slice(-4);
    setMsgs(m => [...m, { me: true, text: question }, { me: false, text: '' }]);
    setInput('');
    setBusy(true);
    abort.current = new AbortController();
    const prompt = `אתה המאמן הפיננסי האישי באפליקציית "הון שקט" של משתמש ישראלי. ענה בעברית פשוטה וחמה, בגוף שני, עד 170 מילים.
מבנה: משפט פתיחה אחד שמתייחס למספר אמיתי מהנתונים, ואז 2 עד 4 צעדים ממוספרים וקונקרטיים עם סכומים בשקלים.
היעזר בעקרונות מוכחים: לשלם לעצמך קודם, אוטומציה וברירות מחדל, Save More Tomorrow (להעלות את אחוז החיסכון באחוז אחד בכל העלאת שכר), קופות עם שם, ניצחונות גדולים לפני ויתורים קטנים, קרן חירום לפני השקעה, מדדים זולים ומפוזרים לטווח ארוך (קרן השתלמות, קופת גמל להשקעה, קרן מחקה).
אסור: להמליץ על מניה ספציפית, להבטיח תשואה, להטיף או לבייש. אם שואלים על השקעה, הסבר עקרונות וציין בסוף בקצרה שזה לא ייעוץ השקעות מורשה.
אם חסר נתון, אמור מה כדאי לרשום באפליקציה כדי לדייק.

הנתונים (₪, מחושבים מהאפליקציה):
${JSON.stringify(context())}

${history.length ? 'שיחה קודמת:\n' + history.map(m => (m.me ? 'משתמש: ' : 'מאמן: ') + m.text).join('\n') + '\n\n' : ''}השאלה: ${question}`;
    try {
      const res = await sample(prompt, {
        signal: abort.current.signal, cache: false,
        onText: ({ text }: { text: string }) => setMsgs(m => { const n = [...m]; n[n.length - 1] = { me: false, text }; return n; }),
      });
      const answer = res?.text || '';
      setMsgs(m => { const n = [...m]; n[n.length - 1] = { me: false, text: answer }; return n; });
      setCore(c => ({ ...c, coachLog: [...(c.coachLog || []), { q: question, a: answer, at: Date.now() }].slice(-20) }));
    } catch (e: any) {
      setMsgs(m => m.slice(0, -1));
      setErr(e?.code === 'not_granted' ? 'כדי להשתמש במאמן צריך לאשר את הגישה בהודעה שקופצת.' : e?.code === 'rate_limited' ? 'יותר מדי שאלות ברצף. נסה שוב בעוד דקה.' : 'המאמן לא זמין כרגע.');
    } finally { setBusy(false); }
  }

  return (
    <Sheet title="המאמן הפיננסי" onClose={() => { abort.current?.abort(); close(); }} labelledBy="ch-h"
      footer={
        <form className="row" onSubmit={e => { e.preventDefault(); void ask(input); }}>
          <input id="coach-q" className="input grow" value={input} onChange={e => setInput(e.target.value)} placeholder="שאל כל דבר על הכסף שלך" disabled={busy} />
          <button className="btn primary" disabled={busy || !input.trim()} aria-label="שליחה"><Icon name="send" /></button>
        </form>
      }>
      <div className="stack">
        <div className="banner"><Icon name="shield-check" size={16} /><span>המאמן מקבל רק סיכומים מספריים: סכומים לפי קטגוריה, יעדים ויתרות. לא שמות של בתי עסק ולא הערות.</span></div>
        {!msgs.length && <div className="chips" style={{ flexWrap: 'wrap' }}>{SUGGEST.map(s => <button key={s} className="chip" onClick={() => void ask(s)}>{s}</button>)}</div>}
        <div className="chat" aria-live="polite">
          {msgs.map((m, i) => <div key={i} className={`msg ${m.me ? 'me' : 'ai'}`}>{m.text || (busy && i === msgs.length - 1 ? 'חושב…' : '')}</div>)}
        </div>
        {err && <div className="down" role="alert" style={{ fontSize: '.88rem' }}>{err}</div>}
        {msgs.length > 0 && !busy && <div className="chips">{SUGGEST.slice(0, 3).map(s => <button key={s} className="chip" onClick={() => void ask(s)}>{s}</button>)}</div>}
      </div>
    </Sheet>
  );
}

// ---------- import ----------
export function ImportSheet() {
  const { v, setVault, close, toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [items, setItems] = useState<(Parsed & { c: string; on: boolean; dup: boolean })[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setErr(''); setBusy(true);
    try {
      const r = await readFile(f);
      setRows(r);
      const m = detect(r);
      if (!m) { setErr('לא זיהיתי את העמודות. בחר אותן ידנית.'); setMap({ header: 0, date: 0, desc: 1, amount: 2, credit: -1 }); }
      else { setMap(m); build(r, m); }
    } catch {
      setErr('לא הצלחתי לקרוא את הקובץ. נסה CSV או Excel.');
    } finally { setBusy(false); }
  }

  function build(r: Row[], m: Mapping) {
    const existing = new Set(allTx(v).map(t => `${t.d}|${Math.round(t.a * 100)}|${(t.n || '').trim()}`));
    setItems(extract(r, m).map(p => {
      const c = guessCategory(p.n, p.t, v.core.merchantMap) || (p.t === 'income' ? (p.n.includes('זיכוי') ? 'refund' : 'other_inc') : 'other');
      const dup = existing.has(`${p.d}|${Math.round(p.a * 100)}|${p.n}`);
      return { ...p, c, on: !dup, dup };
    }));
  }

  function commit() {
    const chosen = items.filter(i => i.on);
    setVault(cur => {
      const months = { ...cur.months };
      for (const i of chosen) {
        const t: Tx = { id: uid(), t: i.t, a: Math.round(i.a * 100) / 100, c: i.c, d: i.d, n: i.n || undefined, imp: 1, ts: Date.now() };
        const ym = ymOf(t.d);
        months[ym] = [...(months[ym] || []), t];
      }
      return { ...cur, months };
    });
    toast(`${chosen.length} תנועות יובאו`);
    close();
  }

  const header = rows && map ? (rows[map.header] || []).map((c, i) => ({ i, label: String(c ?? `עמודה ${i + 1}`) })) : [];
  const cats = [...EXPENSE_CATS, ...INCOME_CATS, ...v.core.customCats];
  const on = items.filter(i => i.on);

  return (
    <Sheet title="ייבוא דף חשבון" onClose={close} labelledBy="im-h"
      footer={items.length ? <button className="btn primary block" onClick={commit} disabled={!on.length}>ייבוא {on.length} תנועות</button> : undefined}>
      <div className="stack">
        {!rows && (
          <>
            <p className="ink2" style={{ margin: 0 }}>הורד את פירוט החיובים מהאתר של חברת האשראי (מקס, ישראכרט, כאל, אמריקן אקספרס) או מהבנק, כקובץ Excel או CSV, ובחר אותו כאן. הקובץ נקרא רק בתוך האפליקציה ולא נשלח לשום מקום.</p>
            <label className="btn ghost block" style={{ position: 'relative' }}>
              <Icon name="file-spreadsheet" /> {busy ? 'קורא…' : 'בחירת קובץ'}
              <input type="file" id="im-file" accept=".csv,.xlsx,.xls,.txt" onChange={e => e.target.files?.[0] && void onFile(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
            </label>
          </>
        )}
        {err && <div className="down" role="alert">{err}</div>}
        {rows && map && (
          <details className="card flat tight" open={!items.length}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>העמודות שזוהו</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <label className="field"><span>שורת הכותרת</span><input id="im-header" className="input ltr" inputMode="numeric" value={map.header + 1} onChange={e => setMap({ ...map, header: Math.max(0, (parseInt(e.target.value) || 1) - 1) })} /></label>
              {(['date', 'desc', 'amount', 'credit'] as const).map(k => (
                <label key={k} className="field"><span>{{ date: 'תאריך', desc: 'בית עסק / תיאור', amount: 'סכום חיוב', credit: 'זכות (בדפי בנק)' }[k]}</span>
                  <select id={`im-${k}`} className="input" value={map[k]} onChange={e => setMap({ ...map, [k]: +e.target.value })}>
                    {k === 'credit' && <option value={-1}>אין</option>}
                    {header.map(h => <option key={h.i} value={h.i}>{h.label}</option>)}
                  </select></label>
              ))}
              <button className="btn ghost sm" onClick={() => build(rows, map)}>עדכון התצוגה</button>
            </div>
          </details>
        )}
        {items.length > 0 && (
          <>
            <div className="row between"><b>{items.length} תנועות נמצאו</b><span className="muted" style={{ fontSize: '.84rem' }}>{items.filter(i => i.dup).length} כבר קיימות</span></div>
            <div className="list">
              {items.slice(0, 300).map((it, idx) => (
                <div key={idx} className="li" style={{ opacity: it.on ? 1 : 0.45 }}>
                  <input type="checkbox" checked={it.on} onChange={e => setItems(a => a.map((x, j) => (j === idx ? { ...x, on: e.target.checked } : x)))} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} aria-label="לכלול" />
                  <span className="grow" style={{ display: 'grid', gap: 4 }}>
                    <span className="t">{it.n || '—'}</span>
                    <select className="input" style={{ height: 34, fontSize: '.84rem', padding: '0 8px' }} value={it.c} onChange={e => setItems(a => a.map((x, j) => (j === idx ? { ...x, c: e.target.value } : x)))} aria-label="קטגוריה">
                      {cats.filter(c => c.t === it.t).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </span>
                  <span style={{ display: 'grid', justifyItems: 'end' }}>
                    <span className={`amt ${it.t === 'income' ? 'up' : ''}`}>{it.t === 'income' ? '+' : '−'}{ils(it.a)}</span>
                    <span className="s">{it.d.split('-').reverse().join('.')}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------- settings ----------
export function SettingsSheet() {
  const { v, setCore, setVault, close, open, toast, lock, io } = useApp();
  const s = v.core.settings;
  const set = (patch: Partial<typeof s>) => setCore(c => ({ ...c, settings: { ...c.settings, ...patch } }));
  const [confirmWipe, setConfirmWipe] = useState('');

  const report = (r: string) => toast(r === 'saved' ? 'נשמר' : r === 'copied' ? 'הועתק ללוח' : r === 'declined' ? 'בוטל' : 'השמירה לא זמינה כאן');
  async function save(filename: string, data: string, mime: string) { report(await saveFile(filename, data, mime)); }

  async function exportBackupNow() {
    const r = await exportBackup(io);
    report(r);
    if (r === 'saved' || r === 'copied') setCore(c => ({ ...c, lastBackup: Date.now() }));
  }
  async function exportCSV() {
    const rows = [['תאריך', 'סוג', 'קטגוריה', 'סכום', 'הערה']];
    const tname = { expense: 'הוצאה', income: 'הכנסה', save: 'הפקדה', withdraw: 'משיכה' } as const;
    for (const t of allTx(v).sort((a, b) => a.d.localeCompare(b.d))) {
      const cname = t.t === 'save' || t.t === 'withdraw' ? v.core.buckets.find(b => b.id === t.c)?.name : catById(v.core, t.c)?.name;
      rows.push([t.d, tname[t.t], cname || '', String(t.a), (t.n || '').replace(/"/g, '""')]);
    }
    await save(`hon-shaket-${todayISO()}.csv`, '﻿' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n'), 'text/csv');
  }
  async function restore(f: File) {
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'hon-shaket' || !data.docs?.meta) throw new Error('bad');
      const cur = await io.backend.getAll();
      for (const id of Object.keys(cur)) if (!(id in data.docs)) await io.backend.del(id);
      for (const [id, doc] of Object.entries(data.docs)) await io.backend.put(id, doc as any);
      toast('הגיבוי שוחזר. פתח עם הקוד של הגיבוי');
      setTimeout(lock, 900);
    } catch { toast('הקובץ לא נראה כמו גיבוי של הון שקט'); }
  }

  return (
    <Sheet title="הגדרות" onClose={close} full labelledBy="st-h">
      <div className="stack-l">
        <section className="stack">
          <div className="eyebrow">פרופיל</div>
          <button className="li" onClick={() => open({ k: 'onboard' })}><span className="glyph"><Icon name="user" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">{v.core.profile.name || 'הפרופיל שלי'}</span><span className="s">הכנסה {ils(v.core.profile.income)} · יעד חיסכון {pct(v.core.profile.saveRate)} · חודש מתחיל ב-{v.core.profile.startDay}</span></span><Icon name="chevron-left" className="muted" /></button>
        </section>

        <section className="stack">
          <div className="eyebrow">תצוגה</div>
          <Seg<'system' | 'dark' | 'light'> value={s.theme} onChange={theme => set({ theme })} options={[{ v: 'system', label: 'אוטומטי' }, { v: 'dark', label: 'כהה' }, { v: 'light', label: 'בהיר' }]} />
          <div className="li"><span className="glyph"><Icon name="clock" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">עדשת הזמן</span><span className="s">להציג סכומים בשעות וימי עבודה</span></span><Switch on={s.lens === 'time'} onChange={on => set({ lens: on ? 'time' : 'money' })} label="עדשת הזמן" /></div>
          <div className="li"><span className="glyph"><Icon name="eye-off" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">מצב פרטיות</span><span className="s">טשטוש סכומים במקומות ציבוריים</span></span><Switch on={s.privacy} onChange={privacy => set({ privacy })} label="מצב פרטיות" /></div>
        </section>

        <section className="stack">
          <div className="eyebrow">אבטחה</div>
          <label className="li"><span className="glyph"><Icon name="lock" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">נעילה אוטומטית</span><span className="s">אחרי חוסר פעילות או יציאה מהאפליקציה</span></span>
            <select id="st-lock" className="input" style={{ width: 'auto', height: 38 }} value={s.lockMin} onChange={e => set({ lockMin: +e.target.value })}>
              {[0, 1, 3, 5, 15].map(m => <option key={m} value={m}>{m === 0 ? 'מיד' : `${m} דק׳`}</option>)}
            </select></label>
          <button className="li" onClick={() => open({ k: 'security' })}><span className="glyph"><Icon name="key-round" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">החלפת קוד וקוד שחזור</span><span className="s">AES-256-GCM · PBKDF2 עם 600,000 סבבים</span></span><Icon name="chevron-left" className="muted" /></button>
          <button className="li" onClick={lock}><span className="glyph"><Icon name="lock" /></span><span className="grow t">נעילה עכשיו</span></button>
          <div className="banner"><Icon name="shield-check" size={16} /><span>{io.backend.kind === 'cloud' ? 'הנתונים מוצפנים במכשיר לפני שהם נשמרים באזור הפרטי שלך בחשבון Claude. מי שרואה את הקובץ המאוחסן רואה רק תווים מוצפנים.' : 'הנתונים מוצפנים ונשמרים רק בטלפון הזה, לא בשום שרת. שמור גיבוי מוצפן פעם בחודש, ולמעבר לטלפון חדש: גיבוי כאן ושחזור שם.'}</span></div>
        </section>

        <section className="stack">
          <div className="eyebrow">נתונים</div>
          <button className="li" onClick={() => open({ k: 'import' })}><span className="glyph"><Icon name="upload" /></span><span className="grow t">ייבוא דף חשבון (Excel / CSV)</span></button>
          <button className="li" onClick={() => void exportBackupNow()}><span className="glyph"><Icon name="download" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">גיבוי מוצפן</span><span className="s">קובץ שנפתח רק עם הקוד שלך</span></span></button>
          <label className="li" style={{ position: 'relative' }}><span className="glyph"><Icon name="refresh-cw" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">שחזור מגיבוי</span><span className="s">מחליף את הנתונים הנוכחיים</span></span>
            <input type="file" id="st-restore" accept=".json" onChange={e => e.target.files?.[0] && void restore(e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} /></label>
          <button className="li" onClick={() => void exportCSV()}><span className="glyph"><Icon name="file-spreadsheet" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">ייצוא ל-CSV</span><span className="s">לא מוצפן. לשימוש באקסל</span></span></button>
          {hasDemo(v) && <button className="li" onClick={() => { setVault(stripDemo); toast('נתוני הדוגמה נמחקו'); }}><span className="glyph"><Icon name="trash-2" /></span><span className="grow t">מחיקת נתוני הדוגמה</span></button>}
        </section>

        <section className="stack">
          <div className="eyebrow">על האפליקציה</div>
          <button className="li" onClick={() => open({ k: 'mastermind' })}><span className="glyph gold"><Icon name="brain-circuit" /></span><span className="grow" style={{ display: 'grid' }}><span className="t">המאסטרמיינד והמחקר</span><span className="s">20 מומחים ו-12 מחקרים שמאחורי כל החלטה</span></span><Icon name="chevron-left" className="muted" /></button>
        </section>

        <section className="stack">
          <div className="eyebrow" style={{ color: 'var(--danger)' }}>אזור מסוכן</div>
          <form className="card flat tight stack" onSubmit={e => { e.preventDefault(); if (confirmWipe.trim() === 'מחק') { setVault(cur => ({ core: { ...cur.core, buckets: cur.core.buckets.filter(b => !b.id.startsWith('b_') || b.id === 'b_emergency' || b.id === 'b_invest').map(b => ({ ...b, start: 0 })), holdings: [], recurring: [], budgets: {}, checkins: [], reviews: [], nwHistory: [], coachLog: [] }, months: Object.fromEntries(Object.keys(cur.months).map(k => [k, []])) })); setConfirmWipe(''); toast('כל התנועות נמחקו'); } }}>
            <span style={{ fontSize: '.88rem' }}>מחיקת כל התנועות, הקופות והנכסים. הקלד <b>מחק</b> לאישור.</span>
            <div className="row"><input id="st-wipe" className="input grow" value={confirmWipe} onChange={e => setConfirmWipe(e.target.value)} /><button className="btn danger" disabled={confirmWipe.trim() !== 'מחק'}>מחיקה</button></div>
          </form>
        </section>
        <p className="muted" style={{ fontSize: '.76rem', textAlign: 'center', margin: 0 }}>הון שקט · כלי אישי לניהול כסף. המידע על השקעות הוא מחקר אוטומטי ולא ייעוץ השקעות.</p>
      </div>
    </Sheet>
  );
}

export function SecuritySheet() {
  const { io, close, toast } = useApp();
  const [cur, setCur] = useState('');
  const [n1, setN1] = useState('');
  const [n2, setN2] = useState('');
  const [newRec, setNewRec] = useState(false);
  const [rec, setRec] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (n1.length < 6) return setErr('הקוד החדש צריך לפחות 6 תווים');
    if (n1 !== n2) return setErr('הקודים החדשים לא תואמים');
    setBusy(true);
    try {
      const docs = await io.backend.getAll();
      const meta = docs.meta as Meta;
      const { raw } = await openWithPasscode(meta, cur);
      const code = newRec ? newRecoveryCode() : undefined;
      const next = await rewrap(meta, raw, n1, code);
      raw.fill(0);
      await io.saveMeta(next);
      if (code) setRec(code); else { toast('הקוד הוחלף'); close(); }
    } catch { setErr('הקוד הנוכחי שגוי'); } finally { setBusy(false); }
  }
  return (
    <Sheet title="קוד וקוד שחזור" onClose={close} labelledBy="sc-h">
      {rec ? (
        <div className="stack">
          <b>קוד השחזור החדש</b>
          <div className="code">{rec}</div>
          <p className="ink2" style={{ margin: 0, fontSize: '.88rem' }}>הקוד הישן כבר לא עובד. שמור את החדש מחוץ לטלפון.</p>
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(rec).then(() => toast('הועתק'), () => {})}><Icon name="copy" size={16} /> העתקה</button>
          <button className="btn primary" onClick={close}>שמרתי</button>
        </div>
      ) : (
        <form className="stack" onSubmit={go}>
          <label className="field"><span>הקוד הנוכחי</span><input id="sc-cur" className="input" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></label>
          <label className="field"><span>קוד חדש (6 תווים לפחות)</span><input id="sc-n1" className="input" type="password" autoComplete="new-password" value={n1} onChange={e => setN1(e.target.value)} /></label>
          <label className="field"><span>שוב את הקוד החדש</span><input id="sc-n2" className="input" type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} /></label>
          <div className="row between"><span style={{ fontSize: '.9rem' }}>ליצור גם קוד שחזור חדש</span><Switch on={newRec} onChange={setNewRec} label="קוד שחזור חדש" /></div>
          {err && <div className="down" role="alert">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'מצפין…' : 'החלפה'}</button>
        </form>
      )}
    </Sheet>
  );
}
