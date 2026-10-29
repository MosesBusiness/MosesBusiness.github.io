// Import bank and credit-card statements (CSV or Excel) from Israeli banks and card issuers.
// Finds the header row, the date / description / amount columns, and parses Hebrew formats.

import { iso, pad } from './format';
import { BASE, WEB } from './env';

export type Row = (string | number | Date | null)[];
export interface Mapping { header: number; date: number; desc: number; amount: number; credit: number; }
export interface Parsed { d: string; n: string; a: number; t: 'expense' | 'income' }

let xlsxPromise: Promise<any> | null = null;
function loadXLSX(): Promise<any> {
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = WEB ? BASE + 'xlsx.full.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => res((window as any).XLSX);
      s.onerror = () => { xlsxPromise = null; rej(new Error('xlsx')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

function parseCSV(text: string): Row[] {
  const rows: Row[] = [];
  const delim = (text.split('\n')[0].match(/\t/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? '\t' : ',';
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function readFile(file: File): Promise<Row[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (/\uFFFD/.test(text)) text = new TextDecoder('windows-1255').decode(buf);
    return parseCSV(text.replace(/^﻿/, ''));
  }
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // Statements sometimes span several sheets (one per card); take them all.
  const rows: Row[] = [];
  for (const sn of wb.SheetNames) rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null }));
  return rows;
}

const has = (v: unknown, words: string[]) => typeof v === 'string' && words.some(w => v.replace(/\s+/g, ' ').includes(w));
const DATE_W = ['תאריך עסקה', 'תאריך רכישה', 'תאריך', 'date'];
const DESC_W = ['שם בית העסק', 'בית עסק', 'שם בית עסק', 'תיאור', 'פרטים', 'אסמכתא ותיאור', 'הפעולה', 'description', 'merchant'];
const AMT_W = ['סכום חיוב', 'סכום החיוב', 'חיוב בש"ח', 'סכום בש"ח', 'סכום', 'חובה', 'amount', 'debit'];
const CREDIT_W = ['זכות', 'credit'];

export function detect(rows: Row[]): Mapping | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r] || [];
    const find = (words: string[]) => {
      for (const w of words) { const i = row.findIndex(c => has(c, [w])); if (i >= 0) return i; }
      return -1;
    };
    const date = find(DATE_W), amount = find(AMT_W);
    if (date < 0 || amount < 0) continue;
    let desc = find(DESC_W);
    if (desc < 0 || desc === date || desc === amount) desc = row.findIndex((c, i) => i !== date && i !== amount && typeof c === 'string' && c.trim());
    const credit = row.findIndex((c, i) => i !== amount && has(c, CREDIT_W));
    return { header: r, date, desc, amount, credit };
  }
  return null;
}

export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86_400_000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/[₪$€\s]|ש"ח|ILS/g, '').replace(/,/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : null;
}

export function extract(rows: Row[], m: Mapping): Parsed[] {
  const out: Parsed[] = [];
  for (let r = m.header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const d = parseDate(row[m.date]);
    if (!d) continue;
    const debit = parseAmount(row[m.amount]);
    const credit = m.credit >= 0 ? parseAmount(row[m.credit]) : null;
    const n = String(row[m.desc] ?? '').trim().slice(0, 80);
    if (credit && credit > 0 && (!debit || debit === 0)) { out.push({ d, n, a: credit, t: 'income' }); continue; }
    if (debit === null || debit === 0) continue;
    // Card statements: positive = charge, negative = refund. Bank "debit" columns are positive charges.
    out.push({ d, n, a: Math.abs(debit), t: debit > 0 ? 'expense' : 'income' });
  }
  return out;
}
