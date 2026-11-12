// Valgrupper: säljaren väljer produkt (bas, standard, premium) för tillbehör och färg.
// En enda regel avgör vilken prislistekod som gäller för en valgrupp i en kalkylrad.
import type { PriceItem, SlotSelections } from './types';
import type { PriceIndex } from './prices';

export const SELECTABLE_SLOTS = [
  'golv.underlag', 'golv.sockel', 'golv.troskel', 'malning.vaggfarg', 'malning.takfarg', 'malning.snickerifarg',
] as const;
export type SelectableSlot = (typeof SELECTABLE_SLOTS)[number];

/** Dagens fasta koder i recepten. Används när inget val finns (sparade kalkyler före valgrupper). */
export const SLOT_DEFAULT_CODES: Record<SelectableSlot, string> = {
  'golv.underlag': 'golv.mat.underlag',
  'golv.sockel': 'golv.mat.sockel-vit-12x56',
  'golv.troskel': 'golv.mat.troskel-ek',
  'malning.vaggfarg': 'malning.mat.vaggfarg',
  'malning.takfarg': 'malning.mat.takfarg',
  'malning.snickerifarg': 'malning.mat.snickerifarg',
};

export const SLOT_LABEL: Record<SelectableSlot, string> = {
  'golv.underlag': 'Underlag', 'golv.sockel': 'Sockellist', 'golv.troskel': 'Tröskel',
  'malning.vaggfarg': 'Väggfärg', 'malning.takfarg': 'Takfärg', 'malning.snickerifarg': 'Snickerifärg',
};

export const isSelectableSlot = (slot: string | null | undefined): slot is SelectableSlot =>
  !!slot && (SELECTABLE_SLOTS as readonly string[]).includes(slot);

const usable = (it: PriceItem | undefined): it is PriceItem => !!it && it.status !== 'arkiverad';
const byOrder = (a: PriceItem, b: PriceItem) =>
  (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/** Valbara produkter i valgruppen: icke arkiverade prisrader, lägst sort_order först, sedan kod. */
export function slotProducts(slot: string, prices: PriceIndex | PriceItem[]): PriceItem[] {
  const list = Array.isArray(prices) ? prices : Object.values(prices);
  return list.filter(i => i?.slot === slot && usable(i)).sort(byOrder);
}

/** Säljaren kan välja mellan minst två produkter i valgruppen. */
export const hasProductChoice = (slot: string, prices: PriceIndex | PriceItem[]) => slotProducts(slot, prices).length >= 2;

/**
 * Koden som gäller för en valgrupp:
 * 1. den valda koden om den finns i prislistan, hör till valgruppen och inte är arkiverad,
 * 2. annars dagens fasta kod om den finns och inte är arkiverad,
 * 3. annars första icke arkiverade prisraden i valgruppen (lägst sort_order, sedan kod),
 * 4. annars dagens fasta kod (ger "pris saknas" som tidigare).
 */
export function resolveSlotCode(slot: SelectableSlot, selections: SlotSelections | null | undefined, prices: PriceIndex): string {
  const chosen = selections?.[slot];
  if (chosen) {
    const it = prices[chosen];
    if (usable(it) && it.slot === slot) return chosen;
  }
  const fixed = SLOT_DEFAULT_CODES[slot];
  if (usable(prices[fixed])) return fixed;
  const first = slotProducts(slot, prices)[0];
  return first ? first.code : fixed;
}

/** Prisraden som gäller för valgruppen, undefined när den saknas i prislistan. */
export const resolveSlotItem = (slot: SelectableSlot, selections: SlotSelections | null | undefined, prices: PriceIndex): PriceItem | undefined =>
  prices[resolveSlotCode(slot, selections, prices)];
