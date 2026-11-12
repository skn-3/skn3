// Tal för kalkylvyn: radsummor, tillval, prisvisning och skicka-spärr.
// Komponenterna formaterar bara – alla belopp räknas här.
import type { OfferTotals } from '@/lib/offerCalc';
import type { GolvInput, KalkylData, KalkylLine, KalkylRoom, KalkylRow, KalkylSettings, MalningInput, RotClass } from './types';
import type { PriceIndex } from './prices';
import { rowLines, summarize, VAT_RATE, type KalkylSummary, allLines } from './kalkyl';
import { computeGolv } from './recipes/golv';
import { computeMalning } from './recipes/malning';
import { floorArea } from './geometry';
import { round2 } from './packaging';
import { fmtQty } from './lines';
import { canSend, runKontroller, type Kontroll } from './kontroller';
import { kalkylTotals, type KalkylOfferOptions } from './offer';
import { roomOf } from './state';

export type PriceDisplay = 'inkl' | 'exkl';

/** Visningsbelopp: inklusive moms för privatkund, exklusive för företag. */
export function displayAmount(amountExVat: number, mode: PriceDisplay, vatRate = VAT_RATE): number {
  return mode === 'inkl' ? round2(amountExVat * (1 + vatRate)) : round2(amountExVat);
}

export const defaultDisplay = (customerType: 'privat' | 'foretag' | null | undefined): PriceDisplay =>
  customerType === 'foretag' ? 'exkl' : 'inkl';

export interface Shares { material: number; arbete: number; ovrigt: number }

/** Andelar i procent för den delade stapeln (summerar till 100 när totalen är positiv). */
export function shares(s: Pick<KalkylSummary, 'material' | 'arbete' | 'ovrigt'>): Shares {
  const pos = (v: number) => Math.max(0, v);
  const total = pos(s.material) + pos(s.arbete) + pos(s.ovrigt);
  if (!total) return { material: 0, arbete: 0, ovrigt: 0 };
  return {
    material: round2((pos(s.material) / total) * 100),
    arbete: round2((pos(s.arbete) / total) * 100),
    ovrigt: round2((pos(s.ovrigt) / total) * 100),
  };
}

export interface RowFigures {
  summary: KalkylSummary;
  totals: OfferTotals;
  shares: Shares;
  /** Kr per m² golvyta (ex moms) för hela raden, null utan rum. */
  per_m2: number | null;
}

/** Summor för en kalkylrad, via samma offertväg som hela kalkylen. ROT-avdraget är utan tak. */
export function rowFigures(data: KalkylData, rowId: string, opts: KalkylOfferOptions): RowFigures | null {
  const row = (data.rows ?? []).find(r => r.id === rowId);
  if (!row) return null;
  const only: KalkylData = { ...data, rows: [row], common: [], adjustments: [] };
  const summary = summarize(rowLines(row));
  const totals = kalkylTotals(only, { ...opts, rot_persons: 10, rot_used: 0 });
  const room = roomOf(data, row);
  const area = room ? floorArea(room.dims) : 0;
  return { summary, totals, shares: shares(summary), per_m2: area > 0 ? round2(summary.total_ex_vat / area) : null };
}

/** Golvmaterial + läggning per m² golvyta (ex moms). */
export function golvPerM2(row: KalkylRow, room: KalkylRoom | null | undefined): number | null {
  if (row.trade !== 'golv' || !room) return null;
  const area = floorArea(room.dims);
  if (!(area > 0)) return null;
  const lines = rowLines(row).filter(l => l.key === 'golv.material' || l.key === 'golv.laggning');
  return round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) / area);
}

const CLASS_WORD: Record<RotClass, string> = { arbete: 'arbete, ROT', material: 'material', ovrigt: 'övrigt, inget ROT' };

/** "material", "arbete, ROT", "material + arbete, ROT", "övrigt, inget ROT". */
export function rotClassWords(lines: Pick<KalkylLine, 'rot_class'>[]): string {
  const set = [...new Set(lines.map(l => l.rot_class))];
  if (set.length === 1) return CLASS_WORD[set[0]];
  const order: RotClass[] = ['material', 'arbete', 'ovrigt'];
  const words = order.filter(c => set.includes(c)).map(c => (c === 'ovrigt' ? 'övrigt' : c));
  return `${words.join(' + ')}${set.includes('arbete') ? ', ROT' : ''}`;
}

export const lineQtyText = (l: Pick<KalkylLine, 'qty' | 'unit' | 'detail'>) =>
  l.detail ?? (l.unit === 'fast' ? 'Fast pris' : `${fmtQty(l.qty, 2)} ${l.unit}`);

export type GolvFlag = 'underlag' | 'sockel' | 'troskel' | 'rivning' | 'flytspackling' | 'mobelflytt' | 'bortforsling';

export const GOLV_OPTION_KEYS: Record<GolvFlag, string[]> = {
  underlag: ['golv.underlag'],
  sockel: ['golv.sockel', 'golv.sockel_montering'],
  troskel: ['golv.troskel', 'golv.troskel_montering'],
  rivning: ['golv.rivning'],
  flytspackling: ['golv.flytspackel', 'golv.flytspackling'],
  mobelflytt: ['golv.mobelflytt'],
  bortforsling: ['golv.bortforsling'],
};
export const GOLV_OPTION_ORDER: GolvFlag[] = ['underlag', 'sockel', 'troskel', 'rivning', 'flytspackling', 'mobelflytt', 'bortforsling'];
const GOLV_OPTION_LABEL: Record<GolvFlag, string> = {
  underlag: 'Underlag med ångspärr', sockel: 'Sockellist', troskel: 'Trösklar', rivning: 'Rivning befintligt golv',
  flytspackling: 'Flytspackling', mobelflytt: 'Möbelflytt', bortforsling: 'Bortforsling',
};

export interface GolvOption {
  flag: GolvFlag;
  label: string;
  enabled: boolean;
  /** Raderna när tillvalet är på (efter säljarens ändringar om det är på). */
  lines: KalkylLine[];
  amount: number;
  detail: string;
  manual: boolean;
  /** Första prisraden, för provbit och kulörkod. */
  code: string | null;
}

/** Tillbehör och tillägg för golvraden, med pris även för avstängda val (vad det skulle kosta). */
export function golvOptions(row: KalkylRow, room: KalkylRoom | null | undefined, prices: PriceIndex, settings: KalkylSettings): GolvOption[] {
  if (row.trade !== 'golv' || !row.input || !room) return [];
  const inp = row.input as GolvInput;
  const allOn: GolvInput = { ...inp, underlag: true, sockel: true, troskel: true, rivning: true, flytspackling: true, mobelflytt: true, bortforsling: true };
  const preview = computeGolv(room.dims, allOn, prices, settings);
  const actual = rowLines(row);
  return GOLV_OPTION_ORDER.map(flag => {
    const keys = GOLV_OPTION_KEYS[flag];
    const enabled = !!inp[flag];
    const lines = (enabled ? actual : preview).filter(l => keys.includes(l.key));
    const first = lines[0];
    return {
      flag,
      label: GOLV_OPTION_LABEL[flag],
      enabled,
      lines,
      amount: round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)),
      detail: first ? `${lineQtyText(first)} · ${rotClassWords(lines)}` : '',
      manual: lines.some(l => l.manual),
      code: first?.code ?? null,
    };
  });
}

/** Antal rader med belopp men utan känd kostnad. */
export function costMissingCount(data: KalkylData): number {
  return allLines(data).filter(l => l.cost == null && (Number(l.amount) || 0) !== 0).length;
}

export interface MarginInfo { tb: number; tb_pct: number | null; target: number; /** 0–1 för stapeln, 1 = målet nått. */ ratio: number; reached: boolean }

export function marginInfo(summary: KalkylSummary, settings: KalkylSettings): MarginInfo {
  const target = settings.margin_target_pct;
  const pct = summary.tb_pct;
  const ratio = pct == null || target <= 0 ? 0 : Math.max(0, Math.min(1, pct / target));
  return { tb: summary.tb, tb_pct: pct, target, ratio, reached: pct != null && pct >= target };
}

/** Kontroller sorterade: blockerande, åtgärd, info, ok. */
export function sortKontroller(list: Kontroll[]): Kontroll[] {
  const rank = (k: Kontroll) => (k.blocking ? 0 : k.level === 'atgard' ? 1 : k.level === 'info' ? 2 : 3);
  return list.slice().sort((a, b) => rank(a) - rank(b));
}

export const rowNeedsAction = (list: Kontroll[], rowId: string) =>
  list.some(k => k.row_id === rowId && (k.blocking || k.level === 'atgard'));

export interface SendCheck { can_send: boolean; blocking: Kontroll[]; messages: string[] }

/**
 * Skicka-spärr för offerter med kalkyl: kör kontrollerna mot aktuell prislista och
 * sammanfattar det som stoppar, t.ex. "3 priser är inte godkända i prislistan".
 */
export function sendCheck(data: KalkylData | null | undefined, prices: PriceIndex, settings: KalkylSettings, today: Date | string): SendCheck {
  if (!data) return { can_send: true, blocking: [], messages: [] };
  const list = runKontroller(data, prices, settings, today);
  const blocking = list.filter(k => k.blocking);
  const lines = allLines(data);
  const notApproved = new Set(lines.filter(l => {
    if (!l.code) return false;
    const st = prices[l.code]?.status ?? l.price_status ?? null;
    return st != null && st !== 'godkand';
  }).map(l => l.code as string));
  const missing = lines.filter(l => l.unit_price == null).length;
  const messages: string[] = [];
  if (missing) messages.push(`${missing} ${missing === 1 ? 'rad saknar' : 'rader saknar'} pris i prislistan`);
  if (notApproved.size) messages.push(`${notApproved.size} ${notApproved.size === 1 ? 'pris är' : 'priser är'} inte godkända i prislistan`.replace('pris är inte godkända', 'pris är inte godkänt'));
  for (const k of blocking) if (!k.id.startsWith('pris_saknas') && !k.id.startsWith('pris_ej_godkant')) messages.push(k.text);
  return { can_send: canSend(list), blocking, messages };
}

/** Lokalt sparad version är nyare än databasens? */
export function isLocalNewer(localSavedAt: string | null | undefined, dbUpdatedAt: string | null | undefined): boolean {
  if (!localSavedAt) return false;
  const l = Date.parse(localSavedAt);
  if (Number.isNaN(l)) return false;
  if (!dbUpdatedAt) return true;
  const d = Date.parse(dbUpdatedAt);
  return Number.isNaN(d) ? true : l > d;
}

export interface SummaryView {
  material: number; arbete: number; ovrigt: number;
  sumLabel: string; sum: number;
  vatLabel: string; vat: number;
  rotActive: boolean; rotLabel: string; rot: number; rotCapped: boolean;
  payLabel: string; pay: number;
  handpenningLabel: string; handpenning: number; slutfaktura: number;
}

/**
 * Sammanfattningens rader i vald visning. Privatkund ser inklusive moms, företag exklusive.
 * ROT, handpenning och slutfaktura kommer alltid från calcOfferTotals (inklusive moms).
 */
export function summaryView(totals: OfferTotals, summary: KalkylSummary, display: PriceDisplay, opts: KalkylOfferOptions): SummaryView {
  const omvand = opts.vat_mode === 'omvand';
  const show = (v: number) => (omvand ? round2(v) : displayAmount(v, display));
  const rotActive = !!opts.rot_enabled && !omvand;
  const incl = display === 'inkl' || omvand;
  return {
    material: show(summary.material),
    arbete: show(summary.arbete),
    ovrigt: show(summary.ovrigt),
    sumLabel: omvand ? 'Summa, omvänd byggmoms' : incl ? 'Summa inkl. moms' : 'Summa exkl. moms',
    sum: incl ? round2(totals.total_incl_vat) : round2(totals.total_ex_vat),
    vatLabel: omvand ? 'Ingen moms på fakturan' : incl ? 'varav moms' : 'moms tillkommer med',
    vat: round2(totals.total_vat),
    rotActive,
    rotLabel: `ROT-avdrag ${opts.rot_percent} %`,
    rot: round2(totals.rot_amount),
    rotCapped: totals.rot_capped,
    payLabel: rotActive ? 'Att betala efter ROT' : incl ? 'Att betala' : 'Att betala inkl. moms',
    pay: round2(totals.total_after_rot),
    handpenningLabel: `Handpenning ${opts.handpenning_percent ?? 25} %`,
    handpenning: round2(totals.handpenning),
    slutfaktura: round2(totals.slutfaktura),
  };
}

export type MalningFlag = 'tak' | 'snickerier';
export const MALNING_OPTION_KEYS: Record<MalningFlag, string[]> = {
  tak: ['malning.tak', 'malning.takfarg'],
  snickerier: ['malning.foder', 'malning.sockelmalning', 'malning.snickerifarg'],
};

/** Pris för "Måla tak" och "Måla snickerier", även när de är avstängda. */
export function malningOptions(row: KalkylRow, room: KalkylRoom | null | undefined, prices: PriceIndex, settings: KalkylSettings): Record<MalningFlag, { enabled: boolean; amount: number }> {
  const empty = { tak: { enabled: false, amount: 0 }, snickerier: { enabled: false, amount: 0 } };
  if (row.trade !== 'malning' || !row.input || !room) return empty;
  const inp = row.input as MalningInput;
  const preview = computeMalning(room.dims, { ...inp, tak: true, snickerier: true }, prices, settings);
  const actual = rowLines(row);
  const sum = (flag: MalningFlag) => {
    const lines = (inp[flag] ? actual : preview).filter(l => MALNING_OPTION_KEYS[flag].includes(l.key));
    return round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  };
  return { tak: { enabled: !!inp.tak, amount: sum('tak') }, snickerier: { enabled: !!inp.snickerier, amount: sum('snickerier') } };
}

export interface KontrollFix { label: string; patch: Partial<GolvInput> | Partial<MalningInput> }

/** Åtgärd som går att göra direkt från kontrollkortet, t.ex. "Lägg till flytspackling". */
export function kontrollFix(k: Pick<Kontroll, 'id'>): KontrollFix | null {
  const rule = k.id.split(':')[0];
  if (rule === 'golv_underlag_saknas') return { label: 'Lägg till underlag', patch: { underlag: true } };
  if (rule === 'golv_sockel_saknas') return { label: 'Lägg till sockellist', patch: { sockel: true } };
  if (rule === 'golv_avjamning') return { label: 'Lägg till flytspackling', patch: { flytspackling: true } };
  if (rule === 'malning_mork_kulor') return { label: 'Räkna med 3 strykningar', patch: { coats: 3 } };
  return null;
}
