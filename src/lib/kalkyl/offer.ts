// Kalkyl → offert. Summor går alltid genom toOfferLineItems + calcOfferTotals, så att
// kalkylvy, offertformulär, PDF och kundsida visar samma tal.
import { calcOfferTotals, type OfferCalcOptions, type OfferLineItem, type OfferTotals } from '@/lib/offerCalc';
import type { GolvInput, KalkylData, KalkylRoom, KalkylRow, KalkylSettings, MalningInput, PriceItem } from './types';
import type { PriceIndex } from './prices';
import { toOfferLineItems } from './lineItems';
import { floorArea, wallArea } from './geometry';
import { GOLV_CODES } from './recipes/golv';
import { resolveSlotItem, type SelectableSlot } from './slots';
import { wallCoats } from './recipes/malning';
import { fmtQty } from './lines';
import { roomOf } from './state';

export const CALC_VERSION = 1;

export type KalkylOfferOptions = OfferCalcOptions;

export interface KalkylOfferPayload {
  line_items: OfferLineItem[];
  calc_data: KalkylData;
  calc_version: 1;
  total_ex_vat: number;
  total_vat: number;
  total_incl_vat: number;
  rot_base: number;
  rot_amount: number;
  total_after_rot: number;
}

/** Alla offerttotaler för kalkylen (samma väg som offertformuläret). */
export function kalkylTotals(data: KalkylData, opts: KalkylOfferOptions): OfferTotals {
  return calcOfferTotals(toOfferLineItems(data), opts);
}

export function buildOfferPayloadFromKalkyl(data: KalkylData, opts: KalkylOfferOptions): KalkylOfferPayload {
  const line_items = toOfferLineItems(data);
  const t = calcOfferTotals(line_items, opts);
  return {
    line_items,
    calc_data: data,
    calc_version: CALC_VERSION,
    total_ex_vat: t.total_ex_vat,
    total_vat: t.total_vat,
    total_incl_vat: t.total_incl_vat,
    rot_base: t.rot_base,
    rot_amount: t.rot_amount,
    total_after_rot: t.total_after_rot,
  };
}

// ── Texter ──────────────────────────────────────────────────────────────────

/** "A", "A och B", "A, B och C". */
export function joinSv(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p[0] ?? '';
  return `${p.slice(0, -1).join(', ')} och ${p[p.length - 1]}`;
}

const lowerFirst = (s: string) => (s ? s[0].toLocaleLowerCase('sv-SE') + s.slice(1) : s);
const upperFirst = (s: string) => (s ? s[0].toLocaleUpperCase('sv-SE') + s.slice(1) : s);

const TRADE_WORD: Record<'golv' | 'malning', string> = { golv: 'golv', malning: 'målning' };

/** T.ex. "Golv och målning, Vardagsrum och Hall". */
export function defaultOfferTitle(data: KalkylData): string {
  const rows = data.rows ?? [];
  const trades: string[] = [];
  const rooms: string[] = [];
  for (const r of rows) {
    const word = r.trade === 'fri' ? lowerFirst(r.title) : TRADE_WORD[r.trade];
    if (word && !trades.includes(word)) trades.push(word);
    const room = roomOf(data, r);
    if (room && !rooms.includes(room.name)) rooms.push(room.name);
  }
  if (!trades.length) return 'Offert';
  const head = upperFirst(joinSv(trades));
  return rooms.length ? `${head}, ${joinSv(rooms)}` : head;
}

/** Kort namn för kundtext: "Bortforsling, container" → "bortforsling". */
const shortName = (name: string) => name.split(',')[0].trim();
const PLURAL_FIRST: Record<string, string> = { 'Tröskel': 'Trösklar', 'Sockellist': 'Sockellister', 'tröskel': 'trösklar', 'sockellist': 'sockellister' };
const pluralize = (name: string, count: number) => {
  if (count <= 1) return name;
  const [first, ...rest] = name.split(' ');
  return PLURAL_FIRST[first] ? [PLURAL_FIRST[first], ...rest].join(' ') : name;
};
const colorTag = (item?: PriceItem) =>
  item?.color_code ? ` (${item.color_system ?? (item.color_code.startsWith('RAL') ? '' : 'NCS')} ${item.color_code})`.replace('( ', '(') : '';

const m2 = (v: number) => `${fmtQty(v)} m²`;

function golvExtras(row: KalkylRow, room: KalkylRoom | null, prices: PriceIndex): string[] {
  const inp = row.input as GolvInput;
  const doors = room ? Math.max(0, Math.floor(Number(room.dims.doors) || 0)) : 0;
  const it = (code: string) => prices[code];
  const named = (code: string, fallback: string) => shortName(it(code)?.name ?? fallback);
  // Tillbehör med valgrupp: den valda produktens namn och kulör.
  const chosen = (slot: SelectableSlot) => resolveSlotItem(slot, inp.selections, prices);
  const chosenName = (slot: SelectableSlot, fallback: string) => shortName(chosen(slot)?.name ?? fallback);
  const out: string[] = [];
  if (inp.rivning) out.push(named(GOLV_CODES.rivning, 'Rivning befintligt golv'));
  if (inp.flytspackling) out.push(named(GOLV_CODES.flytspackling, 'Flytspackling'));
  if (inp.underlag) out.push(chosenName('golv.underlag', 'Underlag'));
  if (inp.sockel) out.push(chosenName('golv.sockel', 'Sockellist') + colorTag(chosen('golv.sockel')));
  if (inp.troskel && doors > 0) out.push(pluralize(chosenName('golv.troskel', 'Tröskel'), doors));
  if (inp.mobelflytt) out.push(named(GOLV_CODES.mobelflytt, 'Möbelflytt'));
  if (inp.bortforsling) out.push(named(GOLV_CODES.bortforsling, 'Bortforsling'));
  return out;
}

/** "NCS S 0502-Y" eller "RAL 9010". */
const kulorText = (k: MalningInput['kulor_vagg']) => (k ? `${k.system} ${k.code}`.replace('RAL RAL', 'RAL') : null);

/** Vald färgprodukt för kundtext: "Väggfärg Matt 7". */
function paintName(inp: MalningInput, slot: SelectableSlot, prices: PriceIndex): string | null {
  const it = resolveSlotItem(slot, inp.selections, prices);
  return it ? `${it.name}${it.spec ? ` ${it.spec}` : ''}` : null;
}

const UNDERARBETE_WORD: Record<MalningInput['underarbete'], string> = { latt: 'lätt', normal: 'normalt', omfattande: 'omfattande' };

function rowScope(row: KalkylRow, data: KalkylData, prices: PriceIndex, settings: KalkylSettings): string {
  const room = roomOf(data, row);
  const head = room ? `${room.name} – ${row.title}` : row.title;
  if (row.trade === 'golv' && row.input) {
    const inp = row.input as GolvInput;
    const mat = prices[inp.material_code];
    const matText = mat ? `${mat.name}${mat.spec ? ` ${mat.spec}` : ''}` : 'Golvmaterial';
    const area = room ? `, ${m2(floorArea(room.dims))}` : '';
    const extras = golvExtras(row, room, prices);
    const tail = extras.length ? ` ${upperFirst([extras[0], ...extras.slice(1).map(lowerFirst)].join(', '))}.` : '';
    return `${head}: ${matText}${area}.${tail}`;
  }
  if (row.trade === 'malning' && row.input) {
    const inp = row.input as MalningInput;
    const parts: string[] = [];
    const walls = room ? ` ${m2(wallArea(room.dims, settings))}` : '';
    const paren = (parts: (string | null)[]) => { const p = parts.filter(Boolean); return p.length ? ` (${p.join(', ')})` : ''; };
    parts.push(`väggar${walls}${paren([`${wallCoats(inp)} strykningar`, paintName(inp, 'malning.vaggfarg', prices), kulorText(inp.kulor_vagg)])}`);
    if (inp.tak) parts.push(`tak${room ? ` ${m2(floorArea(room.dims))}` : ''}${paren([paintName(inp, 'malning.takfarg', prices), kulorText(inp.kulor_tak)])}`);
    if (inp.snickerier) parts.push(`foder och socklar${paren([paintName(inp, 'malning.snickerifarg', prices), kulorText(inp.kulor_snickerier)])}`);
    return `${head}: ${upperFirst(joinSv(parts))}. Underarbete ${UNDERARBETE_WORD[inp.underarbete] ?? 'normalt'}.`;
  }
  const names = [...new Set((row.lines ?? []).map(l => l.description))];
  return names.length ? `${head}: ${upperFirst(names.map((n, i) => (i ? lowerFirst(n) : n)).join(', '))}.` : `${head}.`;
}

/** Kundtext för offertens beskrivning, en rad per kalkylrad och en för gemensamt. */
export function offerScopeText(data: KalkylData, prices: PriceIndex = {}, settings?: KalkylSettings): string {
  const s = settings ?? { margin_target_pct: 25, price_max_age_days: 60, door_width_m: 0.9, door_height_m: 2.1, window_width_m: 1.2, window_height_m: 1.3 };
  const lines = (data.rows ?? []).map(r => rowScope(r, data, prices, s));
  const common = [...new Set((data.common ?? []).map(l => l.description))];
  if (common.length) lines.push(`Gemensamt: ${common.join(', ')}.`);
  return lines.join('\n');
}

/** Kort rad för översikten. */
export function rowSpecText(row: KalkylRow, prices: PriceIndex): string {
  if (row.trade === 'golv' && row.input) {
    const inp = row.input as GolvInput;
    const mat = prices[inp.material_code];
    const chosen = (slot: SelectableSlot, fallback: string) => lowerFirst(shortName(resolveSlotItem(slot, inp.selections, prices)?.name ?? fallback));
    const sockel = resolveSlotItem('golv.sockel', inp.selections, prices);
    const extras = [inp.underlag && chosen('golv.underlag', 'underlag'), inp.sockel && `${chosen('golv.sockel', 'sockel')}${colorTag(sockel)}`,
      inp.troskel && pluralize(chosen('golv.troskel', 'tröskel'), 2), inp.rivning && 'rivning',
      inp.flytspackling && 'flytspackling', inp.mobelflytt && 'möbelflytt', inp.bortforsling && 'bortforsling'].filter(Boolean) as string[];
    return [mat ? `${mat.name}${mat.spec ? `, ${mat.spec}` : ''}` : 'Golvmaterial saknas', inp.direction === 'tvars' ? 'tvärs' : 'längs', ...extras].join(' · ');
  }
  if (row.trade === 'malning' && row.input) {
    const inp = row.input as MalningInput;
    const paint = (slot: SelectableSlot) => { const n = paintName(inp, slot, prices); return n ? ` (${n})` : ''; };
    return [
      `Väggar ${inp.kulor_vagg?.code ?? 'kulör ej vald'}${paint('malning.vaggfarg')}`,
      `${wallCoats(inp)} strykningar`,
      inp.tak ? `${`tak ${inp.kulor_tak?.code ?? ''}`.trim()}${paint('malning.takfarg')}` : null,
      inp.snickerier ? `snickerier${inp.kulor_snickerier?.code ? ` ${inp.kulor_snickerier.code}` : ''}${paint('malning.snickerifarg')}` : null,
      `${UNDERARBETE_WORD[inp.underarbete] ?? 'normalt'} underarbete`,
    ].filter(Boolean).join(' · ');
  }
  const names = [...new Set((row.lines ?? []).map(l => l.description))];
  return names.length ? names.join(', ') : 'Inga rader ännu';
}

/** Mängd för översikten: golvyta, eller väggyta + takyta för målning. */
export function rowQuantityLabel(row: KalkylRow, room: KalkylRoom | null | undefined, settings: KalkylSettings): string {
  if (!room) return row.trade === 'fri' ? `${row.lines.length} ${row.lines.length === 1 ? 'rad' : 'rader'}` : '';
  if (row.trade === 'golv') return m2(floorArea(room.dims));
  if (row.trade === 'malning') {
    const inp = row.input as MalningInput | null;
    const walls = wallArea(room.dims, settings);
    return inp?.tak ? `${fmtQty(walls)} + ${m2(floorArea(room.dims))}` : m2(walls);
  }
  return `${row.lines.length} ${row.lines.length === 1 ? 'rad' : 'rader'}`;
}
