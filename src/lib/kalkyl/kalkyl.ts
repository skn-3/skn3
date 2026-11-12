import type { GolvInput, KalkylData, KalkylLine, KalkylOverride, KalkylRoom, KalkylRow, KalkylSettings, MalningInput, RotClass } from './types';
import { isGrenTrade } from './types';
import type { PriceIndex } from './prices';
import { round2 } from './packaging';
import { computeGolv } from './recipes/golv';
import { computeMalning } from './recipes/malning';

export const VAT_RATE = 0.25;
/** Nyckelprefix för egna rader i en golv- eller målningsrad. */
export const OWN_LINE_PREFIX = 'egen.';

/**
 * Lägger säljarens ändringar ovanpå beräknade rader. Ändrad mängd eller pris
 * ger manual = true och nytt belopp; removed tar bort raden.
 */
export function applyOverrides(lines: KalkylLine[], overrides?: Record<string, KalkylOverride> | null): KalkylLine[] {
  if (!overrides) return lines.slice();
  const out: KalkylLine[] = [];
  for (const line of lines) {
    const o = overrides[line.key];
    if (!o) { out.push(line); continue; }
    if (o.removed) continue;
    const hasQty = o.qty != null && Number.isFinite(Number(o.qty));
    const hasPrice = o.unit_price != null && Number.isFinite(Number(o.unit_price));
    if (!hasQty && !hasPrice) { out.push(line); continue; }
    const qty = hasQty ? round2(Math.max(0, Number(o.qty))) : line.qty;
    const unit_price = hasPrice ? Number(o.unit_price) : line.unit_price;
    const ratio = line.qty > 0 ? qty / line.qty : null;
    out.push({
      ...line,
      qty,
      unit_price,
      amount: unit_price == null ? 0 : round2(qty * unit_price),
      cost: line.cost == null ? line.cost : ratio == null ? null : round2(line.cost * ratio),
      hours: line.hours == null ? line.hours : ratio == null ? null : round2(line.hours * ratio),
      manual: true,
    });
  }
  return out;
}

/** Grenrad där säljaren stängt av ROT ("ROT på arbetet i den här raden" av). */
export const rowRotOff = (row: Pick<KalkylRow, 'trade' | 'gren' | 'rot_off'>): boolean =>
  row.trade === 'fri' && isGrenTrade(row.gren) && row.rot_off === true;

/** Radens gällande ROT-klass: arbete räknas som övrigt när ROT är avstängt på grenraden. */
export const effectiveRotClass = (row: Pick<KalkylRow, 'trade' | 'gren' | 'rot_off'>, cls: RotClass): RotClass =>
  cls === 'arbete' && rowRotOff(row) ? 'ovrigt' : cls;

/**
 * Raderna som gäller för en kalkylrad efter säljarens ändringar. Det enda stället där ROT-reglaget på en grenrad
 * verkar: summering, ROT-underlag, offertrader och kontroller läser alla härifrån. Sparad ROT-klass ändras inte.
 */
export function rowLines(row: KalkylRow): KalkylLine[] {
  const lines = applyOverrides(row.lines ?? [], row.overrides);
  if (!rowRotOff(row)) return lines;
  return lines.map(l => (l.rot_class === 'arbete' ? { ...l, rot_class: 'ovrigt' as const } : l));
}

/** Räknar om en kalkylrad från rummets mått och prislistan. Fria rader lämnas orörda. */
export function computeRow(row: KalkylRow, room: KalkylRoom | null | undefined, prices: PriceIndex, settings: KalkylSettings): KalkylRow {
  if (!room || !row.input || row.trade === 'fri') return row;
  // Säljarens egna rader (nyckel "egen.") följer med när receptet räknas om.
  const own = (row.lines ?? []).filter(l => l.key.startsWith(OWN_LINE_PREFIX));
  if (row.trade === 'golv') return { ...row, lines: [...computeGolv(room.dims, row.input as GolvInput, prices, settings), ...own] };
  if (row.trade === 'malning') return { ...row, lines: [...computeMalning(room.dims, row.input as MalningInput, prices, settings), ...own] };
  return row;
}

export interface KalkylSummary {
  arbete: number;
  material: number;
  ovrigt: number;
  total_ex_vat: number;
  total_incl_vat: number;
  /** Summa av kända kostnader. */
  cost: number;
  /** Falskt om någon rad med belopp saknar kostnad. */
  cost_known: boolean;
  tb: number;
  tb_pct: number | null;
  hours: number;
}

export function summarize(lines: KalkylLine[], vatRate = VAT_RATE): KalkylSummary {
  const by: Record<RotClass, number> = { arbete: 0, material: 0, ovrigt: 0 };
  let cost = 0;
  let cost_known = true;
  let hours = 0;
  for (const l of lines) {
    const amount = Number(l.amount) || 0;
    by[l.rot_class] = (by[l.rot_class] ?? 0) + amount;
    if (l.cost == null) { if (amount !== 0) cost_known = false; }
    else cost += Number(l.cost) || 0;
    hours += Number(l.hours) || 0;
  }
  const total_ex_vat = round2(by.arbete + by.material + by.ovrigt);
  const tb = round2(total_ex_vat - cost);
  return {
    arbete: round2(by.arbete),
    material: round2(by.material),
    ovrigt: round2(by.ovrigt),
    total_ex_vat,
    total_incl_vat: round2(total_ex_vat * (1 + vatRate)),
    cost: round2(cost),
    cost_known,
    tb,
    tb_pct: total_ex_vat > 0 ? round2((tb / total_ex_vat) * 100) : null,
    hours: round2(hours),
  };
}

/** Justeringar (rabatter m.m.) som kalkylrader. De har ingen inköpskostnad. */
export function adjustmentLines(data: Pick<KalkylData, 'adjustments'>): KalkylLine[] {
  return (data.adjustments ?? []).map(a => ({
    key: `adj.${a.id}`,
    code: null,
    description: a.label,
    rot_class: a.rot_class,
    qty: 1,
    unit: 'st',
    unit_price: round2(Number(a.amount) || 0),
    amount: round2(Number(a.amount) || 0),
    cost: 0,
  }));
}

/** Alla rader i kalkylen: rum och ytor efter ändringar, gemensamma rader och justeringar. */
export function allLines(data: KalkylData): KalkylLine[] {
  return [
    ...(data.rows ?? []).flatMap(rowLines),
    ...(data.common ?? []),
    ...adjustmentLines(data),
  ];
}

export function summarizeKalkyl(data: KalkylData, vatRate = VAT_RATE): KalkylSummary {
  return summarize(allLines(data), vatRate);
}

export function emptyKalkyl(): KalkylData {
  return { version: 1, premises: { house_type: null, build_year: null, floors: null }, rooms: [], rows: [], common: [], adjustments: [], priced_at: null };
}
