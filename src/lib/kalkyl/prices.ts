import type { PriceItem } from './types';

export type PriceIndex = Record<string, PriceItem>;

export function indexPrices(items: PriceItem[]): PriceIndex {
  const out: PriceIndex = {};
  for (const it of items) if (it?.code) out[it.code] = it;
  return out;
}

const DAY = 86_400_000;
const dayStart = (v: Date | string) => {
  const d = typeof v === 'string' ? new Date(v.length === 10 ? `${v}T00:00:00Z` : v) : v;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Antal hela dagar sedan prisdatum, null om datum saknas. */
export function priceAgeDays(item: Pick<PriceItem, 'price_date'>, today: Date | string): number | null {
  if (!item.price_date) return null;
  const t = dayStart(item.price_date);
  if (Number.isNaN(t)) return null;
  return Math.round((dayStart(today) - t) / DAY);
}

export function isStale(item: Pick<PriceItem, 'price_date'>, today: Date | string, maxAgeDays: number): boolean {
  const age = priceAgeDays(item, today);
  return age != null && age > maxAgeDays;
}
