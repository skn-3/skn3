// Oföränderliga uppdateringar av KalkylData. Varje funktion returnerar en ny kalkyl
// och räknar om berörda rader från prislistan – komponenterna räknar aldrig själva.
import type {
  GolvInput, KalkylAdjustment, KalkylData, KalkylLine, KalkylOverride, KalkylRoom, KalkylRow, KalkylSettings,
  MalningInput, PriceItem, RoomDims, RotClass,
} from './types';
import type { PriceIndex } from './prices';
import { computeRow, OWN_LINE_PREFIX } from './kalkyl';
import { priceLine } from './lines';
import { round2 } from './packaging';
import { listPricedCommon, listPricedLines, priceDiffers } from './priceCheck';
import { isSelectableSlot } from './slots';

export function newId(prefix = ''): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const id = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}${id}` : id;
}

const num = (v: unknown, fallback = 0) => { const x = Number(v); return Number.isFinite(x) ? x : fallback; };

export const DEFAULT_ROOM_DIMS: RoomDims = { length: 4, width: 3, height: 2.4, doors: 1, windows: 1 };

/** Mått städas: längder ≥ 0 med högst 2 decimaler, dörrar och fönster hela tal ≥ 0. */
export function cleanDims(d: Partial<RoomDims>, base: RoomDims = DEFAULT_ROOM_DIMS): RoomDims {
  const len = (v: unknown, b: number) => round2(Math.max(0, num(v, b)));
  const cnt = (v: unknown, b: number) => Math.max(0, Math.floor(num(v, b)));
  return {
    length: len(d.length, base.length),
    width: len(d.width, base.width),
    height: len(d.height, base.height),
    doors: cnt(d.doors, base.doors),
    windows: cnt(d.windows, base.windows),
  };
}

// ── Rum ─────────────────────────────────────────────────────────────────────

export function newRoom(name: string, dims: Partial<RoomDims>): KalkylRoom {
  return { id: newId('rum_'), name: name.trim() || 'Rum', dims: cleanDims(dims) };
}

export function addRoom(data: KalkylData, room: KalkylRoom): KalkylData {
  return { ...data, rooms: [...(data.rooms ?? []), room] };
}

export interface RoomPatch { name?: string; dims?: Partial<RoomDims> }

/** Ändrar rummet och räknar om alla rader i rummet. */
export function updateRoom(data: KalkylData, roomId: string, patch: RoomPatch, prices: PriceIndex, settings: KalkylSettings): KalkylData {
  let room: KalkylRoom | undefined;
  const rooms = (data.rooms ?? []).map(r => {
    if (r.id !== roomId) return r;
    room = {
      ...r,
      name: patch.name != null ? (patch.name.trim() || r.name) : r.name,
      dims: patch.dims ? cleanDims({ ...r.dims, ...patch.dims }, r.dims) : r.dims,
    };
    return room;
  });
  if (!room) return data;
  const rows = (data.rows ?? []).map(row => (row.room_id === roomId ? computeRow(row, room, prices, settings) : row));
  return { ...data, rooms, rows };
}

export const roomOf = (data: KalkylData, row: Pick<KalkylRow, 'room_id'> | null | undefined) =>
  row?.room_id ? (data.rooms ?? []).find(r => r.id === row.room_id) ?? null : null;

// ── Rader ───────────────────────────────────────────────────────────────────

export const DEFAULT_GOLV_INPUT: Omit<GolvInput, 'material_code'> = {
  direction: 'langs', underlag: true, sockel: true, troskel: false, rivning: false, flytspackling: false, mobelflytt: false, bortforsling: false,
};
export const DEFAULT_MALNING_INPUT: MalningInput = {
  underarbete: 'normal', tak: true, snickerier: false,
  kulor_vagg: { system: 'NCS', code: 'S 0502-Y', name: 'Varmvit', hex: '#F3F0E6' },
  kulor_tak: { system: 'NCS', code: 'S 0500-N', name: 'Vit', hex: '#F4F3EF' },
  kulor_snickerier: { system: 'NCS', code: 'S 0502-Y', name: 'Varmvit', hex: '#F3F0E6' },
};

export function newGolvRow(roomId: string, materialCode: string): KalkylRow {
  return { id: newId('rad_'), room_id: roomId, trade: 'golv', title: 'Golv', input: { material_code: materialCode, ...DEFAULT_GOLV_INPUT }, lines: [] };
}

export function newMalningRow(roomId: string): KalkylRow {
  return { id: newId('rad_'), room_id: roomId, trade: 'malning', title: 'Målning', input: { ...DEFAULT_MALNING_INPUT }, lines: [] };
}

export function newFriRow(roomId: string | null, title: string): KalkylRow {
  return { id: newId('rad_'), room_id: roomId, trade: 'fri', title: title.trim() || 'Fri rad', input: null, lines: [] };
}

/** Lägger till raden sist och räknar fram dess rader från rummets mått. */
export function addRow(data: KalkylData, row: KalkylRow, prices: PriceIndex, settings: KalkylSettings): KalkylData {
  const computed = computeRow(row, roomOf(data, row), prices, settings);
  return { ...data, rows: [...(data.rows ?? []), computed] };
}

const mapRow = (data: KalkylData, rowId: string, fn: (row: KalkylRow) => KalkylRow): KalkylData => {
  let hit = false;
  const rows = (data.rows ?? []).map(r => { if (r.id !== rowId) return r; hit = true; return fn(r); });
  return hit ? { ...data, rows } : data;
};

export function updateRowInput(
  data: KalkylData, rowId: string, patch: Partial<GolvInput> | Partial<MalningInput>, prices: PriceIndex, settings: KalkylSettings,
): KalkylData {
  return mapRow(data, rowId, row => {
    if (!row.input) return row;
    const next: KalkylRow = { ...row, input: { ...row.input, ...patch } as GolvInput | MalningInput };
    return computeRow(next, roomOf(data, row), prices, settings);
  });
}

/**
 * Säljaren väljer produkt i en valgrupp (t.ex. golv.sockel eller malning.vaggfarg). Raden räknas om från prislistan;
 * radnycklarna är oförändrade, så säljarens ändringar av mängd och pris ligger kvar.
 */
export function selectSlotProduct(data: KalkylData, rowId: string, slot: string, code: string, prices: PriceIndex, settings: KalkylSettings): KalkylData {
  if (!isSelectableSlot(slot) || !code) return data;
  const target = (data.rows ?? []).find(r => r.id === rowId);
  if (!target?.input || !slot.startsWith(`${target.trade}.`)) return data;
  return mapRow(data, rowId, row => {
    const input = row.input as GolvInput | MalningInput;
    const next: KalkylRow = { ...row, input: { ...input, selections: { ...(input.selections ?? {}), [slot]: code } } };
    return computeRow(next, roomOf(data, row), prices, settings);
  });
}

export function updateRowMeta(data: KalkylData, rowId: string, patch: { title?: string; note?: string }): KalkylData {
  return mapRow(data, rowId, row => ({
    ...row,
    ...(patch.title != null ? { title: patch.title.trim() || row.title } : {}),
    ...(patch.note != null ? { note: patch.note } : {}),
  }));
}

/** Märker raden som tillval (true) eller som en del av offerten (false). false tar bort fältet, så raden blir som förut. */
export function setRowOptional(data: KalkylData, rowId: string, optional: boolean): KalkylData {
  const target = (data.rows ?? []).find(r => r.id === rowId);
  if (!target || (target.optional === true) === optional) return data;
  return mapRow(data, rowId, row => {
    const next = { ...row };
    if (optional) next.optional = true; else delete next.optional;
    return next;
  });
}

/** Sätter eller tar bort (null) säljarens ändring av mängd eller à-pris för en beräknad rad. */
export function setOverride(data: KalkylData, rowId: string, key: string, override: KalkylOverride | null): KalkylData {
  return mapRow(data, rowId, row => {
    const overrides = { ...(row.overrides ?? {}) };
    const clean: KalkylOverride = {};
    if (override?.qty != null && Number.isFinite(Number(override.qty))) clean.qty = round2(Math.max(0, Number(override.qty)));
    if (override?.unit_price != null && Number.isFinite(Number(override.unit_price))) clean.unit_price = round2(Number(override.unit_price));
    if (override?.removed) clean.removed = true;
    if (!override || Object.keys(clean).length === 0) delete overrides[key];
    else overrides[key] = clean;
    const next = { ...row };
    if (Object.keys(overrides).length) next.overrides = overrides; else delete next.overrides;
    return next;
  });
}

export function duplicateRow(data: KalkylData, rowId: string): KalkylData {
  const rows = data.rows ?? [];
  const i = rows.findIndex(r => r.id === rowId);
  if (i < 0) return data;
  const src = rows[i];
  const copy: KalkylRow = JSON.parse(JSON.stringify(src));
  copy.id = newId('rad_');
  copy.lines = copy.lines.map(l => (copy.trade === 'fri' ? { ...l, key: newId('fri.') } : l.key.startsWith(OWN_LINE_PREFIX) ? { ...l, key: newId(OWN_LINE_PREFIX) } : l));
  return { ...data, rows: [...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)] };
}

export function moveRow(data: KalkylData, rowId: string, dir: 'up' | 'down'): KalkylData {
  const rows = (data.rows ?? []).slice();
  const i = rows.findIndex(r => r.id === rowId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return data;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  return { ...data, rows };
}

export function removeRow(data: KalkylData, rowId: string): KalkylData {
  const rows = (data.rows ?? []).filter(r => r.id !== rowId);
  return rows.length === (data.rows ?? []).length ? data : { ...data, rows };
}

// ── Fria rader ──────────────────────────────────────────────────────────────

export interface FriLineInput {
  description: string;
  qty: number;
  unit: string;
  /** À-pris ex moms. null = pris saknas (belopp 0, flaggas). */
  unit_price: number | null;
  rot_class: RotClass;
  code?: string | null;
}

function friLine(key: string, input: FriLineInput, base?: KalkylLine): KalkylLine {
  const qty = round2(Math.max(0, num(input.qty)));
  const unit_price = input.unit_price == null || !Number.isFinite(Number(input.unit_price)) ? null : round2(Number(input.unit_price));
  const line: KalkylLine = {
    ...(base ?? {}),
    key,
    code: input.code ?? null,
    description: input.description.trim() || 'Rad',
    rot_class: input.rot_class,
    qty,
    unit: input.unit.trim() || 'st',
    unit_price,
    amount: unit_price == null ? 0 : round2(qty * unit_price),
  };
  // Reserv när prisraden inte finns: kostnad och timmar skalas med mängden. Gick det inte (mängd 0) är de okända.
  if (base) {
    if (base.cost != null) line.cost = base.qty > 0 ? round2((base.cost / base.qty) * qty) : qty === 0 ? 0 : null;
    if (base.hours != null) line.hours = base.qty > 0 ? round2((base.hours / base.qty) * qty) : qty === 0 ? 0 : null;
  } else line.cost = null;
  return line;
}

/** Kostnad och timmar från prisraden för en mängd (null när prisraden saknar värdet). */
function costFromItem(item: PriceItem, qty: number): Pick<KalkylLine, 'cost' | 'hours'> {
  return {
    cost: item.cost_ex_vat == null ? null : round2(qty * Number(item.cost_ex_vat)),
    hours: item.hours_per_unit == null ? null : round2(qty * Number(item.hours_per_unit)),
  };
}

/** En rad från prislistan som fri rad eller gemensam rad (priset kommer alltid från prislistan). */
export function lineFromPriceItem(item: PriceItem, qty: number, key: string): KalkylLine {
  return priceLine(key, { [item.code]: item }, item.code, qty, { description: item.name, unit: item.unit, rot_class: item.rot_class },
    item.spec ? item.spec : undefined);
}

/**
 * Lägger till en rad i en fri rad, eller som egen rad (nyckel "egen.") i en golv- eller målningsrad.
 * Egna rader följer med när receptet räknas om.
 */
export function addFriLine(data: KalkylData, rowId: string, line: FriLineInput | PriceItem, qty = 1): KalkylData {
  return mapRow(data, rowId, row => {
    const key = row.trade === 'fri' ? newId('fri.') : newId(OWN_LINE_PREFIX);
    const next = isPriceItem(line) ? lineFromPriceItem(line, qty, key) : friLine(key, line);
    return { ...row, lines: [...row.lines, next] };
  });
}

/**
 * Ändrar en fri rad eller egen rad. Har raden prislistekod räknas kostnad och timmar om från prisraden;
 * skalning med mängden används bara som reserv när koden inte finns kvar i prislistan.
 */
export function updateFriLine(data: KalkylData, rowId: string, key: string, patch: Partial<FriLineInput>, prices: PriceIndex = {}): KalkylData {
  return mapRow(data, rowId, row => {
    if (row.trade !== 'fri' && !key.startsWith(OWN_LINE_PREFIX)) return row;
    return {
      ...row,
      lines: row.lines.map(l => {
        if (l.key !== key) return l;
        const merged: FriLineInput = {
          description: patch.description ?? l.description,
          qty: patch.qty ?? l.qty,
          unit: patch.unit ?? l.unit,
          unit_price: 'unit_price' in patch ? patch.unit_price ?? null : l.unit_price,
          rot_class: patch.rot_class ?? l.rot_class,
          code: l.code,
        };
        // Ändrat pris på en prislisterad rad räknas som manuellt.
        const priceChanged = 'unit_price' in patch && patch.unit_price !== l.unit_price;
        const out = friLine(key, merged, l);
        const item = l.code ? prices[l.code] : undefined;
        if (item) Object.assign(out, costFromItem(item, out.qty));
        if (l.code && (priceChanged || l.manual)) out.manual = true;
        return out;
      }),
    };
  });
}

export function removeFriLine(data: KalkylData, rowId: string, key: string): KalkylData {
  return mapRow(data, rowId, row => (row.trade === 'fri' || key.startsWith(OWN_LINE_PREFIX)
    ? { ...row, lines: row.lines.filter(l => l.key !== key) } : row));
}

// ── Gemensamt, justeringar, favoriter ───────────────────────────────────────

export function isPriceItem(v: unknown): v is PriceItem {
  return !!v && typeof v === 'object' && 'trade' in v && 'code' in v && 'kind' in v;
}

export function addCommonLine(data: KalkylData, lineOrPriceItem: FriLineInput | PriceItem): KalkylData {
  const key = newId('gem.');
  const line = isPriceItem(lineOrPriceItem) ? lineFromPriceItem(lineOrPriceItem, 1, key) : friLine(key, lineOrPriceItem);
  return { ...data, common: [...(data.common ?? []), line] };
}

export function removeCommonLine(data: KalkylData, key: string): KalkylData {
  return { ...data, common: (data.common ?? []).filter(l => l.key !== key) };
}

export function addAdjustment(data: KalkylData, adj: Omit<KalkylAdjustment, 'id'>): KalkylData {
  const a: KalkylAdjustment = { id: newId('just_'), label: adj.label.trim() || 'Justering', amount: round2(num(adj.amount)), rot_class: adj.rot_class };
  return { ...data, adjustments: [...(data.adjustments ?? []), a] };
}

export function removeAdjustment(data: KalkylData, id: string): KalkylData {
  return { ...data, adjustments: (data.adjustments ?? []).filter(a => a.id !== id) };
}

export function toggleFavorite(data: KalkylData, code: string): KalkylData {
  const favs = data.favorites ?? [];
  return { ...data, favorites: favs.includes(code) ? favs.filter(c => c !== code) : [...favs, code] };
}

// ── Prisuppdatering ─────────────────────────────────────────────────────────

/** Uppdaterar en sparad rad från prislistan och behåller mängden. Manuellt pris behålls. */
function repriceLine(line: KalkylLine, prices: PriceIndex): KalkylLine {
  const item = line.code ? prices[line.code] : undefined;
  if (!item || line.manual) return line;
  const unit_price = item.price_ex_vat == null ? null : Number(item.price_ex_vat);
  return {
    ...line,
    unit_price,
    amount: unit_price == null ? 0 : round2(line.qty * unit_price),
    ...costFromItem(item, line.qty),
    price_date: item.price_date ?? null,
    price_status: item.status ?? null,
  };
}

/**
 * Räknar om hela kalkylen med aktuell prislista och sätter priced_at. Golv och målning räknas om från receptet;
 * fria rader, egna rader (nyckel "egen.") och gemensamma rader med prislistekod får prislistans pris. Manuella behålls.
 */
export function repriceKalkyl(data: KalkylData, prices: PriceIndex, settings: KalkylSettings, now: Date | string): KalkylData {
  const rows = (data.rows ?? []).map(row => {
    if (row.trade === 'fri') return { ...row, lines: row.lines.map(l => repriceLine(l, prices)) };
    const computed = computeRow(row, roomOf(data, row), prices, settings);
    return { ...computed, lines: computed.lines.map(l => (l.key.startsWith(OWN_LINE_PREFIX) ? repriceLine(l, prices) : l)) };
  });
  const common = (data.common ?? []).map(l => repriceLine(l, prices));
  const at = typeof now === 'string' ? now : now.toISOString();
  return { ...data, rows, common, priced_at: at };
}

export interface PriceChange { code: string; name: string; old: number | null; new: number | null }

/**
 * Prisrader vars sparade à-pris skiljer sig från prislistan (en post per kod). Samma regel som kontrollen
 * pris_andrat (priceCheck.ts): rader med eget à-pris ingår inte.
 */
export function priceChanges(data: KalkylData, prices: PriceIndex): PriceChange[] {
  const out = new Map<string, PriceChange>();
  const lines = [...(data.rows ?? []).flatMap(listPricedLines), ...listPricedCommon(data)];
  const p2 = (v: number | null | undefined) => (v == null ? null : round2(Number(v)));
  for (const l of lines) {
    if (!l.code || out.has(l.code)) continue;
    const item = prices[l.code];
    if (!item || !priceDiffers(l, item)) continue;
    out.set(l.code, { code: l.code, name: item.name, old: p2(l.unit_price), new: p2(item.price_ex_vat) });
  }
  return [...out.values()];
}

/** Skillnad mindre än 0,005 räknas som oförändrat (mängd och pris visas med 2 decimaler). */
export const sameAmount = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.005);

/**
 * Säljarens ändring från formuläret för en beräknad rad. Bara det som faktiskt ändrats sparas, så att
 * mängden fortsätter följa rummets mått när säljaren bara ändrar à-priset. null = ingen ändring.
 */
export function overrideFromForm(base: Pick<KalkylLine, 'qty' | 'unit_price'>, qty: number, unitPrice: number | null): KalkylOverride | null {
  const o: KalkylOverride = {};
  if (!sameAmount(qty, base.qty)) o.qty = qty;
  if (unitPrice != null && !sameAmount(unitPrice, base.unit_price)) o.unit_price = unitPrice;
  return Object.keys(o).length ? o : null;
}

/** Sätter tillbaka en borttagen rad på sin plats (för Ångra). */
export function insertRow(data: KalkylData, row: KalkylRow, index: number): KalkylData {
  const rows = (data.rows ?? []).filter(r => r.id !== row.id);
  const i = Math.max(0, Math.min(rows.length, index));
  return { ...data, rows: [...rows.slice(0, i), row, ...rows.slice(i)] };
}
