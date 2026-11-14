// Kundvyn: det kunden ska se för en kalkyloffert, rum för rum, och ingenting annat.
// Typerna och saneringen ligger i supabase/functions/_shared/customerView.ts (delas med public-offer).
// Alla belopp är exklusive moms, som i line_items.
import type { OfferTotals } from '@/lib/offerCalc';
import type {
  CustomerColor, CustomerCommonLine, CustomerItem, CustomerSection, CustomerSwatch, CustomerTotals, CustomerView,
} from '../../../supabase/functions/_shared/customerView';
import type { GolvInput, KalkylData, KalkylRow, KalkylSettings, Kulor, MalningInput, PriceItem, RotClass } from './types';
import type { PriceIndex } from './prices';
import type { KalkylOfferOptions } from './offer';
import { offerScopeText, rowScopeText } from './offer';
import { toOfferLineItems } from './lineItems';
import { adjustmentLines, applyOverrides, includedRows, optionalRows, optionTotals, rowLines } from './kalkyl';
import { floorArea, wallArea } from './geometry';
import { fmtQty } from './lines';
import { round2 } from './packaging';
import { roomOf } from './state';
import { resolveSlotItem, type SelectableSlot } from './slots';
import { wallCoats } from './recipes/malning';
import { isGrenRow, rowTypeLabel } from './gren';
import { KIND_LABEL } from './priceList';

export type {
  CustomerColor, CustomerCommonLine, CustomerItem, CustomerSection, CustomerSwatch, CustomerTotals, CustomerView,
  PublicCustomerItem, PublicCustomerSection, PublicCustomerView,
} from '../../../supabase/functions/_shared/customerView';
export { CUSTOMER_VIEW_KEYS, CUSTOMER_VIEW_LIMITS, sanitizeCustomerView } from '../../../supabase/functions/_shared/customerView';

export const CUSTOMER_VIEW_VERSION = 1;
/** Högst så många valbrickor från en grenrad eller fri rad. */
export const CUSTOMER_FREE_ITEMS = 6;

const m2 = (v: number) => `${fmtQty(v)} m²`;

/** Säljarens egen beskrivning, eller null när den är tom eller är den automatiska texten från offerScopeText. */
export function customerIntro(description: string | null | undefined, data: KalkylData, prices: PriceIndex, settings: KalkylSettings): string | null {
  const d = (description ?? '').trim();
  if (!d) return null;
  return d === offerScopeText(data, prices, settings).trim() ? null : d;
}

/** Sparad kundvy med intro null: beskrivningen på offerten är automatisk och visas tom i kalkylens offertuppgifter. */
export function isAutoDescription(customerView: unknown): boolean {
  const v = customerView as { version?: unknown; intro?: unknown } | null | undefined;
  return !!v && typeof v === 'object' && v.version === 1 && v.intro == null;
}

/**
 * Offertformuläret ändrar beskrivningen på en kalkyloffert: kundvyns intro följer med så att kundsidan visar samma text.
 * Oförändrad beskrivning behåller den sparade intron. Ingen kundvy (eller okänd version) ger undefined, alltså inget fält.
 */
export function customerViewWithFormIntro(customerView: unknown, savedDescription: string | null | undefined, formDescription: string | null | undefined): Record<string, unknown> | undefined {
  const v = customerView as Record<string, unknown> | null | undefined;
  if (!v || typeof v !== 'object' || v.version !== 1) return undefined;
  const form = (formDescription ?? '').trim();
  const changed = form !== (savedDescription ?? '').trim();
  return { ...v, intro: changed ? form || null : v.intro ?? null };
}

const swatchOf = (it: Pick<PriceItem, 'swatch'>): CustomerSwatch | null => {
  const s = it.swatch;
  if (!s || typeof s.color !== 'string' || !s.color) return null;
  const out: CustomerSwatch = { color: s.color };
  if (typeof s.line === 'string' && s.line) out.line = s.line;
  if (typeof s.pattern === 'string' && s.pattern) out.pattern = s.pattern;
  if (typeof s.step === 'number' && Number.isFinite(s.step)) out.step = s.step;
  return out;
};

const itemColor = (it: PriceItem): CustomerColor | null =>
  it.color_code ? { system: it.color_system ?? null, code: it.color_code, name: null, hex: it.color_hex ?? null } : null;

const kulorColor = (k: Kulor | null | undefined): CustomerColor | null =>
  k?.code ? { system: k.system ?? null, code: k.code, name: k.name ?? null, hex: k.hex ?? null } : null;

function tile(label: string, it: PriceItem, color: CustomerColor | null = itemColor(it)): CustomerItem {
  return { label, name: it.name, detail: it.spec ?? null, color, swatch: swatchOf(it), image_path: it.image_path ?? null };
}

function golvItems(row: KalkylRow, data: KalkylData, prices: PriceIndex): CustomerItem[] {
  const inp = row.input as GolvInput;
  const room = roomOf(data, row);
  const doors = room ? Math.max(0, Math.floor(Number(room.dims.doors) || 0)) : 0;
  const slot = (s: SelectableSlot) => resolveSlotItem(s, inp.selections, prices);
  const out: CustomerItem[] = [];
  const mat = prices[inp.material_code];
  if (mat) out.push(tile('Golv', mat));
  const underlag = inp.underlag ? slot('golv.underlag') : undefined;
  if (underlag) out.push(tile('Underlag', underlag));
  const sockel = inp.sockel ? slot('golv.sockel') : undefined;
  if (sockel) out.push(tile('Sockel', sockel));
  const troskel = inp.troskel && doors > 0 ? slot('golv.troskel') : undefined;
  if (troskel) out.push(tile('Tröskel', troskel));
  return out;
}

function malningItems(row: KalkylRow, prices: PriceIndex): CustomerItem[] {
  const inp = row.input as MalningInput;
  const out: CustomerItem[] = [];
  const add = (label: string, s: SelectableSlot, k: Kulor | null | undefined) => {
    const it = resolveSlotItem(s, inp.selections, prices);
    if (it) out.push(tile(label, it, kulorColor(k)));
    else if (k?.code) out.push({ label, name: k.name || `${k.system} ${k.code}`, detail: null, color: kulorColor(k), swatch: null, image_path: null });
  };
  add('Väggar', 'malning.vaggfarg', inp.kulor_vagg);
  if (inp.tak) add('Tak', 'malning.takfarg', inp.kulor_tak);
  if (inp.snickerier) add('Snickerier', 'malning.snickerifarg', inp.kulor_snickerier);
  return out;
}

/** Grenrad och fri rad: gällande rader med material eller tillbehör från prislistan, en per kod, högst sex. */
function freeItems(row: KalkylRow, prices: PriceIndex): CustomerItem[] {
  const out: CustomerItem[] = [];
  const seen = new Set<string>();
  for (const l of rowLines(row)) {
    const it = l.code ? prices[l.code] : undefined;
    if (!it || (it.kind !== 'material' && it.kind !== 'tillbehor') || seen.has(it.code)) continue;
    seen.add(it.code);
    out.push(tile(KIND_LABEL[it.kind], it));
    if (out.length >= CUSTOMER_FREE_ITEMS) break;
  }
  return out;
}

function rowFacts(row: KalkylRow, data: KalkylData, settings: KalkylSettings): string[] {
  const room = roomOf(data, row);
  if (row.trade === 'golv') return room ? [m2(floorArea(room.dims))] : [];
  if (row.trade === 'malning' && row.input) {
    const inp = row.input as MalningInput;
    const out: string[] = [];
    if (room) out.push(`Väggar ${m2(wallArea(room.dims, settings))}`);
    if (room && inp.tak) out.push(`Tak ${m2(floorArea(room.dims))}`);
    out.push(`${wallCoats(inp)} strykningar`);
    return out;
  }
  if (isGrenRow(row)) {
    const out: string[] = [];
    const area = Number(row.measure?.area);
    const length = Number(row.measure?.length);
    if (Number.isFinite(area) && area > 0) out.push(m2(area));
    if (Number.isFinite(length) && length > 0) out.push(`${fmtQty(length)} m`);
    return out;
  }
  return [];
}

function rowItems(row: KalkylRow, data: KalkylData, prices: PriceIndex): CustomerItem[] {
  if (row.trade === 'golv' && row.input) return golvItems(row, data, prices);
  if (row.trade === 'malning' && row.input) return malningItems(row, prices);
  return freeItems(row, prices);
}

/** Fördelning på kalkylradens sparade klass: arbete är arbete även när ROT är avstängt på en grenrad. Tillval ingår inte. */
function savedClassTotals(data: KalkylData): CustomerTotals {
  const by: Record<RotClass, number> = { arbete: 0, material: 0, ovrigt: 0 };
  const add = (cls: RotClass, amount: unknown) => { by[cls] = (by[cls] ?? 0) + (Number(amount) || 0); };
  for (const row of includedRows(data)) for (const l of applyOverrides(row.lines ?? [], row.overrides)) add(l.rot_class, l.amount);
  for (const l of data.common ?? []) add(l.rot_class, round2(Number(l.amount) || 0));
  for (const a of adjustmentLines(data)) add(a.rot_class, a.amount);
  return { arbete_ex_vat: round2(by.arbete), material_ex_vat: round2(by.material), ovrigt_ex_vat: round2(by.ovrigt) };
}

/**
 * Kundvyn (version 1) för kalkylen. Beloppen kommer från toOfferLineItems, så att avsnitt och gemensamt
 * summerar till offertens total_ex_vat. intro är säljarens beskrivning (null när den är tom eller automatisk).
 * Tillval hamnar bara i options, med beloppet från optionTotals; de ingår varken i avsnitt, gemensamt eller totals.
 */
export function buildCustomerView(data: KalkylData, prices: PriceIndex, settings: KalkylSettings, intro: string | null | undefined): CustomerView {
  const offerLines = toOfferLineItems(data);
  const rowAmount = (rowId: string) => round2(offerLines.filter(i => i.id.startsWith(`${rowId}:`)).reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const section = (row: KalkylRow, amount_ex_vat: number): CustomerSection => ({
    id: row.id,
    room: roomOf(data, row)?.name ?? null,
    title: row.title,
    type: rowTypeLabel(row),
    amount_ex_vat,
    text: rowScopeText(row, data, prices, settings),
    facts: rowFacts(row, data, settings),
    items: rowItems(row, data, prices),
  });
  const sections = includedRows(data).map(row => section(row, rowAmount(row.id)));
  const optionAmount = new Map(optionTotals(data).rows.map(r => [r.id, r.amount_ex_vat]));
  const options = optionalRows(data).map(row => section(row, optionAmount.get(row.id) ?? 0));
  const common: CustomerCommonLine[] = offerLines
    .filter(i => i.id.startsWith('common:') || i.id.startsWith('adj:'))
    .map(i => ({ title: i.description, amount_ex_vat: round2(Number(i.amount) || 0) }));
  return {
    version: CUSTOMER_VIEW_VERSION,
    intro: customerIntro(intro, data, prices, settings),
    sections,
    common,
    totals: savedClassTotals(data),
    options,
  };
}

/** Avsnittets rubrik som kunden ser den: "Rum · Benämning", eller bara benämningen utan rum. */
export function customerSectionHeading(s: { room: string | null; title: string }): string {
  return s.room ? `${s.room} · ${s.title}` : s.title;
}

/** Prisraderna Arbete, Material och Övrigt för kundsidan; rader med belopp 0 visas inte. */
export function customerPriceRows(totals: CustomerTotals): { label: string; amount_ex_vat: number }[] {
  return [
    { label: 'Arbete', amount_ex_vat: totals.arbete_ex_vat },
    { label: 'Material', amount_ex_vat: totals.material_ex_vat },
    { label: 'Övrigt', amount_ex_vat: totals.ovrigt_ex_vat },
  ].filter(r => round2(r.amount_ex_vat) !== 0);
}

export interface CustomerPayment {
  incl_vat: boolean;
  rot_active: boolean;
  /** Faktor från belopp ex moms till visat pris (1,25 med vanlig moms). */
  price_factor: number;
  order_sum: number;
  vat: number;
  rot_base: number;
  rot_amount: number;
  rot_percent: number;
  rot_capped: boolean;
  payable: number;
  pay_label: string;
  handpenning_percent: number;
  handpenning: number;
  slutfaktura: number;
}

/** Totalerna som kundsidan visar, från offerttotalerna (samma regler som PublicOffer). */
export function customerPayment(t: OfferTotals, opts: KalkylOfferOptions): CustomerPayment {
  const incl_vat = opts.vat_mode === 'vanlig';
  const rot_active = !!opts.rot_enabled && incl_vat;
  const payable = rot_active ? t.total_after_rot : t.total_incl_vat;
  return {
    incl_vat,
    rot_active,
    price_factor: incl_vat ? 1.25 : 1,
    order_sum: t.total_incl_vat,
    vat: t.total_vat,
    rot_base: t.rot_base,
    rot_amount: t.rot_amount,
    rot_percent: opts.rot_percent,
    rot_capped: rot_active && !!t.rot_capped,
    payable,
    pay_label: rot_active ? 'Att betala efter ROT-avdrag' : incl_vat ? 'Att betala inkl. moms' : 'Att betala, omvänd byggmoms',
    handpenning_percent: Number(opts.handpenning_percent ?? 25),
    handpenning: t.handpenning,
    slutfaktura: t.slutfaktura,
  };
}
