import React, { useEffect, useMemo, useState } from 'react';
import { AddPreset, useApp } from '../state';
import { Icon, Seg, Sheet, Switch, haptic } from '../ui/kit';
import { CUSTOM_ICONS, Category, EXPENSE_CATS, INCOME_CATS, NeedWant, Tx, TxType, catById, uid } from '../lib/model';
import { addDays, asTime, ils, todayISO, ymOf, relDay, addMonths } from '../lib/format';
import { allTx, bucketBalances, futureValue } from '../lib/calc';
import { guessCategory } from '../lib/merchants';

type Kind = 'expense' | 'income' | 'save';

export function AddSheet({ preset }: { preset?: AddPreset }) {
  const { v, close, addTx, saveTx, deleteTx, setCore, toast, lens, open } = useApp();
  const edit = preset?.edit || null;
  const [kind, setKind] = useState<Kind>(edit ? (edit.t === 'withdraw' ? 'save' : edit.t) as Kind : (preset?.t === 'withdraw' ? 'save' : (preset?.t as Kind)) || 'expense');
  const [withdraw, setWithdraw] = useState(edit?.t === 'withdraw' || preset?.t === 'withdraw');
  const [amt, setAmt] = useState(edit ? String(edit.a) : preset?.a ? String(Math.round(preset.a)) : '');
  const [cat, setCat] = useState<string | null>(edit?.c || preset?.c || null);
  const [manualCat, setManualCat] = useState(!!(edit || preset?.c));
  const [note, setNote] = useState(edit?.n || preset?.n || '');
  const [date, setDate] = useState(edit?.d || todayISO());
  const [nw, setNw] = useState<NeedWant | null>(edit?.nw || null);
  const [repeat, setRepeat] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [newCat, setNewCat] = useState<{ name: string; icon: string } | null>(null);
  const [pyf, setPyf] = useState<number | null>(null);
  const [windfall, setWindfall] = useState(false);

  const type: TxType = kind === 'save' ? (withdraw ? 'withdraw' : 'save') : kind;
  const amount = parseFloat(amt) || 0;
  const bal = useMemo(() => bucketBalances(v), [v]);

  // Frequency-ordered categories: the ones you use most come first.
  const cats = useMemo(() => {
    const base: Category[] = kind === 'income' ? [...INCOME_CATS, ...v.core.customCats.filter(c => c.t === 'income')] : [...EXPENSE_CATS, ...v.core.customCats.filter(c => c.t === 'expense')];
    const since = addDays(todayISO(), -90);
    const count = new Map<string, number>();
    for (const t of allTx(v)) if (t.t === kind && t.d >= since) count.set(t.c, (count.get(t.c) || 0) + 1);
    return [...base].sort((a, b) => (count.get(b.id) || 0) - (count.get(a.id) || 0));
  }, [v, kind]);

  useEffect(() => {
    if (kind === 'save' && (!cat || !v.core.buckets.some(b => b.id === cat))) setCat(v.core.buckets[0]?.id || null);
    if (kind !== 'save' && cat && !catById(v.core, cat)?.t?.startsWith(kind === 'income' ? 'income' : 'expense')) { setCat(null); setManualCat(false); }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guess the category from the note until the user picks one.
  useEffect(() => {
    if (manualCat || kind === 'save') return;
    const g = guessCategory(note, kind, v.core.merchantMap);
    if (g) setCat(g);
  }, [note, kind, manualCat, v.core.merchantMap]);

  function key(k: string) {
    haptic(6);
    setAmt(a => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.';
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (a.replace('.', '').length >= 9) return a;
      if (a === '0') return k;
      return a + k;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (/^[0-9]$/.test(e.key)) key(e.key);
      else if (e.key === '.' || e.key === ',') key('.');
      else if (e.key === 'Backspace') key('del');
      else if (e.key === 'Enter') save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const effNw: NeedWant = nw || (cat ? catById(v.core, cat)?.nw : undefined) || 'want';
  const hours = lens.hourly > 0 && amount > 0 ? asTime(amount, { ...lens, mode: 'time' }) : '';
  const fv = futureValue(amount, 20, v.core.profile.returnRate);

  function save() {
    if (amount <= 0) { toast('הקלד סכום'); return; }
    const c = cat || (kind === 'income' ? 'other_inc' : kind === 'save' ? v.core.buckets[0]?.id : 'other');
    if (!c) return;
    const base: Omit<Tx, 'id' | 'ts'> = { t: type, a: Math.round(amount * 100) / 100, c, d: date, n: note.trim() || undefined, ...(type === 'expense' ? { nw: effNw } : {}) };
    if (edit) {
      saveTx({ ...edit, ...base, n: base.n, nw: base.nw }, edit);
      toast('התנועה עודכנה');
      close();
      return;
    }
    const tx = addTx(base);
    if (repeat) {
      setCore(core => ({ ...core, recurring: [...core.recurring, { id: uid(), t: type, a: base.a, c, n: base.n, nw: base.nw, day: Number(date.slice(8)), start: date, last: ymOf(date), active: true }] }));
    }
    haptic(14);
    if (type === 'income' && amount >= 500) {
      // Windfalls (bonus, gift, freelance, returns) get a bigger suggestion: they feel like "extra" and vanish fastest.
      const windfall = ['bonus', 'gift_inc', 'freelance', 'invest_inc'].includes(c);
      const month = allTx(v).filter(t => ymOf(t.d) === ymOf(date));
      const saved = month.filter(t => t.t === 'save').reduce((a, t) => a + t.a, 0);
      const income = month.filter(t => t.t === 'income').reduce((a, t) => a + t.a, 0) + amount;
      const suggest = Math.round((amount * (windfall ? 0.5 : v.core.profile.saveRate)) / 10) * 10;
      if (suggest > 0 && (windfall || saved < income * v.core.profile.saveRate)) { setPyf(suggest); setWindfall(windfall); return; }
    }
    const b = v.core.buckets.find(x => x.id === c);
    toast(type === 'expense'
      ? `נרשם${hours ? ` · ${hours} מהחיים שלך` : ''}`
      : type === 'save' ? `הופקד ל${b?.name || 'קופה'}${b?.target ? ` · ${Math.round(((bal[b.id] || 0) + amount) / b.target * 100)}% מהיעד` : ''}`
      : 'נרשם', () => deleteTx(tx));
    close();
  }

  function addCustom() {
    if (!newCat?.name.trim()) return;
    const c: Category = { id: 'c_' + uid().slice(0, 8), name: newCat.name.trim().slice(0, 24), icon: newCat.icon, t: kind === 'income' ? 'income' : 'expense', nw: 'want', custom: true };
    setCore(core => ({ ...core, customCats: [...core.customCats, c] }));
    setCat(c.id); setManualCat(true); setNewCat(null);
  }

  if (pyf !== null) {
    const pick = (bid: string) => {
      addTx({ t: 'save', a: pyf, c: bid, d: date, n: 'תשלום לעצמי קודם' });
      toast(`${ils(pyf)} עברו לעתיד שלך. זה ההרגל שבונה עושר`);
      close();
    };
    return (
      <Sheet title="קודם כל, לשלם לעצמך" onClose={close} labelledBy="pyf-h">
        <div className="stack">
          <p style={{ margin: 0, fontSize: '1.02rem' }}>נכנסו <b className="money">{ils(amount)}</b>. {windfall ? 'כסף שמגיע כבונוס מרגיש כמו "תוספת", ולכן מתפזר הכי מהר. הכלל של המשקיעים הטובים: לפחות חצי ממנו לעתיד.' : 'מי שמפריש מיד, לפני שהכסף מתפזר, חוסך הרבה יותר ממי שמחכה לסוף החודש.'}</p>
          <div className="card flat" style={{ textAlign: 'center' }}>
            <div className="eyebrow">{windfall ? 50 : Math.round(v.core.profile.saveRate * 100)}% מההכנסה</div>
            <div className="figure-m money" style={{ marginTop: 6 }}>{ils(pyf)}</div>
            <div className="muted" style={{ fontSize: '.84rem', marginTop: 4 }}>בעוד 20 שנה, בתשואה של {Math.round(v.core.profile.returnRate * 100)}%: <b className="gold money">{ils(futureValue(pyf, 20, v.core.profile.returnRate))}</b></div>
          </div>
          {v.core.buckets.map(b => (
            <button key={b.id} className="btn ghost block" style={{ justifyContent: 'space-between' }} onClick={() => pick(b.id)}>
              <span className="row"><Icon name={b.icon} /> {b.name}</span><Icon name="chevron-left" />
            </button>
          ))}
          <button className="btn quiet block" onClick={close}>אחר כך</button>
        </div>
      </Sheet>
    );
  }

  const visible = showAll || kind === 'save' ? cats : cats.slice(0, 8);
  const tones: Record<Kind, string> = { expense: 'var(--spend)', income: 'var(--c-income)', save: 'var(--accent)' };

  return (
    <Sheet title={edit ? 'עריכת תנועה' : 'תנועה חדשה'} onClose={close} labelledBy="add-h"
      footer={
        <div className="stack" style={{ gap: 10 }}>
          <div className="pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k => (
              <button key={k} onClick={() => key(k)} aria-label={k === 'del' ? 'מחיקת ספרה' : k === '.' ? 'נקודה עשרונית' : k} style={{ height: 50 }}>
                {k === 'del' ? <Icon name="delete" size={22} /> : k}
              </button>
            ))}
          </div>
          <div className="row">
            {edit && <button className="btn danger" onClick={() => { deleteTx(edit); close(); }} aria-label="מחיקה"><Icon name="trash-2" /></button>}
            <button className="btn primary grow" onClick={save} disabled={amount <= 0} style={{ background: tones[kind], color: kind === 'save' ? 'var(--accent-ink)' : '#fff' }}>
              {edit ? 'שמירת שינויים' : kind === 'expense' ? 'רישום הוצאה' : kind === 'income' ? 'רישום הכנסה' : withdraw ? 'רישום משיכה' : 'הפקדה לעתיד'}
            </button>
          </div>
        </div>
      }>
      <div className="stack">
        <Seg<Kind> value={kind} className={`t-${kind}`} onChange={k => { setKind(k); setManualCat(false); }}
          options={[{ v: 'expense', label: 'הוצאה' }, { v: 'income', label: 'הכנסה' }, { v: 'save', label: 'לעתיד' }]} />

        <div className="amount" aria-live="polite">
          <div className="val num" style={{ color: amount ? tones[kind] : 'var(--muted)' }}><span className="cur">₪</span>{amt || '0'}</div>
          <div className="hint">
            {kind === 'expense' && amount > 0 && <>{hours && <>{hours} מהחיים שלך · </>}בעוד 20 שנה בהשקעה: <b className="gold">{ils(fv)}</b></>}
            {kind === 'save' && amount > 0 && !withdraw && <>בעוד 20 שנה: <b className="gold">{ils(fv)}</b></>}
          </div>
        </div>

        {kind !== 'save' && (
          <input id="tx-note" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'expense' ? 'איפה? למשל: שופרסל, ארומה, פז' : 'ממי? למשל: משכורת, לקוח'} autoComplete="off" maxLength={80} />
        )}

        {kind === 'save' ? (
          <div className="stack" style={{ gap: 10 }}>
            <Seg<'in' | 'out'> value={withdraw ? 'out' : 'in'} onChange={x => setWithdraw(x === 'out')} options={[{ v: 'in', label: 'הפקדה' }, { v: 'out', label: 'משיכה' }]} />
            <div className="list">
              {v.core.buckets.map(b => (
                <button key={b.id} className="li" aria-pressed={cat === b.id} onClick={() => setCat(b.id)}
                  style={{ borderRadius: 14, paddingInline: 8, background: cat === b.id ? 'var(--accent-soft)' : undefined }}>
                  <span className="glyph save"><Icon name={b.icon} /></span>
                  <span className="grow" style={{ display: 'grid' }}><span className="t">{b.name}</span><span className="s money">יתרה {ils(bal[b.id] || 0)}{b.target ? ` · יעד ${ils(b.target)}` : ''}</span></span>
                  {cat === b.id && <Icon name="circle-check" className="up" />}
                </button>
              ))}
            </div>
            <button className="link" onClick={() => { close(); open({ k: 'bucket' }); }}><Icon name="plus" size={16} /> קופה חדשה</button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="cats" role="group" aria-label="קטגוריה">
              {visible.map(c => (
                <button key={c.id} className="cat" aria-pressed={cat === c.id} onClick={() => { setCat(c.id); setManualCat(true); haptic(); }}>
                  <span className={`glyph ${kind}`}><Icon name={c.icon} /></span>{c.name}
                </button>
              ))}
              {showAll && !newCat && (
                <button className="cat" onClick={() => setNewCat({ name: '', icon: CUSTOM_ICONS[0] })}>
                  <span className="glyph"><Icon name="plus" /></span>חדשה
                </button>
              )}
            </div>
            {newCat && (
              <div className="card flat stack" style={{ gap: 10 }}>
                <input id="newcat-name" className="input" placeholder="שם הקטגוריה" value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} autoFocus />
                <div className="chips">{CUSTOM_ICONS.map(ic => (
                  <button key={ic} className="chip" aria-pressed={newCat.icon === ic} onClick={() => setNewCat({ ...newCat, icon: ic })} aria-label={ic}><Icon name={ic} size={16} /></button>
                ))}</div>
                <div className="row"><button className="btn primary sm" onClick={addCustom}>הוספה</button><button className="btn quiet sm" onClick={() => setNewCat(null)}>ביטול</button></div>
              </div>
            )}
            {cats.length > 8 && <button className="link" onClick={() => setShowAll(s => !s)}>{showAll ? 'פחות' : `כל הקטגוריות (${cats.length})`} <Icon name="chevron-down" size={16} /></button>}
          </div>
        )}

        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {[todayISO(), addDays(todayISO(), -1)].map(d => (
            <button key={d} className="chip" aria-pressed={date === d} onClick={() => setDate(d)}>{relDay(d)}</button>
          ))}
          <label className="chip" aria-pressed={date !== todayISO() && date !== addDays(todayISO(), -1)} style={{ position: 'relative' }}>
            <Icon name="calendar" size={16} />{date !== todayISO() && date !== addDays(todayISO(), -1) ? relDay(date) : 'תאריך'}
            <input type="date" id="tx-date" value={date} max={addMonths(ymOf(todayISO()), 12) + '-28'} onChange={e => e.target.value && setDate(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%' }} aria-label="תאריך" />
          </label>
          {kind === 'expense' && (
            <button className="chip" onClick={() => setNw(effNw === 'need' ? 'want' : 'need')} aria-label="צורך או רצון">
              <Icon name="scale" size={16} />{effNw === 'need' ? 'צורך' : 'רצון'}
            </button>
          )}
          {!edit && (
            <span className="chip" style={{ gap: 8 }}>
              <Icon name="repeat" size={16} />חוזר כל חודש
              <Switch on={repeat} onChange={setRepeat} label="חוזר כל חודש" />
            </span>
          )}
        </div>
      </div>
    </Sheet>
  );
}
