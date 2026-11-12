// AI-kontrollen i kalkylen: underlaget till kalkyl-ai och validering/tillämpning av AI:ns förslag.
// AI:n sätter aldrig ett pris: allt som läggs till går genom de vanliga funktionerna och priset kommer från prislistan.
// Ingenting ändras i kalkylen förrän säljaren trycker; funktionerna här är rena och ger en ny KalkylData.
import type { GolvInput, GrenTrade, KalkylData, KalkylRow, KalkylSettings, Kulor, MalningInput, PriceItem, RoomDims, RotClass } from './types';
import { isGrenTrade } from './types';
import type { PriceIndex } from './prices';
import { rowLines } from './kalkyl';
import { addFriLine, addRoom, addRow, DEFAULT_ROOM_DIMS, newFriRow, newGolvRow, newMalningRow, newRoom, roomOf, selectSlotProduct, updateRowInput, updateRowMeta } from './state';
import { newGrenRow, setGrenMeasure, setGrenQty, isGrenRow } from './gren';
import { isSelectableSlot, resolveSlotCode, type SelectableSlot } from './slots';
import { GOLV_OPTION_ORDER, type GolvFlag } from './view';
import { parseKulor } from './kulorer';
import { round2 } from './packaging';
import type { AiContext, AiContextRow } from '../../../supabase/functions/kalkyl-ai/logic';

export type { AiContext, AiContextRow, AiCatalogItem, AiContextRoom, AiContextLine, KalkylAiErrorCode, KalkylAiMode } from '../../../supabase/functions/kalkyl-ai/logic';
export { KALKYL_AI_LIMITS, KALKYL_AI_ERRORS, sanitizeAiContext } from '../../../supabase/functions/kalkyl-ai/logic';

const usable = (it: PriceItem | undefined): it is PriceItem => !!it && it.status !== 'arkiverad';
const kulorText = (k: Kulor | null | undefined) => (k ? [k.system, k.code, k.name].filter(Boolean).join(' ') : null);
const nameKey = (s: string | null | undefined) => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv-SE');

// ── 1. Underlaget ─────────────────────────────────────────────────────────────

/**
 * Underlaget som skickas till AI:n. Katalogen har inga priser eller kostnader; kalkylen har inga kunduppgifter,
 * kostnader, timmar, anteckningar, prisstatus eller prisdatum. Kunduppgifterna finns inte ens som indata.
 */
export function buildAiContext(data: KalkylData, prices: PriceIndex | PriceItem[]): AiContext {
  const list = Array.isArray(prices) ? prices : Object.values(prices);
  const index: PriceIndex = Array.isArray(prices) ? Object.fromEntries(prices.map(p => [p.code, p])) : prices;
  const catalog = list.filter(usable).map(i => ({ code: i.code, trade: i.trade, kind: i.kind, slot: i.slot, name: i.name, spec: i.spec, unit: i.unit, level: i.level }));
  const rooms = (data.rooms ?? []).map(r => ({ name: r.name, ...r.dims }));
  const rows: AiContextRow[] = (data.rows ?? []).map(row => {
    const room = roomOf(data, row);
    const lines = rowLines(row).map(l => ({ description: l.description, code: l.code, qty: l.qty, unit: l.unit, unit_price: l.unit_price, rot_class: l.rot_class }));
    const base = { id: row.id, room: room?.name ?? null, title: row.title, lines, measure: null as AiContextRow['measure'] };
    if (row.trade === 'golv' && row.input) {
      const inp = row.input as GolvInput;
      const products: Record<string, string> = {};
      // Bara valgrupper som ingår i raden, annars tror AI:n att t.ex. tröskeln är vald.
      if (inp.underlag) products['golv.underlag'] = resolveSlotCode('golv.underlag', inp.selections, index);
      if (inp.sockel) products['golv.sockel'] = resolveSlotCode('golv.sockel', inp.selections, index);
      if (inp.troskel) products['golv.troskel'] = resolveSlotCode('golv.troskel', inp.selections, index);
      return { ...base, type: 'golv', gren: null, choices: {
        material_code: inp.material_code || null, material: index[inp.material_code]?.name ?? null,
        options: GOLV_OPTION_ORDER.filter(f => inp[f]), products,
      } };
    }
    if (row.trade === 'malning' && row.input) {
      const inp = row.input as MalningInput;
      const products: Record<string, string> = {};
      products['malning.vaggfarg'] = resolveSlotCode('malning.vaggfarg', inp.selections, index);
      if (inp.tak) products['malning.takfarg'] = resolveSlotCode('malning.takfarg', inp.selections, index);
      if (inp.snickerier) products['malning.snickerifarg'] = resolveSlotCode('malning.snickerifarg', inp.selections, index);
      return { ...base, type: 'malning', gren: null, choices: {
        underarbete: inp.underarbete, tak: !!inp.tak, snickerier: !!inp.snickerier, coats: inp.coats ?? 2,
        kulorer: { vagg: kulorText(inp.kulor_vagg), tak: inp.tak ? kulorText(inp.kulor_tak) : null, snickerier: inp.snickerier ? kulorText(inp.kulor_snickerier) : null },
        products,
      } };
    }
    if (isGrenRow(row)) {
      return { ...base, type: 'gren', gren: row.gren, choices: {}, measure: { area: row.measure?.area ?? null, length: row.measure?.length ?? null } };
    }
    return { ...base, type: 'fri', gren: null, choices: {} };
  });
  return { catalog, kalkyl: { premises: { ...data.premises }, rooms, rows } };
}

// ── 2. Förslaget från "Tolka" ─────────────────────────────────────────────────

export const AI_MAX_LENGTH_M = 100;
export const AI_MAX_AREA_M2 = 10_000;
export const AI_MAX_QTY = 100_000;
export const AI_MAX_ROWS = 40;
export const AI_MAX_QUESTIONS = 10;
export const AI_MISSING_DIMS_NOTE = 'Mått saknas, kontrollera rummet';

export interface AiRoomProposal { name: string; length: number | null; width: number | null; height: number | null; doors: number | null; windows: number | null }
export interface AiOwnLine { description: string; qty: number; unit: string; rot_class: RotClass }
interface AiRowBase { id: string; room: string | null; reason: string }
export interface AiGolvProposal extends AiRowBase { kind: 'golv'; room: string; material_code: string | null; options: Partial<Record<GolvFlag, boolean>>; products: Partial<Record<SelectableSlot, string>> }
export interface AiMalningProposal extends AiRowBase {
  kind: 'malning'; room: string; underarbete: MalningInput['underarbete'] | null; tak: boolean | null; snickerier: boolean | null;
  kulor_vagg: Kulor | null; kulor_tak: Kulor | null; kulor_snickerier: Kulor | null; products: Partial<Record<SelectableSlot, string>>;
}
export interface AiGrenProposal extends AiRowBase { kind: 'gren'; gren: GrenTrade; title: string; area: number | null; length: number | null; items: { code: string; qty: number }[]; own: AiOwnLine[] }
export interface AiFriProposal extends AiRowBase { kind: 'fri'; title: string; items: { code: string; qty: number }[]; own: AiOwnLine[] }
export type AiRowProposal = AiGolvProposal | AiMalningProposal | AiGrenProposal | AiFriProposal;
export interface AiProposal { rooms: AiRoomProposal[]; rows: AiRowProposal[]; questions: string[] }
export type AiProposalResult = { ok: true; proposal: AiProposal } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const finite = (v: unknown): number | null => {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
/** Längd i meter: > 0 och högst 100 m, annars null. */
const lengthM = (v: unknown): number | null => { const n = finite(v); return n != null && n > 0 && n <= AI_MAX_LENGTH_M ? round2(n) : null; };
const areaM2 = (v: unknown): number | null => { const n = finite(v); return n != null && n > 0 && n <= AI_MAX_AREA_M2 ? round2(n) : null; };
const count = (v: unknown): number | null => { const n = finite(v); return n != null && n >= 0 && n <= 50 ? Math.round(n) : null; };
/** Mängd: > 0 och rimlig. Negativ, noll eller orimlig mängd ger null (raden tas bort). */
const qtyOf = (v: unknown): number | null => { const n = finite(v); return n != null && n > 0 && n <= AI_MAX_QTY ? round2(n) : null; };
const boolN = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const ROT: RotClass[] = ['arbete', 'material', 'ovrigt'];
const UNDERARBETE = ['latt', 'normal', 'omfattande'] as const;

function products(raw: unknown, trade: 'golv' | 'malning', prices: PriceIndex): Partial<Record<SelectableSlot, string>> {
  const out: Partial<Record<SelectableSlot, string>> = {};
  if (!isObj(raw)) return out;
  for (const [slot, code] of Object.entries(raw)) {
    if (!isSelectableSlot(slot) || !slot.startsWith(`${trade}.`) || typeof code !== 'string') continue;
    const it = prices[code];
    if (usable(it) && it.slot === slot) out[slot] = code;
  }
  return out;
}

/** Prisrader: känd kod (inte arkiverad) med rimlig mängd behålls; okänd kod blir en egen rad utan pris. */
function splitItems(raw: unknown, prices: PriceIndex): { items: { code: string; qty: number }[]; own: AiOwnLine[] } {
  const items: { code: string; qty: number }[] = [];
  const own: AiOwnLine[] = [];
  if (!Array.isArray(raw)) return { items, own };
  for (const x of raw.slice(0, 40)) {
    if (!isObj(x)) continue;
    const qty = qtyOf(x.qty);
    if (qty == null) continue;
    const code = typeof x.code === 'string' ? x.code.trim() : '';
    const it = code ? prices[code] : undefined;
    if (usable(it)) { items.push({ code, qty }); continue; }
    const description = text(x.name ?? x.description, 200) || text(code, 120);
    if (!description) continue;
    const rot = ROT.includes(x.rot_class as RotClass) ? (x.rot_class as RotClass) : 'ovrigt';
    own.push({ description, qty, unit: text(x.unit, 12) || 'st', rot_class: rot });
  }
  return { items, own };
}

/**
 * Rensar AI:ns förslag mot prislistan: okända koder tas bort (golvmaterial blir "material inte valt", prisrad blir egen rad
 * utan pris), okända grenar tas bort och orimliga tal (negativa mängder, mått över 100 m) blir null eller tas bort.
 * Priser och belopp i förslaget läses aldrig.
 */
export function validateAiProposal(raw: unknown, prices: PriceIndex): AiProposalResult {
  if (!isObj(raw)) return { ok: false, error: 'AI-tjänsten gav inget förslag.' };
  if (raw.rows != null && !Array.isArray(raw.rows)) return { ok: false, error: 'AI-tjänstens förslag gick inte att läsa.' };
  if (raw.rooms != null && !Array.isArray(raw.rooms)) return { ok: false, error: 'AI-tjänstens förslag gick inte att läsa.' };
  const rooms: AiRoomProposal[] = [];
  const seen = new Set<string>();
  for (const r of (raw.rooms as unknown[] | undefined) ?? []) {
    if (!isObj(r)) continue;
    const name = text(r.name, 80);
    if (!name || seen.has(nameKey(name))) continue;
    seen.add(nameKey(name));
    rooms.push({ name, length: lengthM(r.length), width: lengthM(r.width), height: lengthM(r.height), doors: count(r.doors), windows: count(r.windows) });
    if (rooms.length >= 30) break;
  }
  const rows: AiRowProposal[] = [];
  for (const r of ((raw.rows as unknown[] | undefined) ?? []).slice(0, AI_MAX_ROWS)) {
    if (!isObj(r)) continue;
    const id = `ai${rows.length + 1}`;
    const reason = text(r.reason, 300);
    const room = text(r.room, 80) || null;
    if (r.kind === 'golv') {
      if (!room) continue;
      const mat = typeof r.material_code === 'string' ? prices[r.material_code] : undefined;
      const options: Partial<Record<GolvFlag, boolean>> = {};
      if (isObj(r.options)) for (const f of GOLV_OPTION_ORDER) { const b = boolN(r.options[f]); if (b != null) options[f] = b; }
      rows.push({ id, kind: 'golv', room, reason, material_code: usable(mat) && mat.slot === 'golv.golvtyp' ? mat.code : null, options, products: products(r.products, 'golv', prices) });
    } else if (r.kind === 'malning') {
      if (!room) continue;
      const under = UNDERARBETE.includes(r.underarbete as typeof UNDERARBETE[number]) ? (r.underarbete as MalningInput['underarbete']) : null;
      const k = (v: unknown) => (typeof v === 'string' ? parseKulor(v) : null);
      rows.push({
        id, kind: 'malning', room, reason, underarbete: under, tak: boolN(r.tak), snickerier: boolN(r.snickerier),
        kulor_vagg: k(r.kulor_vagg), kulor_tak: k(r.kulor_tak), kulor_snickerier: k(r.kulor_snickerier), products: products(r.products, 'malning', prices),
      });
    } else if (r.kind === 'gren') {
      if (!isGrenTrade(r.gren)) continue;
      const { items, own } = splitItems(r.items, prices);
      rows.push({ id, kind: 'gren', room, reason, gren: r.gren, title: text(r.title, 120), area: areaM2(r.area), length: lengthM(r.length), items, own });
    } else if (r.kind === 'fri') {
      const { items, own } = splitItems(r.lines ?? r.items, prices);
      const title = text(r.title, 120);
      if (!title && items.length === 0 && own.length === 0) continue;
      rows.push({ id, kind: 'fri', room, reason, title: title || 'Fri rad', items, own });
    }
  }
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map(q => text(q, 200)).filter(Boolean).slice(0, AI_MAX_QUESTIONS)
    : [];
  return { ok: true, proposal: { rooms, rows, questions } };
}

export type AiRowStatus = 'ny' | 'finns';

const roomByName = (data: KalkylData, name: string | null) =>
  name ? (data.rooms ?? []).find(r => nameKey(r.name) === nameKey(name)) ?? null : null;

/** Har kalkylen redan en rad av samma slag i ett rum med samma namn (utan hänsyn till versaler)? */
function existsInKalkyl(row: AiRowProposal, data: KalkylData): boolean {
  return (data.rows ?? []).some(r => {
    const room = roomOf(data, r);
    const sameRoom = row.room ? !!room && nameKey(room.name) === nameKey(row.room) : !room;
    if (!sameRoom) return false;
    if (row.kind === 'golv' || row.kind === 'malning') return r.trade === row.kind;
    if (row.kind === 'gren') return r.trade === 'fri' && r.gren === row.gren;
    return r.trade === 'fri' && !isGrenTrade(r.gren) && nameKey(r.title) === nameKey(row.title);
  });
}

/** Märker varje föreslagen rad som ny eller "Finns redan". */
export function proposalStatus(proposal: AiProposal, data: KalkylData): Record<string, AiRowStatus> {
  return Object.fromEntries(proposal.rows.map(r => [r.id, existsInKalkyl(r, data) ? 'finns' : 'ny']));
}

/** Rubriken för en föreslagen rad: "Vardagsrum · Golv". */
export function aiRowTitle(row: AiRowProposal): string {
  const type = row.kind === 'golv' ? 'Golv' : row.kind === 'malning' ? 'Målning' : row.title || 'Fri rad';
  return row.room ? `${row.room} · ${type}` : type;
}

/** Kort innehåll för en föreslagen rad. */
export function aiRowSummary(row: AiRowProposal, prices: PriceIndex): string {
  const name = (code: string) => prices[code]?.name ?? code;
  const qty = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
  if (row.kind === 'golv') {
    const opts = GOLV_OPTION_ORDER.filter(f => row.options[f]).map(f => f === 'mobelflytt' ? 'möbelflytt' : f === 'troskel' ? 'tröskel' : f);
    return [row.material_code ? name(row.material_code) : 'Material inte valt', ...opts].join(', ');
  }
  if (row.kind === 'malning') {
    const parts = ['Väggar', row.tak ? 'tak' : null, row.snickerier ? 'snickerier' : null].filter(Boolean).join(', ');
    const k = [row.kulor_vagg, row.kulor_tak, row.kulor_snickerier].filter(Boolean).map(c => `${c!.system} ${c!.code}`);
    return [parts, ...k].join(', ');
  }
  const measures = row.kind === 'gren' ? [row.area != null ? `${qty(row.area)} m²` : null, row.length != null ? `${qty(row.length)} m` : null].filter(Boolean) : [];
  const lines = [...row.items.map(i => `${name(i.code)} ${qty(i.qty)} ${prices[i.code]?.unit ?? ''}`.trim()), ...row.own.map(o => `${o.description} ${qty(o.qty)} ${o.unit}`)];
  return [...measures, ...lines].join(', ') || 'Inga rader';
}

/**
 * Lägger till en föreslagen rad med de vanliga funktionerna. Rum som saknas skapas; mått som saknas får standardmåtten
 * och raden får anteckningen "Mått saknas, kontrollera rummet". Priser kommer bara från prislistan.
 */
export function applyAiRow(data: KalkylData, row: AiRowProposal, proposal: AiProposal, prices: PriceIndex, settings: KalkylSettings): KalkylData {
  let next = data;
  let roomId: string | null = null;
  let missingDims = false;
  if (row.room) {
    const existing = roomByName(next, row.room);
    if (existing) roomId = existing.id;
    else {
      const p = proposal.rooms.find(r => nameKey(r.name) === nameKey(row.room));
      const dims: Partial<RoomDims> = {};
      for (const k of ['length', 'width', 'height', 'doors', 'windows'] as const) dims[k] = p?.[k] ?? DEFAULT_ROOM_DIMS[k];
      missingDims = !p || p.length == null || p.width == null || p.height == null;
      const room = newRoom(row.room, dims);
      next = addRoom(next, room);
      roomId = room.id;
    }
  }
  const room = roomId ? (next.rooms ?? []).find(r => r.id === roomId) ?? null : null;
  let krow: KalkylRow;
  if (row.kind === 'golv') {
    if (!roomId) return data;
    krow = newGolvRow(roomId, row.material_code ?? '');
    next = addRow(next, krow, prices, settings);
    if (Object.keys(row.options).length) next = updateRowInput(next, krow.id, row.options, prices, settings);
    for (const [slot, code] of Object.entries(row.products)) next = selectSlotProduct(next, krow.id, slot, code!, prices, settings);
  } else if (row.kind === 'malning') {
    if (!roomId) return data;
    krow = newMalningRow(roomId);
    next = addRow(next, krow, prices, settings);
    const patch: Partial<MalningInput> = {};
    if (row.underarbete) patch.underarbete = row.underarbete;
    if (row.tak != null) patch.tak = row.tak;
    if (row.snickerier != null) patch.snickerier = row.snickerier;
    if (row.kulor_vagg) patch.kulor_vagg = row.kulor_vagg;
    if (row.kulor_tak) patch.kulor_tak = row.kulor_tak;
    if (row.kulor_snickerier) patch.kulor_snickerier = row.kulor_snickerier;
    if (Object.keys(patch).length) next = updateRowInput(next, krow.id, patch, prices, settings);
    for (const [slot, code] of Object.entries(row.products)) next = selectSlotProduct(next, krow.id, slot, code!, prices, settings);
  } else if (row.kind === 'gren') {
    // Rum med standardmått ska inte föreslå yta; då gäller bara måtten i förslaget.
    krow = newGrenRow(roomId, row.gren, row.title, missingDims ? null : room);
    next = addRow(next, krow, prices, settings);
    if (row.area != null || row.length != null) next = setGrenMeasure(next, krow.id, { ...(row.area != null ? { area: row.area } : {}), ...(row.length != null ? { length: row.length } : {}) });
    for (const it of row.items) {
      const item = prices[it.code];
      if (!usable(item)) continue;
      next = item.trade === row.gren ? setGrenQty(next, krow.id, item, it.qty, prices) : addFriLine(next, krow.id, item, it.qty);
    }
    for (const o of row.own) next = addFriLine(next, krow.id, { ...o, unit_price: null });
  } else {
    krow = newFriRow(roomId, row.title);
    next = addRow(next, krow, prices, settings);
    for (const it of row.items) { const item = prices[it.code]; if (usable(item)) next = addFriLine(next, krow.id, item, it.qty); }
    for (const o of row.own) next = addFriLine(next, krow.id, { ...o, unit_price: null });
  }
  if (missingDims) next = updateRowMeta(next, krow.id, { note: AI_MISSING_DIMS_NOTE });
  return next;
}

// ── 3. Granskningen ───────────────────────────────────────────────────────────

export const AI_MAX_OBSERVATIONS = 8;
export type AiSuggestion = { type: 'add_line'; code: string; qty: number } | { type: 'open_row' };
export interface AiObservation { id: string; title: string; text: string; row_id: string; suggestion: AiSuggestion | null }

/** Behåller bara iakttagelser som pekar på en rad som finns, och förslag vars kod finns i prislistan och inte är arkiverad. */
export function validateAiReview(raw: unknown, data: KalkylData, prices: PriceIndex): AiObservation[] {
  if (!isObj(raw) || !Array.isArray(raw.observations)) return [];
  const rowIds = new Set((data.rows ?? []).map(r => r.id));
  const out: AiObservation[] = [];
  for (const o of raw.observations) {
    if (out.length >= AI_MAX_OBSERVATIONS) break;
    if (!isObj(o)) continue;
    const title = text(o.title, 120);
    const body = text(o.text, 500);
    const rowId = typeof o.row_id === 'string' ? o.row_id : '';
    if (!title || !rowIds.has(rowId)) continue;
    let suggestion: AiSuggestion | null = null;
    const s = o.suggestion;
    if (isObj(s) && s.type === 'add_line' && typeof s.code === 'string' && usable(prices[s.code])) {
      const qty = qtyOf(s.qty);
      if (qty != null) suggestion = { type: 'add_line', code: s.code, qty };
    } else if (isObj(s) && s.type === 'open_row') suggestion = { type: 'open_row' };
    out.push({ id: `obs${out.length + 1}`, title, text: body, row_id: rowId, suggestion });
  }
  return out;
}

/** "Lägg till" på en iakttagelse: prisraden läggs till i raden med prislistans pris (grenens lista när grenen stämmer). */
export function applyAiSuggestion(data: KalkylData, obs: AiObservation, prices: PriceIndex): KalkylData {
  if (obs.suggestion?.type !== 'add_line') return data;
  const item = prices[obs.suggestion.code];
  const row = (data.rows ?? []).find(r => r.id === obs.row_id);
  if (!usable(item) || !row) return data;
  if (isGrenRow(row) && item.trade === row.gren) return setGrenQty(data, row.id, item, obs.suggestion.qty, prices);
  return addFriLine(data, row.id, item, obs.suggestion.qty);
}

// ── 4. Frågan och bilagorna ───────────────────────────────────────────────────

/** Svaret på en fråga: trimmad text, högst 2 000 tecken. Tomt svar ger null. */
export function validateAiAnswer(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
  return s || null;
}

/** Storlek för nedskalning: längsta sidan högst max px, aldrig uppskalning. */
export function scaledSize(width: number, height: number, max = 1600): { width: number; height: number } {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const f = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)) };
}

/** Personnummer i fri text: ÅÅMMDD-NNNN (med - eller +) eller ÅÅÅÅMMDD(-)NNNN. Ett mobilnummer utan bindestreck räknas inte. */
const PNR_RE = /\b(?:(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-?\d{4}|\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-+]\d{4})\b/;

export interface CustomerFields { customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null; customer_address?: string | null; customer_personnummer?: string | null; fastighetsbeteckning?: string | null }

/**
 * Hittar kunduppgifter i en text som ska till AI:n: personnummer och offertens egna kunduppgifter.
 * Ger etiketterna som hittades; tom lista betyder att texten får skickas.
 */
export function findCustomerData(textIn: string, customer: CustomerFields): string[] {
  const t = nameKey(textIn);
  const digits = textIn.replace(/\D/g, '');
  const found: string[] = [];
  if (PNR_RE.test(textIn) || (customer.customer_personnummer && digits.includes(customer.customer_personnummer.replace(/\D/g, '').slice(-10)) && customer.customer_personnummer.replace(/\D/g, '').length >= 10)) found.push('personnummer');
  const has = (v: string | null | undefined, min = 4) => !!v && nameKey(v).length >= min && t.includes(nameKey(v));
  if (has(customer.customer_name)) found.push('kundens namn');
  if (has(customer.customer_address, 6)) found.push('adress');
  if (has(customer.customer_email)) found.push('e-post');
  const phone = (customer.customer_phone ?? '').replace(/\D/g, '');
  if (phone.length >= 7 && digits.includes(phone)) found.push('telefon');
  if (has(customer.fastighetsbeteckning)) found.push('fastighetsbeteckning');
  return found;
}


// ── 5. Texter för fel ─────────────────────────────────────────────────────────

export const AI_TEXT = {
  failed: 'AI-tjänsten svarade inte. Försök igen.',
  limit: 'Dagens gräns för AI-anrop är nådd.',
  empty: 'Inga förslag. Skriv mer i anteckningen eller lägg till ett foto.',
} as const;

/** Texten som visas för ett fel från kalkyl-ai. Tjänstefel och okända fel ger samma uppmaning att försöka igen. */
export function aiErrorText(code: string | null | undefined, message?: string | null): string {
  if (code === 'limit') return AI_TEXT.limit;
  if (!code || code === 'gateway' || code === 'invalid_reply' || code === 'busy' || code === 'configuration') return AI_TEXT.failed;
  return message?.trim() || AI_TEXT.failed;
}

/** Kontroll av en vald UE-offert: bara PDF, högst 10 MB och inte tom. Null = går att skicka. */
export function aiPdfError(file: { size: number; type: string; name: string }): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'UE-offerten måste vara en PDF.';
  if (file.size <= 0) return 'UE-offerten är tom.';
  if (file.size > 10 * 1024 * 1024) return 'UE-offerten får vara högst 10 MB.';
  return null;
}
