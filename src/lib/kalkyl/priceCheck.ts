// En enda regel för "kalkylens pris stämmer inte längre med prislistan".
// Används av priceChanges (raden "priser har ändrats") och av kontrollen pris_andrat (skicka-spärren).
import type { KalkylData, KalkylLine, KalkylRow, PriceItem } from './types';
import type { PriceIndex } from './prices';
import { round2 } from './packaging';
import { OWN_LINE_PREFIX } from './kalkyl';

const price2 = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : round2(Number(v)));

/** Prislistans pris och radens sparade à-pris skiljer sig (avrundat till 2 decimaler, null-säkert). */
export function priceDiffers(line: Pick<KalkylLine, 'unit_price'>, item: Pick<PriceItem, 'price_ex_vat'> | null | undefined): boolean {
  if (!item) return false;
  return price2(item.price_ex_vat) !== price2(line.unit_price);
}

const hasOwnPrice = (o: { unit_price?: number } | undefined) => o?.unit_price != null && Number.isFinite(Number(o.unit_price));

/**
 * Raderna i en kalkylrad som ska följa prislistan: rader med prislistekod där säljaren inte satt ett eget à-pris.
 * Golv och målning jämförs på den sparade raden före säljarens ändringar; bara ett ändrat à-pris räknas som eget
 * (ändrad mängd räcker inte). Fria rader och egna rader (nyckel "egen.") räknas som egna när manual är satt.
 */
export function listPricedLines(row: KalkylRow): KalkylLine[] {
  const ov = row.overrides ?? {};
  return (row.lines ?? []).filter(l => {
    if (!l.code) return false;
    const o = ov[l.key];
    if (o?.removed) return false;
    if (row.trade === 'fri' || l.key.startsWith(OWN_LINE_PREFIX)) return !l.manual;
    return !hasOwnPrice(o);
  });
}

/** Gemensamma rader som ska följa prislistan. */
export const listPricedCommon = (data: Pick<KalkylData, 'common'>): KalkylLine[] =>
  (data.common ?? []).filter(l => !!l.code && !l.manual);

/** Raderna vars sparade à-pris inte längre är prislistans pris. */
export const linesWithChangedPrice = (lines: KalkylLine[], prices: PriceIndex): KalkylLine[] =>
  lines.filter(l => !!l.code && priceDiffers(l, prices[l.code]));
