import type { PriceItem } from './types';

export type PricePatch = Partial<Omit<PriceItem, 'id' | 'created_at' | 'updated_at'>>;

const sameNum = (a: unknown, b: unknown) => (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));

/**
 * Tillämpar en ändring på en prisrad.
 * - Ändrat kundpris på en godkänd rad utan approve: tillbaka till utkast.
 * - approve = true: godkänd av user nu.
 * - Status utkast nollar alltid godkännandet. updated_by sätts alltid.
 */
export function applyPriceEdit(item: PriceItem, patch: PricePatch, user: string, now: Date | string, approve = false): PriceItem {
  const next: PriceItem = { ...item, ...patch, updated_by: user };
  const priceChanged = 'price_ex_vat' in patch && !sameNum(patch.price_ex_vat, item.price_ex_vat);
  if (approve) {
    next.status = 'godkand';
    next.approved_by = user;
    next.approved_at = typeof now === 'string' ? now : now.toISOString();
  } else if (item.status === 'godkand' && priceChanged && next.status === 'godkand') {
    next.status = 'utkast';
  }
  if (next.status === 'utkast') {
    next.approved_by = null;
    next.approved_at = null;
  }
  return next;
}
