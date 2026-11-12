// Grenrader: en fri rad som hör till en gren utan recept (fasad, tak, altan, mark, el, badrum, kök, renovering).
// Mängdlistan, mått och ROT-reglaget räknas här; komponenterna räknar aldrig själva.
import type { GrenMeasure, GrenTrade, KalkylData, KalkylLine, KalkylRoom, KalkylRow, PriceItem, PriceKind } from './types';
import { isGrenTrade } from './types';
import type { PriceIndex } from './prices';
import { floorArea } from './geometry';
import { round2 } from './packaging';
import { KIND_LABEL, TRADE_LABEL } from './priceList';
import { addFriLine, newId, removeFriLine, sameAmount, updateFriLine } from './state';

export type GrenRow = KalkylRow & { trade: 'fri'; gren: GrenTrade };

/** Fri rad med en giltig gren. */
export const isGrenRow = (row: KalkylRow | null | undefined): row is GrenRow =>
  !!row && row.trade === 'fri' && isGrenTrade(row.gren);

/** Typen som visas i översikten och radhuvudet: Golv, Målning, grenens etikett eller Fri rad. */
export function rowTypeLabel(row: Pick<KalkylRow, 'trade' | 'gren'>): string {
  if (row.trade === 'golv') return 'Golv';
  if (row.trade === 'malning') return 'Målning';
  return isGrenTrade(row.gren) ? TRADE_LABEL[row.gren] : 'Fri rad';
}

const pos = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
};

/** Ny grenrad. Med rum förifylls ytan med rummets golvyta. Benämningen blir grenens etikett när den är tom. */
export function newGrenRow(roomId: string | null, gren: GrenTrade, title: string, room?: Pick<KalkylRoom, 'dims'> | null): KalkylRow {
  const row: KalkylRow = { id: newId('rad_'), room_id: roomId, trade: 'fri', gren, title: title.trim() || TRADE_LABEL[gren], input: null, lines: [] };
  const area = roomId && room ? pos(floorArea(room.dims)) : null;
  if (area != null) row.measure = { area };
  return row;
}

// ── Mängdlistan ─────────────────────────────────────────────────────────────

/** Typordning i mängdlistan. */
export const GREN_KIND_ORDER: PriceKind[] = ['arbete', 'material', 'tillbehor', 'ovrigt'];
/** Sökfältet visas när grenen har fler prisrader än så här. */
export const GREN_SEARCH_LIMIT = 12;

/** Grenens prisrader som inte är arkiverade, sorterade som prislistan (sort_order, sedan namn). */
export function grenItems(items: PriceItem[], gren: GrenTrade): PriceItem[] {
  return items
    .filter(i => i.trade === gren && i.status !== 'arkiverad')
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'sv'));
}

export interface GrenGroup { kind: PriceKind; label: string; items: PriceItem[] }

/** Mängdlistan grupperad efter typ (Arbete, Material, Tillbehör, Övrigt). Sökningen matchar namn, spec och kod. */
export function grenListGroups(items: PriceItem[], gren: GrenTrade, query = ''): GrenGroup[] {
  const q = query.trim().toLocaleLowerCase('sv-SE');
  const list = grenItems(items, gren).filter(i => !q || `${i.name} ${i.spec ?? ''} ${i.code}`.toLocaleLowerCase('sv-SE').includes(q));
  return GREN_KIND_ORDER
    .map(kind => ({ kind, label: KIND_LABEL[kind], items: list.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0);
}

/** Kalkylraden för en prislistekod i raden (en kalkylrad per kod via listan). */
export function grenLineFor(row: Pick<KalkylRow, 'lines'>, code: string): KalkylLine | undefined {
  return (row.lines ?? []).find(l => l.code === code);
}

/**
 * Radens kalkylrader delade i listrader (kod som hör till grenen och inte är arkiverad, första raden per kod)
 * och övriga rader (egna rader, rader från andra grenar och dubbletter).
 */
export function grenLineSplit(row: KalkylRow, prices: PriceIndex): { list: KalkylLine[]; other: KalkylLine[] } {
  const list: KalkylLine[] = [];
  const other: KalkylLine[] = [];
  const seen = new Set<string>();
  for (const l of row.lines ?? []) {
    const item = l.code ? prices[l.code] : undefined;
    const inList = isGrenRow(row) && !!item && item.trade === row.gren && item.status !== 'arkiverad' && !seen.has(item.code);
    if (inList) { seen.add(item.code); list.push(l); } else other.push(l);
  }
  return { list, other };
}

/** Föreslagen mängd: ytan för m², längden för m, annars 1. Saknas måttet blir mängden 1. */
export function defaultGrenQty(item: Pick<PriceItem, 'unit'>, measure?: GrenMeasure | null): number {
  if (item.unit === 'm²') return pos(measure?.area) ?? 1;
  if (item.unit === 'm') return pos(measure?.length) ?? 1;
  return 1;
}

const findRow = (data: KalkylData, rowId: string) => (data.rows ?? []).find(r => r.id === rowId);

/**
 * Sätter mängden för en prisrad i grenens lista. Finns ingen kalkylrad läggs den till med prislistans pris;
 * mängd 0 tar bort den. Ett eget à-pris behålls. Kostnad och timmar räknas från prisraden.
 */
export function setGrenQty(data: KalkylData, rowId: string, item: PriceItem, qty: number, prices: PriceIndex): KalkylData {
  const row = findRow(data, rowId);
  if (!isGrenRow(row) || item.trade !== row.gren) return data;
  const q = Number(qty);
  if (!Number.isFinite(q)) return data;
  const line = grenLineFor(row, item.code);
  if (round2(q) <= 0) return line ? removeFriLine(data, rowId, line.key) : data;
  if (line) return updateFriLine(data, rowId, line.key, { qty: q }, prices);
  return addFriLine(data, rowId, prices[item.code] ?? item, q);
}

/** "Lägg till" i mängdlistan: föreslagen mängd från måtten (defaultGrenQty). Redan tillagd prisrad ändras inte. */
export function addGrenItem(data: KalkylData, rowId: string, item: PriceItem, prices: PriceIndex): KalkylData {
  const row = findRow(data, rowId);
  if (!isGrenRow(row) || grenLineFor(row, item.code)) return data;
  return setGrenQty(data, rowId, item, defaultGrenQty(item, row.measure), prices);
}

// ── Mått ────────────────────────────────────────────────────────────────────

export type MeasureUnit = 'm²' | 'm';

/** Ändrar radens mått. Tomt, 0 eller ogiltigt tas bort; utan mått tas measure bort helt. */
export function setGrenMeasure(data: KalkylData, rowId: string, patch: GrenMeasure): KalkylData {
  const row = findRow(data, rowId);
  if (!isGrenRow(row)) return data;
  const next: GrenMeasure = { ...(row.measure ?? {}) };
  if ('area' in patch) next.area = pos(patch.area);
  if ('length' in patch) next.length = pos(patch.length);
  const clean: GrenMeasure = {};
  if (next.area != null) clean.area = next.area;
  if (next.length != null) clean.length = next.length;
  const rows = data.rows.map(r => {
    if (r.id !== rowId) return r;
    const out = { ...r };
    if (Object.keys(clean).length) out.measure = clean; else delete out.measure;
    return out;
  });
  return { ...data, rows };
}

const measureOf = (row: KalkylRow, unit: MeasureUnit) => pos(unit === 'm²' ? row.measure?.area : row.measure?.length);

/** Listrader med enheten vars mängd skiljer sig från måttet (tom när måttet saknas). */
export function measureMismatch(row: KalkylRow, unit: MeasureUnit, prices: PriceIndex): KalkylLine[] {
  const v = measureOf(row, unit);
  if (v == null) return [];
  return grenLineSplit(row, prices).list.filter(l => l.unit === unit && !sameAmount(l.qty, v));
}

/** "Sätt m²-rader till …" och "Sätt meterrader till …": ändrar bara mängden på listraderna med enheten. */
export function applyMeasure(data: KalkylData, rowId: string, unit: MeasureUnit, prices: PriceIndex): KalkylData {
  const row = findRow(data, rowId);
  if (!isGrenRow(row)) return data;
  const v = measureOf(row, unit);
  if (v == null) return data;
  return measureMismatch(row, unit, prices).reduce((d, l) => updateFriLine(d, rowId, l.key, { qty: v }, prices), data);
}

// ── ROT ─────────────────────────────────────────────────────────────────────

/** Slår av eller på ROT för grenradens arbete. Prislistan och radernas sparade ROT-klass ändras inte. */
export function setGrenRotOff(data: KalkylData, rowId: string, off: boolean): KalkylData {
  const row = findRow(data, rowId);
  if (!isGrenRow(row)) return data;
  const rows = data.rows.map(r => {
    if (r.id !== rowId) return r;
    const out = { ...r };
    if (off) out.rot_off = true; else delete out.rot_off;
    return out;
  });
  return { ...data, rows };
}

export interface GrenRotRule { text: string; source: string }

const RENOVERING_ROT: GrenRotRule = {
  text: 'Reparation, underhåll, om- och tillbyggnad ger ROT på arbetet. Material, resor, maskiner och bortforsling ger inte ROT.',
  source: 'Skatteverket (ROT)',
};

/** Kort regeltext under ROT-reglaget, per gren. */
export const GREN_ROT_RULES: Record<GrenTrade, GrenRotRule> = {
  fasad: { text: 'Arbetet ger ROT i småhus. I bostadsrätt ger utvändigt arbete inte ROT. Hyra av ställning ger inte ROT.', source: 'Skatteverket (ROT)' },
  tak: { text: 'Byte och reparation av tak ger ROT i småhus. I bostadsrätt ger utvändigt arbete inte ROT.', source: 'Skatteverket (ROT)' },
  altan: { text: 'ROT gäller bara när altanen byggs ihop med huset. En fristående altan ger inte ROT.', source: 'Skatteverket (ROT)' },
  mark: { text: 'Dränering av husgrunden och grävning för ledningar ger ROT på arbetet. Plattor, sten, asfalt, murar och staket ger inte ROT. Maskiner och massor ger aldrig ROT.', source: 'Skatteverket (ROT)' },
  el: { text: 'Elinstallation i bostaden ger ROT på arbetet. För laddbox kan kunden i stället välja skattereduktion för grön teknik, men inte båda för samma arbete.', source: 'Skatteverket (ROT och grön teknik)' },
  badrum: RENOVERING_ROT,
  kok: RENOVERING_ROT,
  renovering: RENOVERING_ROT,
};
