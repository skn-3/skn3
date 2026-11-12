import type { ColorSystem, PriceItem, PriceKind, PriceLevel, PriceTrade, RotClass } from './types';

export const PRICE_TRADES: PriceTrade[] = ['golv', 'malning', 'tak', 'fasad', 'badrum', 'kok', 'altan', 'renovering', 'gemensamt'];
export const PRICE_KINDS: PriceKind[] = ['arbete', 'material', 'tillbehor', 'ovrigt'];
export const ROT_CLASSES: RotClass[] = ['arbete', 'material', 'ovrigt'];
export const PRICE_UNITS = ['m²', 'm', 'st', 'tim', 'l', 'kg', 'fast'] as const;
export const PRICE_LEVELS: PriceLevel[] = ['bas', 'standard', 'premium'];

/** Rubrik i prisarket → kolumn i price_items. */
export const IMPORT_COLUMNS = {
  kod: 'code', gren: 'trade', typ: 'kind', rot: 'rot_class', valgrupp: 'slot', namn: 'name', spec: 'spec', enhet: 'unit',
  pris_ex_moms: 'price_ex_vat', kostnad_ex_moms: 'cost_ex_vat', timmar_per_enhet: 'hours_per_unit', niva: 'level',
  forpackning: 'pack_size', forpackning_namn: 'pack_label', spill_procent: 'waste_pct', atgang: 'coverage',
  kulorsystem: 'color_system', kulorkod: 'color_code', kulor_hex: 'color_hex', artikelnummer: 'article_no',
  leverantor: 'supplier', kalla: 'source', prisdatum: 'price_date',
} as const satisfies Record<string, keyof PriceItem>;

type ImportHeader = keyof typeof IMPORT_COLUMNS;
export type ImportField = (typeof IMPORT_COLUMNS)[ImportHeader];
export type ImportValues = Partial<Pick<PriceItem, ImportField>>;

const NUMERIC: ImportField[] = ['price_ex_vat', 'cost_ex_vat', 'hours_per_unit', 'pack_size', 'waste_pct', 'coverage'];

export interface ParsedImportRow {
  /** Radnummer i den inklistrade texten (1 = rubrikraden). */
  line: number;
  code: string;
  values: ImportValues;
  errors: string[];
}

export interface PriceImportResult {
  rows: ParsedImportRow[];
  /** Fel som gäller hela importen, t.ex. saknad rubrik. */
  errors: string[];
  columns: ImportField[];
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const normHeader = (h: string) => h.trim().toLowerCase()
  .replace(/^\uFEFF/, '').replace(/å|ä/g, 'a').replace(/ö/g, 'o').replace(/[\s-]+/g, '_');

/** Decimalkomma och tusentalsavgränsare tolkas. Tomt = null. */
export function parseSvNumber(raw: string): number | null | 'invalid' {
  const s = raw.replace(/\s|\u00A0|kr/gi, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 'invalid';
  return Number(normalized);
}

const normUnit = (u: string) => {
  const s = u.trim().toLowerCase();
  if (s === 'm2' || s === 'kvm' || s === 'm^2') return 'm²';
  if (s === 'lm' || s === 'löpmeter') return 'm';
  if (s === 'liter') return 'l';
  if (s === 'timme' || s === 'timmar' || s === 'h') return 'tim';
  return s;
};

function parseDate(raw: string): string | null | 'invalid' {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return 'invalid';
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? 'invalid' : s;
}

/** Tolkar inklistrad TSV eller CSV (tabb eller semikolon, decimalkomma). Godkänner aldrig något. */
export function parsePriceImport(text: string): PriceImportResult {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const headerIdx = lines.findIndex(l => l.trim() !== '');
  if (headerIdx < 0) return { rows: [], errors: ['Ingen text att importera.'], columns: [] };
  const headerLine = lines[headerIdx];
  const sep = headerLine.includes('\t') ? '\t' : ';';
  const headers = splitLine(headerLine, sep).map(normHeader);
  const fields: (ImportField | null)[] = headers.map(h => (h in IMPORT_COLUMNS ? IMPORT_COLUMNS[h as ImportHeader] : null));
  const errors: string[] = [];
  for (const req of ['kod', 'namn', 'gren', 'typ', 'rot', 'enhet'] as ImportHeader[]) {
    if (!headers.includes(req)) errors.push(`Kolumnen "${req}" saknas.`);
  }
  const columns = fields.filter((f): f is ImportField => f != null);
  if (errors.length) return { rows: [], errors, columns };

  const rows: ParsedImportRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const cells = splitLine(lines[i], sep);
    const values: ImportValues = {};
    const rowErrors: string[] = [];
    fields.forEach((field, idx) => {
      if (!field) return;
      const raw = (cells[idx] ?? '').trim();
      const v = values as Record<string, unknown>;
      if (NUMERIC.includes(field)) {
        const num = parseSvNumber(raw);
        if (num === 'invalid') rowErrors.push(`Ogiltigt tal i ${headers[idx]}: "${raw}"`);
        else if (num != null && num < 0) rowErrors.push(`Negativt tal i ${headers[idx]}`);
        else v[field] = field === 'waste_pct' ? (num ?? 0) : num;
        return;
      }
      switch (field) {
        case 'code': v.code = raw.toLowerCase(); break;
        case 'trade':
          if (!PRICE_TRADES.includes(raw.toLowerCase() as PriceTrade)) rowErrors.push(`Okänd gren: "${raw}"`);
          else v.trade = raw.toLowerCase(); break;
        case 'kind':
          if (!PRICE_KINDS.includes(raw.toLowerCase() as PriceKind)) rowErrors.push(`Okänd typ: "${raw}"`);
          else v.kind = raw.toLowerCase(); break;
        case 'rot_class':
          if (!ROT_CLASSES.includes(raw.toLowerCase() as RotClass)) rowErrors.push(`Okänd rot: "${raw}"`);
          else v.rot_class = raw.toLowerCase(); break;
        case 'unit': {
          const u = normUnit(raw);
          if (!(PRICE_UNITS as readonly string[]).includes(u)) rowErrors.push(`Okänd enhet: "${raw}"`);
          else v.unit = u; break;
        }
        case 'level':
          if (!raw) v.level = null;
          else if (!PRICE_LEVELS.includes(raw.toLowerCase() as PriceLevel)) rowErrors.push(`Okänd nivå: "${raw}"`);
          else v.level = raw.toLowerCase(); break;
        case 'color_system':
          if (!raw) v.color_system = null;
          else if (!['NCS', 'RAL'].includes(raw.toUpperCase())) rowErrors.push(`Okänt kulörsystem: "${raw}"`);
          else v.color_system = raw.toUpperCase() as ColorSystem; break;
        case 'price_date': {
          const d = parseDate(raw);
          if (d === 'invalid') rowErrors.push(`Ogiltigt prisdatum (ÅÅÅÅ-MM-DD): "${raw}"`);
          else v.price_date = d; break;
        }
        default:
          v[field] = raw === '' ? null : raw;
      }
    });
    const code = (values.code ?? '').trim();
    if (!code) rowErrors.unshift('Kod saknas');
    if (!values.name) rowErrors.unshift('Namn saknas');
    rows.push({ line: i + 1, code, values, errors: rowErrors });
  }

  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.code) continue;
    if (seen.has(r.code)) r.errors.push(`Koden finns redan på rad ${seen.get(r.code)}`);
    else seen.set(r.code, r.line);
  }
  return { rows, errors, columns };
}

export type ImportDiffStatus = 'ny' | 'andrad' | 'oforandrad' | 'fel';

export interface ImportChange { field: ImportField; old: unknown; new: unknown }

export interface ImportDiffRow {
  row: ParsedImportRow;
  status: ImportDiffStatus;
  changes: ImportChange[];
  existing?: PriceItem;
}

const same = (field: ImportField, a: unknown, b: unknown) => {
  if ((a == null || a === '') && (b == null || b === '')) return true;
  if (NUMERIC.includes(field)) return a != null && b != null && Number(a) === Number(b);
  return String(a ?? '') === String(b ?? '');
};

/** Märker varje importrad ny, ändrad (med gammalt → nytt), oförändrad eller fel. */
export function diffPriceImport(rows: ParsedImportRow[], existing: PriceItem[]): ImportDiffRow[] {
  const byCode = new Map(existing.map(e => [e.code, e]));
  return rows.map(row => {
    if (row.errors.length) return { row, status: 'fel' as const, changes: [] };
    const ex = byCode.get(row.code);
    if (!ex) return { row, status: 'ny' as const, changes: [] };
    const changes: ImportChange[] = [];
    for (const [field, value] of Object.entries(row.values) as [ImportField, unknown][]) {
      if (field === 'code') continue;
      const old = (ex as unknown as Record<string, unknown>)[field];
      if (!same(field, old, value)) changes.push({ field, old: old ?? null, new: value ?? null });
    }
    return { row, status: changes.length ? 'andrad' as const : 'oforandrad' as const, changes, existing: ex };
  });
}

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = Object.fromEntries(
  Object.entries(IMPORT_COLUMNS).map(([h, f]) => [f, h]),
) as Record<ImportField, string>;
