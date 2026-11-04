// Deterministisk tolkning av Mockfjärds självfakturor ur PDF:ens textlager.
// Ren modul (inga Deno-/npm-importer) så att den kan testas med vitest och
// återanvändas i webbläsaren via src/lib/mockfjardsInvoice.ts.

export interface PdfTextItem { str: string; x: number; y: number; w?: number; page: number }
export interface MockfjardsHeader {
  invoice_number: string | null;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null;     // YYYY-MM-DD
  total_amount: number | null;
}
export interface MockfjardsLine {
  order_number: string | null;
  customer_name: string | null;
  job_address: null;
  name: string | null;
  note: null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
}

const AMOUNT = /-?\d{1,3}(?:[ \u00a0\u202f]\d{3})*,\d{2}/g;

/** "6 384,76" -> 6384.76. Returnerar null för ogiltiga värden. */
export function parseSwedishAmount(value: string): number | null {
  const cleaned = value.replace(/[\s\u00a0\u202f]/g, '').replace(/SEK$/i, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "20260907" -> "2026-09-07" (validerat kalenderdatum). */
export function parseCompactDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Grupperar textobjekt till rader (per sida och y-position) i läsordning. */
export function itemsToLines(items: PdfTextItem[]): { page: number; y: number; items: PdfTextItem[]; text: string }[] {
  const rows: { page: number; y: number; items: PdfTextItem[]; text: string }[] = [];
  const sorted = items.filter(i => i.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const row = rows.find(r => r.page === item.page && Math.abs(r.y - item.y) <= 2.5);
    if (row) row.items.push(item); else rows.push({ page: item.page, y: item.y, items: [item], text: '' });
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items.map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  }
  return rows.sort((a, b) => a.page - b.page || b.y - a.y);
}

export const itemsToText = (items: PdfTextItem[]) => itemsToLines(items).map(r => r.text).join('\n');

/** Läser fakturahuvudet. Gissar aldrig: saknas ett fält blir det null. */
export function parseMockfjardsHeader(text: string): MockfjardsHeader {
  const invoice = /Fakturanummer[\s.]*:\s*([A-ZÅÄÖ]{2,}\d{2,})/i.exec(text)?.[1]?.toUpperCase() ?? null;
  // "Datum" med stort D och inte del av "Förfallodatum".
  const dateRaw = /(?:^|[^A-Za-zÅÄÖåäö])Datum[\s.]*:\s*(\d{8})/.exec(text)?.[1] ?? null;
  const dueRaw = /F[öo]rfallodatum[\s.]*:\s*(\d{8})/i.exec(text)?.[1] ?? null;
  let total: number | null = null;
  const header = /F[öo]rs[äa]ljningssaldo[^\n]*?Total\b[^\n]*/i.exec(text);
  if (header) {
    const after = text.slice(header.index + header[0].length);
    const segment = /^[\s\S]*?SEK/i.exec(after)?.[0] ?? after.split('\n').slice(0, 3).join('\n');
    const amounts = segment.match(AMOUNT) ?? [];
    // Total-raden har sex värden; Total är det sista.
    const pick = amounts.length >= 6 ? amounts[5] : amounts[amounts.length - 1];
    total = pick ? parseSwedishAmount(pick) : null;
  }
  if (total === null) {
    const m = /\bTotal[\s.]*:?\s*(-?\d{1,3}(?:[ \u00a0\u202f]\d{3})*,\d{2})\s*SEK/i.exec(text);
    total = m ? parseSwedishAmount(m[1]) : null;
  }
  return {
    invoice_number: invoice,
    invoice_date: dateRaw ? parseCompactDate(dateRaw) : null,
    due_date: dueRaw ? parseCompactDate(dueRaw) : null,
    total_amount: total,
  };
}

const NUM_TOKEN = /^-?\d+(?:,\d+)?$/;
function amountFromTokens(tokens: string[]): number | null {
  if (!tokens.length) return null;
  const joined = tokens.join(' ');
  if (!/^-?\d{1,3}(?: \d{3})*,\d{2}$/.test(joined)) return null;
  return parseSwedishAmount(joined);
}

/** Delar radens avslutande siffror i Kvt, á pris och Belopp där Kvt × pris = Belopp. */
export function splitNumericTail(tokens: string[]): { rest: string[]; qty: number; unit: number; amount: number } | null {
  let tail = 0;
  while (tail < tokens.length && NUM_TOKEN.test(tokens[tokens.length - 1 - tail])) tail++;
  if (tail < 3) return null;
  const nums = tokens.slice(tokens.length - tail);
  let best: { rest: string[]; qty: number; unit: number; amount: number } | null = null;
  for (let a = 1; a <= Math.min(3, nums.length - 2); a++) {
    for (let p = 1; p <= Math.min(3, nums.length - a - 1); p++) {
      const qtyToken = nums[nums.length - a - p - 1];
      const amount = amountFromTokens(nums.slice(nums.length - a));
      const unit = amountFromTokens(nums.slice(nums.length - a - p, nums.length - a));
      const qty = parseSwedishAmount(qtyToken);
      if (amount === null || unit === null || qty === null) continue;
      if (Math.abs(qty * unit - amount) > 0.05) continue;
      const restCount = tokens.length - (a + p + 1);
      const candidate = { rest: tokens.slice(0, restCount), qty, unit, amount };
      if (!best || candidate.rest.length > best.rest.length) best = candidate;
    }
  }
  return best;
}

/** Läser radposterna (Fsg. order | Namn | Notering | Kvt | á pris | Belopp) ur textlagret. */
export function parseMockfjardsLines(items: PdfTextItem[]): MockfjardsLine[] {
  const rows = itemsToLines(items);
  const out: MockfjardsLine[] = [];
  let inTable = false, noteX: number | null = null, nameX: number | null = null;
  let lastOrder: string | null = null, lastName: string | null = null;
  for (const row of rows) {
    if (/Fsg\.?\s*order/i.test(row.text) && /Belopp/i.test(row.text)) {
      inTable = true;
      noteX = row.items.find(i => /Notering/i.test(i.str))?.x ?? null;
      nameX = row.items.find(i => /^\s*Namn/i.test(i.str))?.x ?? null;
      continue;
    }
    if (!inTable) continue;
    if (/F[öo]rs[äa]ljningssaldo|Totalrabatt/i.test(row.text)) { inTable = false; continue; }
    const tokens = row.text.split(' ');
    const split = splitNumericTail(tokens);
    if (!split) {
      // Radbrytning i Notering: lägg till föregående rad.
      if (out.length && row.text && !/\d{1,3},\d{2}/.test(row.text)) {
        const prev = out[out.length - 1];
        prev.name = `${prev.name ?? ''} ${row.text}`.trim();
      }
      continue;
    }
    let rest = split.rest;
    let order: string | null = null;
    if (rest.length && /^\d{6,10}$/.test(rest[0])) { order = rest[0]; rest = rest.slice(1); }
    let customer: string | null = null, note = rest.join(' ').trim();
    if (noteX !== null) {
      const textItems = row.items.filter(i => !/^\d{6,10}$/.test(i.str.trim()) && (nameX === null || i.x >= nameX - 2));
      const before = textItems.filter(i => i.x < noteX! - 2).map(i => i.str.trim()).join(' ').trim();
      const after = textItems.filter(i => i.x >= noteX! - 2).map(i => i.str.trim()).join(' ').trim();
      const afterTokens = after.split(/\s+/);
      const cleanedAfter = splitNumericTail(afterTokens)?.rest.join(' ').trim() ?? after;
      if (before) customer = before;
      if (cleanedAfter) note = cleanedAfter;
    }
    if (order) { lastOrder = order; lastName = customer; }
    out.push({
      order_number: order ?? lastOrder,
      customer_name: customer ?? (order ? null : lastName),
      job_address: null,
      name: note || null,
      note: null,
      qty: split.qty,
      unit_price: split.unit,
      amount: split.amount,
    });
  }
  return out;
}

/** "Fakturanr_MIKH0218_Ordernr_..." -> "MIKH0218". */
export function invoiceNumberFromFileName(name: string | null | undefined): string | null {
  const m = /Fakturanr[_\s-]*([A-Za-zÅÄÖåäö]{2,}\d{2,})/i.exec(name ?? '');
  return m ? m[1].toUpperCase() : null;
}

const dayMs = 86_400_000;
const toUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / dayMs);

export interface MockfjardsCheckInput {
  fileName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  total?: number | null;
  lineSum?: number | null;
  hasLines?: boolean;
  today: string; // YYYY-MM-DD
}

/** Kontroller innan en Mockfjärds-faktura sparas. Tom lista = allt stämmer. */
export function validateMockfjards(input: MockfjardsCheckInput): string[] {
  const warnings: string[] = [];
  const fromFile = invoiceNumberFromFileName(input.fileName);
  const invoice = input.invoiceNumber?.trim().toUpperCase() || null;
  if (fromFile && invoice && fromFile !== invoice) warnings.push(`Fakturanumret i filnamnet (${fromFile}) skiljer sig från tolkat fakturanummer (${invoice}).`);
  if (!invoice) warnings.push('Fakturanummer saknas.');
  const date = input.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) ? input.invoiceDate : null;
  const due = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;
  if (!date) warnings.push('Fakturadatum saknas.');
  else if (Math.abs(daysBetween(date, input.today)) > 150) warnings.push(`Fakturadatumet ${date} ligger mer än 150 dagar från idag.`);
  if (!due) warnings.push('Förfallodatum saknas.');
  else if (date) {
    const diff = daysBetween(date, due);
    if (diff < 5 || diff > 35) warnings.push(`Förfallodatum ${due} ligger ${diff} dagar efter fakturadatum (förväntat 5–35).`);
  }
  if (input.total == null || !Number.isFinite(input.total)) warnings.push('Total saknas.');
  else if (input.hasLines !== false && input.lineSum != null && Math.abs(input.lineSum - input.total) > 1) {
    warnings.push(`Radernas summa (${input.lineSum.toFixed(2)}) stämmer inte med Total (${input.total.toFixed(2)}).`);
  }
  return warnings;
}

export const sumLines = (lines: { amount: number | null | undefined }[]) =>
  Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;

export interface MockfjardsReading {
  /** PDF:en har ett läsbart textlager. */
  text_layer: boolean;
  /** Textlagret ser ut som en Mockfjärds-självfaktura (fakturanummer + Datum + radtabell/Total). */
  is_mockfjards: boolean;
  header: MockfjardsHeader;
  lines: MockfjardsLine[];
  line_sum: number;
  warnings: string[];
}
/** Hela den deterministiska tolkningen: huvud, rader och validering. Ingen AI. */
export function interpretMockfjards(items: PdfTextItem[], fileName: string | null | undefined, today: string): MockfjardsReading {
  const text = itemsToText(items);
  const text_layer = text.replace(/\s/g, '').length >= 40;
  const header = parseMockfjardsHeader(text);
  const is_mockfjards = text_layer && !!header.invoice_number && /Fakturanummer/i.test(text) && (/Fsg\.?\s*order/i.test(text) || /Mockfj/i.test(text));
  const lines = is_mockfjards ? parseMockfjardsLines(items) : [];
  const line_sum = sumLines(lines);
  const warnings = is_mockfjards ? validateMockfjards({
    fileName, invoiceNumber: header.invoice_number, invoiceDate: header.invoice_date, dueDate: header.due_date,
    total: header.total_amount, lineSum: line_sum, hasLines: true, today,
  }) : [];
  if (is_mockfjards && !lines.length) warnings.push('Inga radposter kunde läsas ur PDF:en.');
  return { text_layer, is_mockfjards, header, lines, line_sum, warnings };
}
