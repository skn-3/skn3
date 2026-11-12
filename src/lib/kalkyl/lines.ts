import type { KalkylLine, PriceItem, RotClass } from './types';
import type { PriceIndex } from './prices';
import { round2 } from './packaging';

export interface LineFallback { description: string; unit: string; rot_class: RotClass }

/**
 * Bygger en kalkylrad från prislistan. Saknas prisraden eller priset blir
 * unit_price null och amount 0 – ett pris hittas aldrig på.
 */
export function priceLine(
  key: string,
  prices: PriceIndex,
  code: string | null,
  qty: number,
  fallback: LineFallback,
  detail?: string,
): KalkylLine {
  const item: PriceItem | undefined = code ? prices[code] : undefined;
  const q = round2(Math.max(0, Number(qty) || 0));
  const unitPrice = item?.price_ex_vat == null ? null : Number(item.price_ex_vat);
  const unitCost = item?.cost_ex_vat == null ? null : Number(item.cost_ex_vat);
  const hpu = item?.hours_per_unit == null ? null : Number(item.hours_per_unit);
  const line: KalkylLine = {
    key,
    code,
    description: item?.name ?? fallback.description,
    rot_class: item?.rot_class ?? fallback.rot_class,
    qty: q,
    unit: item?.unit ?? fallback.unit,
    unit_price: unitPrice,
    amount: unitPrice == null ? 0 : round2(q * unitPrice),
    cost: unitCost == null ? null : round2(q * unitCost),
    hours: hpu == null ? null : round2(q * hpu),
    price_date: item?.price_date ?? null,
    price_status: item?.status ?? null,
  };
  if (detail) line.detail = detail;
  return line;
}

const PLURAL: Record<string, string> = { paket: 'paket', rulle: 'rullar', 'längd': 'längder', hink: 'hinkar', burk: 'burkar', st: 'st' };
export const packLabel = (label: string | null | undefined, count: number) => {
  const l = (label ?? 'förp.').trim();
  return count === 1 ? l : (PLURAL[l] ?? l);
};

export const fmtQty = (v: number, maxDecimals = 1) =>
  v.toLocaleString('sv-SE', { maximumFractionDigits: maxDecimals });
