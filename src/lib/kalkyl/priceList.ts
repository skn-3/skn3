import type { KalkylSettings, PriceItem, PriceKind, PriceStatus, PriceTrade } from './types';
import { DEFAULT_KALKYL_SETTINGS } from './types';
import { isStale, priceAgeDays } from './prices';
import { round2 } from './packaging';

/** Etiketter i den ordning grenarna visas i appen. */
export const TRADE_LABEL: Record<PriceTrade, string> = {
  golv: 'Golv', malning: 'Målning', fasad: 'Fasad och puts', tak: 'Tak', altan: 'Altan och trall',
  mark: 'Mark, betong och grävning', el: 'El', badrum: 'Badrum', kok: 'Kök', renovering: 'Renovering', gemensamt: 'Gemensamt',
};
export const KIND_LABEL: Record<PriceKind, string> = { arbete: 'Arbete', material: 'Material', tillbehor: 'Tillbehör', ovrigt: 'Övrigt' };
export const STATUS_LABEL: Record<PriceStatus, string> = { utkast: 'Utkast', godkand: 'Godkänd', arkiverad: 'Arkiverad' };

/** Pris inklusive moms för visning. Databasen lagrar alltid exklusive moms. */
export function inclVat(exVat: number | null | undefined, vatRate = 0.25): number | null {
  return exVat == null ? null : round2(Number(exVat) * (1 + vatRate));
}

/** Täckningsbidrag i procent per enhet, null när kostnad eller pris saknas. */
export function itemTbPct(item: Pick<PriceItem, 'price_ex_vat' | 'cost_ex_vat'>): number | null {
  const p = item.price_ex_vat == null ? null : Number(item.price_ex_vat);
  const c = item.cost_ex_vat == null ? null : Number(item.cost_ex_vat);
  if (p == null || c == null || !(p > 0)) return null;
  return round2(((p - c) / p) * 100);
}

export type ReviewReason = 'saknar_pris' | 'utkast' | 'gammalt';

/** Varför en aktiv prisrad behöver kontroll: pris saknas, utkast eller äldre än max prisålder. */
export function reviewReasons(item: PriceItem, today: Date | string, maxAgeDays: number): ReviewReason[] {
  if (item.status === 'arkiverad') return [];
  const out: ReviewReason[] = [];
  if (item.price_ex_vat == null) out.push('saknar_pris');
  if (item.status === 'utkast') out.push('utkast');
  if (isStale(item, today, maxAgeDays)) out.push('gammalt');
  return out;
}

export function needsReview(item: PriceItem, today: Date | string, maxAgeDays: number): boolean {
  return reviewReasons(item, today, maxAgeDays).length > 0;
}

export interface PriceListSummary { total: number; utkast: number; godkand: number; arkiverad: number; saknar_pris: number; gamla: number }

export function priceListSummary(items: PriceItem[], today: Date | string, maxAgeDays: number): PriceListSummary {
  const s: PriceListSummary = { total: items.length, utkast: 0, godkand: 0, arkiverad: 0, saknar_pris: 0, gamla: 0 };
  for (const it of items) {
    s[it.status] += 1;
    if (it.status !== 'arkiverad' && it.price_ex_vat == null) s.saknar_pris += 1;
    if (it.status !== 'arkiverad' && isStale(it, today, maxAgeDays)) s.gamla += 1;
  }
  return s;
}

export function priceAgeLabel(item: Pick<PriceItem, 'price_date'>, today: Date | string): string | null {
  const age = priceAgeDays(item, today);
  if (age == null) return null;
  if (age <= 0) return 'i dag';
  return age === 1 ? '1 dag' : `${age} dagar`;
}

/** Läser kalkylinställningar och faller tillbaka på standardvärden för saknade eller ogiltiga fält. */
export function parseKalkylSettings(raw: unknown): KalkylSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_KALKYL_SETTINGS };
  for (const key of Object.keys(out) as (keyof KalkylSettings)[]) {
    const v = Number(src[key]);
    if (src[key] != null && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

/** Validerar ändrade kalkylinställningar. Returnerar fel per fält. */
export function validateKalkylSettings(s: KalkylSettings): Partial<Record<keyof KalkylSettings, string>> {
  const err: Partial<Record<keyof KalkylSettings, string>> = {};
  if (!(s.margin_target_pct >= 0 && s.margin_target_pct < 100)) err.margin_target_pct = 'Ange 0–99 %';
  if (!(Number.isInteger(s.price_max_age_days) && s.price_max_age_days >= 1)) err.price_max_age_days = 'Ange minst 1 dag';
  for (const k of ['door_width_m', 'door_height_m', 'window_width_m', 'window_height_m'] as const) {
    if (!(s[k] > 0 && s[k] <= 5)) err[k] = 'Ange 0,01–5 m';
  }
  return err;
}

/** Normaliserar en kod till stabil nyckel i gemener. */
export function normalizePriceCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Gruppering för listan: gren och typ i fast ordning, raderna efter sort_order och namn. */
export function groupPriceItems(items: PriceItem[]): { trade: PriceTrade; kind: PriceKind; items: PriceItem[] }[] {
  const tradeOrder = Object.keys(TRADE_LABEL) as PriceTrade[];
  const kindOrder = Object.keys(KIND_LABEL) as PriceKind[];
  const map = new Map<string, { trade: PriceTrade; kind: PriceKind; items: PriceItem[] }>();
  for (const it of items) {
    const key = `${it.trade}|${it.kind}`;
    if (!map.has(key)) map.set(key, { trade: it.trade, kind: it.kind, items: [] });
    map.get(key)!.items.push(it);
  }
  return [...map.values()]
    .sort((a, b) => tradeOrder.indexOf(a.trade) - tradeOrder.indexOf(b.trade) || kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind))
    .map(g => ({ ...g, items: g.items.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'sv')) }));
}
