// Ren beräkningslogik för konsultlöner — delad mellan webbapp (Vite) och edge functions (Deno).
// Inga plattformsspecifika importer.

export interface CommissionTier { upTo: number | null; pct: number }

export const DEFAULT_TIERS: CommissionTier[] = [
  { upTo: 100000, pct: 30 },
  { upTo: 150000, pct: 35 },
  { upTo: 200000, pct: 40 },
  { upTo: 250000, pct: 45 },
  { upTo: null, pct: 50 },
];

/** Första steget där tb <= upTo (upTo null = resten). tb <= 0 → första steget. */
export function tierFor(tb: number, tiers: CommissionTier[] = DEFAULT_TIERS): CommissionTier {
  if (!(tb > 0)) return tiers[0];
  for (const tier of tiers) {
    if (tier.upTo === null || tb <= tier.upTo) return tier;
  }
  return tiers[tiers.length - 1];
}

export interface PayLine { kind: 'standard' | 'receipt' | 'manual'; amount: number; included: boolean }

export interface PayInput {
  tb: number;
  tiers?: CommissionTier[];
  lines: PayLine[];
  loanRepayment?: number;
  vatRate?: number;
}

export interface PayResult {
  pct: number;
  gross: number;
  deductions: number;
  loanRepayment: number;
  net: number;
  vat: number;
  total: number;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * gross = round(tb*pct/100); deductions = summa av included-rader (2 decimaler);
 * net = Math.round(gross - deductions - loanRepayment) (hela kronor, som tidigare fakturor); vat = round2(net*vatRate/100);
 * total = round2(net+vat). net får bli negativt (visas som varning i UI, blockeras inte).
 */
export function calcPayout(i: PayInput): PayResult {
  const vatRate = i.vatRate ?? 25;
  const pct = tierFor(i.tb, i.tiers ?? DEFAULT_TIERS).pct;
  const gross = Math.round((i.tb * pct) / 100);
  const deductions = round2(
    i.lines.filter(l => l.included).reduce((s, l) => s + (Number(l.amount) || 0), 0),
  );
  const loanRepayment = round2(Number(i.loanRepayment) || 0);
  const net = Math.round(gross - deductions - loanRepayment);
  const vat = round2((net * vatRate) / 100);
  return { pct, gross, deductions, loanRepayment, net, vat, total: round2(net + vat) };
}

/** Normaliserar OCR-/ärende-/fakturanummer: bara siffror och bokstäver, versaler, inga mellanslag/bindestreck. Returnerar '' om färre än 6 tecken. */
export function normalizeDocNumber(s: string | null | undefined): string {
  const norm = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return norm.length >= 6 ? norm : '';
}

export const MONTH_NAMES_SV = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

const MONTH_PATTERN = /(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|okt|nov|dec)\b/i;

const MONTH_INDEX: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, okt: 10, nov: 11, dec: 12,
};

/**
 * Tolkar månad + år ur ett Drive-mappnamn: 'VPLG Oktober 2026' → '2026-10-01',
 * 'VPLG Aug 2026' → '2026-08-01', 'VPLG maj 26 - Att dra av utbet' → '2026-05-01',
 * 'Utlägg Mars 26' → '2026-03-01'. År 2 eller 4 siffror. null om inget hittas.
 */
export function parseMonthFolderName(name: string): string | null {
  const match = MONTH_PATTERN.exec(name);
  if (!match) return null;
  const month = MONTH_INDEX[match[1].toLowerCase()];
  if (!month) return null;
  const rest = name.slice(match.index + match[0].length) + ' ' + name.slice(0, match.index);
  const yearMatch = /\b(\d{2}|\d{4})\b/.exec(rest);
  if (!yearMatch) return null;
  const yearNum = Number(yearMatch[1]);
  const year = yearMatch[1].length === 2 ? 2000 + yearNum : yearNum;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split('-').map(Number);
  return `${MONTH_NAMES_SV[m - 1]} ${y}`;
}

/** Svenska etiketter för avdragstyper (doc_type). */
export const DOC_TYPE_LABELS: Record<string, string> = {
  p_bot: 'P-böter',
  kontrollavgift: 'Kontrollavgift',
  trangselskatt: 'Trängselskatt',
  tesla_laddning: 'Tesla-laddning',
  farja: 'Färja',
  fordonsskatt: 'Fordonsskatt',
  inkasso: 'Inkasso',
  annat: 'Annat',
};
