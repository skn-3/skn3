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

/** Bara administratör godkänner priser (databasen spärrar detsamma med triggern price_items_guard_approval). */
export const canApprovePrices = (role: { isAdmin?: boolean | null } | null | undefined): boolean => !!role?.isAdmin;

/** Valgruppen för golvmaterial; bara de prisraderna har en läggningsrad (meta.lay_code). */
export const GOLV_MATERIAL_SLOT = 'golv.golvtyp';

/** Golvets arbetsrader att välja som läggningsrad: gren golv, typ arbete, inte arkiverade. Ordnade som prislistan. */
export function layCodeOptions(items: PriceItem[]): PriceItem[] {
  return items
    .filter(i => i.trade === 'golv' && i.kind === 'arbete' && i.status !== 'arkiverad')
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.name.localeCompare(b.name, 'sv'));
}

/** Läggningsraden i meta, null när den saknas. */
export function layCodeOf(meta: Record<string, unknown> | null | undefined): string | null {
  const v = meta?.lay_code;
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Sätter (eller tar bort med null/tom) meta.lay_code; övriga nycklar i meta lämnas orörda. */
export function withLayCode(meta: Record<string, unknown> | null | undefined, code: string | null): Record<string, unknown> {
  const next = { ...(meta ?? {}) };
  if (code && code.trim()) next.lay_code = code.trim();
  else delete next.lay_code;
  return next;
}
