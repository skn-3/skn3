// Avdrag på montörsutbetalningar (avräkning) – ren logik, beslut 16 november 2026.
//
// Princip (får aldrig brytas):
//  - Avdrag står ALDRIG på självfakturan. Skulden är en montörsdebetfaktura (N3-serien).
//  - Kvittningen sker i utbetalningsspecifikationen (UTB-serien, montor_settlements):
//    självfakturor som betalas minus kreditfakturor och kvittade fordringar = netto.
//  - Bara inom samma team. Nettot blir aldrig negativt.
//
// Den här modulen används för klientens förhandsvisning, urval och statusar.
// De sparade beloppen räknas alltid av databasfunktionen create_montor_settlement
// med samma regler; PDF:en byggs från de sparade värdena.
import { calcInvoiceTotals, type VatMode } from './invoiceMath';
import { REVERSE_CHARGE_TEXT } from './selfBillingLayout';

export { AVRAKNING_NOTICE, formatPaymentAmount, settlementPaymentLine, debitRelatedInvoiceLine } from '../../supabase/functions/_shared/montorSettlementShared';
import type { RelatedOrderLike } from '../../supabase/functions/_shared/montorSettlementShared';
export type { RelatedOrderLike } from '../../supabase/functions/_shared/montorSettlementShared';

/** Kreditfakturor före detta datum visas aldrig (historiken från n3prenad-migreringen är inte tillförlitlig). */
export const SETTLEMENT_CREDIT_CUTOFF = '2026-11-16';

// ---------------------------------------------------------------------------
// Avdragstyper och moms

export type DebitType = 'skada_merkostnad' | 'material_frakt' | 'lan_forskott' | 'byggtjanst';
export type SettleMode = 'bankgiro' | 'avrakning';

export interface DebitTypeInfo {
  key: DebitType;
  /** Etikett i formuläret */
  label: string;
  /** Kort namn i listor och som rubrik på debetfakturan */
  short: string;
  /** Kort förklaring under valet */
  hint: string;
  vatMode: VatMode;
  /** Momstext på debetfakturan; null = vanlig moms 25 % */
  vatText: string | null;
}

export const DEBIT_TYPES: readonly DebitTypeInfo[] = [
  {
    key: 'skada_merkostnad',
    label: 'Skada eller merkostnad som montören orsakat (även krav från Mockfjärds eller kund)',
    short: 'Skada eller merkostnad',
    hint: 'Ersättning för skada är ingen försäljning. Ingen moms.',
    vatMode: 'ingen',
    vatText: 'Ingen moms: ersättning för skada eller merkostnad utgör ingen omsättning enligt mervärdesskattelagen.',
  },
  {
    key: 'material_frakt',
    label: 'Material, frakt eller annat vi köpt åt montören',
    short: 'Material eller frakt',
    hint: 'Vi säljer vidare till montören. 25 % moms läggs på beloppet.',
    vatMode: 'vanlig',
    vatText: null,
  },
  {
    key: 'lan_forskott',
    label: 'Lån eller förskott',
    short: 'Lån eller förskott',
    hint: 'Återbetalning av pengar montören fått i förväg. Ingen moms.',
    vatMode: 'ingen',
    vatText: 'Ingen moms: återbetalning av lån eller förskott.',
  },
  {
    key: 'byggtjanst',
    label: 'Byggtjänst som N3prenad utfört åt montören (ovanligt)',
    short: 'Byggtjänst',
    hint: 'Omvänd betalningsskyldighet: montören redovisar momsen.',
    vatMode: 'omvand',
    vatText: REVERSE_CHARGE_TEXT,
  },
];

export const SETTLE_MODE_TEXT: Record<SettleMode, string> = {
  avrakning: 'Regleras genom avräkning mot nästa utbetalning',
  bankgiro: 'Montören betalar till vårt bankgiro',
};

export function debitTypeInfo(type: string | null | undefined): DebitTypeInfo | null {
  return DEBIT_TYPES.find(t => t.key === type) ?? null;
}

/** Typen styr momsen; användaren väljer aldrig moms på ett avdrag. */
export function debitVatMode(type: DebitType): VatMode {
  const info = debitTypeInfo(type);
  if (!info) throw new Error(`Okänd avdragstyp: ${type}`);
  return info.vatMode;
}

/**
 * Momstext på debetfakturan. Omvänd-texten står bara när vat_mode = 'omvand';
 * 'ingen' får typens egen text; vanlig moms har ingen text.
 */
export function debitVatText(vatMode: VatMode, type?: string | null): string | null {
  if (vatMode === 'omvand') return REVERSE_CHARGE_TEXT;
  if (vatMode === 'vanlig') return null;
  const info = debitTypeInfo(type);
  return info?.vatMode === 'ingen' ? info.vatText : 'Ingen moms.';
}

/** Belopp anges exkl. moms. material_frakt får 25 % moms, övriga typer total = belopp. */
export function debitTotals(type: DebitType, amountExVat: number) {
  const vatMode = debitVatMode(type);
  const amount = round2(Number(amountExVat) || 0);
  return { vatMode, ...calcInvoiceTotals([{ amount }], vatMode) };
}

// ---------------------------------------------------------------------------
// Belopp

export const toCents = (n: number | string | null | undefined) => Math.round((Number(n) || 0) * 100);
export const fromCents = (c: number) => c / 100;
export const round2 = (n: number | string | null | undefined) => fromCents(toCents(n));

// ---------------------------------------------------------------------------
// Urval (grupp A–C)

export interface AOrderLike {
  id: string; team_id: string | null; status: string | null; total_amount: number | string | null;
  paid_at: string | null; invoice_number?: string | null; invoice_sent_at?: string | null; date?: string | null;
  credited_from_order_id?: string | null; customer_address?: string | null; order_kind?: string | null; order_number?: number | null;
}
export interface DebitLike {
  id: string; team_id: string | null; kind: string | null; status: string | null; total: number | string | null;
  paid_at: string | null; invoice_number?: string | null; date?: string | null; created_at?: string | null;
  credited_from_invoice_id?: string | null; settle_mode?: string | null; title?: string | null; description?: string | null;
  debit_type?: string | null;
  /** Valfri koppling till självfakturan (A-orderraden) avdraget avser */
  related_a_order_id?: string | null;
  /** Inbäddad A-orderrad för kopplingen (nuvarande nummer och adress) */
  related_order?: RelatedOrderLike | null;
}
export interface SettlementItemLike {
  item_kind: string; a_order_id: string | null; debit_invoice_id: string | null; amount: number | string;
  active: boolean; settlement_id?: string; settlement_number?: string | null; settlement_status?: string | null;
}

export type CandidateKind = 'invoice' | 'self_billing_invoice' | 'credit_note';
export interface Candidate {
  id: string; kind: CandidateKind; source: 'a_order' | 'debit';
  number: string; label: string; date: string;
  /** Positivt för fakturor, negativt för kreditfakturor */
  amount: number;
}
export interface DeductionCandidate {
  id: string; number: string; label: string; date: string; created_at: string;
  total: number; settled: number; remaining: number;
  /** A-orderraden avdraget avser, och texten "Avser ALEX-097 (adress)" */
  related_a_order_id: string | null; related_label: string | null;
}

const ORDER_KIND_SUFFIX: Record<string, string> = { komplettering: 'Komplettering', service: 'Service' };
const dateOf = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

/** Dokument (faktura/kreditfaktura) som redan ingår i en aktiv specifikation. Avdrag kan delkvittas och räknas inte här. */
export function activeDocumentIds(items: SettlementItemLike[]): Set<string> {
  const ids = new Set<string>();
  for (const it of items) {
    if (!it.active) continue;
    if (it.a_order_id) ids.add(it.a_order_id);
    else if (it.debit_invoice_id && it.item_kind !== 'deduction') ids.add(it.debit_invoice_id);
  }
  return ids;
}

/** Hur mycket av varje debetfaktura som är kvittat i aktiva specifikationer (positivt belopp). */
export function settledByDeduction(items: SettlementItemLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it.active || it.item_kind !== 'deduction' || !it.debit_invoice_id) continue;
    m.set(it.debit_invoice_id, fromCents((toCents(m.get(it.debit_invoice_id)) + Math.abs(toCents(it.amount)))));
  }
  return m;
}

/** Aktiv specifikation per dokument-id (för "Ingår i UTB-xxx"). Avdrag kan ha flera. */
export function settlementNumbersByDocument(items: SettlementItemLike[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const it of items) {
    const id = it.a_order_id || it.debit_invoice_id;
    if (!it.active || !id || !it.settlement_number) continue;
    const list = m.get(id) ?? [];
    if (!list.includes(it.settlement_number)) list.push(it.settlement_number);
    m.set(id, list);
  }
  return m;
}

/** Grupp A: självfakturor att betala. Samma urval som "Obetalt till montörer" plus KM-självfakturor. */
export function eligibleInvoices(teamId: string, aOrders: AOrderLike[], debits: DebitLike[], items: SettlementItemLike[]): Candidate[] {
  const active = activeDocumentIds(items);
  const creditedA = new Set(aOrders.filter(o => o.credited_from_order_id).map(o => o.credited_from_order_id as string));
  const creditedD = new Set(debits.filter(d => d.credited_from_invoice_id).map(d => d.credited_from_invoice_id as string));
  const fromOrders: Candidate[] = aOrders
    .filter(o => o.team_id === teamId && o.status === 'invoiced' && !o.paid_at && toCents(o.total_amount) > 0
      && !o.credited_from_order_id && !creditedA.has(o.id) && !active.has(o.id))
    .map(o => ({
      id: o.id, kind: 'invoice' as const, source: 'a_order' as const,
      number: o.invoice_number || `#${o.order_number ?? ''}`,
      label: [String(o.customer_address ?? '').trim(), ORDER_KIND_SUFFIX[o.order_kind ?? '']].filter(Boolean).join(' · '),
      date: dateOf(o.invoice_sent_at) || dateOf(o.date), amount: round2(o.total_amount),
    }));
  const fromKm: Candidate[] = debits
    .filter(d => d.team_id === teamId && d.kind === 'self_billing' && d.status === 'sent' && !d.paid_at && toCents(d.total) > 0
      && !d.credited_from_invoice_id && !creditedD.has(d.id) && !active.has(d.id))
    .map(d => ({
      id: d.id, kind: 'self_billing_invoice' as const, source: 'debit' as const,
      number: d.invoice_number || '', label: String(d.title ?? '').trim() || 'Självfaktura',
      date: dateOf(d.date), amount: round2(d.total),
    }));
  return [...fromOrders, ...fromKm].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

/** Grupp B: kreditfakturor från 2026-11-16 vars original är betalt och som inte redan kvittats. */
export function eligibleCredits(teamId: string, aOrders: AOrderLike[], debits: DebitLike[], items: SettlementItemLike[]): Candidate[] {
  const active = activeDocumentIds(items);
  const aById = new Map(aOrders.map(o => [o.id, o]));
  const dById = new Map(debits.map(d => [d.id, d]));
  const fromOrders: Candidate[] = aOrders
    .filter(o => {
      if (o.team_id !== teamId || !o.credited_from_order_id || o.status !== 'credited' || toCents(o.total_amount) >= 0) return false;
      if (dateOf(o.date) < SETTLEMENT_CREDIT_CUTOFF || o.paid_at || active.has(o.id)) return false;
      return !!aById.get(o.credited_from_order_id)?.paid_at;
    })
    .map(o => ({
      id: o.id, kind: 'credit_note' as const, source: 'a_order' as const, number: o.invoice_number || '',
      label: [`Kreditering av ${aById.get(o.credited_from_order_id as string)?.invoice_number ?? '—'}`, String(o.customer_address ?? '').trim()].filter(Boolean).join(' · '),
      date: dateOf(o.date), amount: round2(o.total_amount),
    }));
  const fromKm: Candidate[] = debits
    .filter(d => {
      if (d.team_id !== teamId || d.kind !== 'self_billing' || !d.credited_from_invoice_id || toCents(d.total) >= 0) return false;
      if (d.status === 'cancelled' || dateOf(d.date) < SETTLEMENT_CREDIT_CUTOFF || d.paid_at || active.has(d.id)) return false;
      return !!dById.get(d.credited_from_invoice_id)?.paid_at;
    })
    .map(d => {
      const orig = dById.get(d.credited_from_invoice_id as string);
      return {
        id: d.id, kind: 'credit_note' as const, source: 'debit' as const, number: d.invoice_number || '',
        label: [`Kreditering av ${orig?.invoice_number ?? '—'}`, String(orig?.title ?? '').trim()].filter(Boolean).join(' · '),
        date: dateOf(d.date), amount: round2(d.total),
      };
    });
  return [...fromOrders, ...fromKm].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

/** Grupp C: öppna avdrag med avräkning, kvarvarande belopp > 0, äldst först. */
export function eligibleDeductions(teamId: string, debits: DebitLike[], items: SettlementItemLike[]): DeductionCandidate[] {
  const settled = settledByDeduction(items);
  const credited = new Set(debits.filter(d => d.credited_from_invoice_id).map(d => d.credited_from_invoice_id as string));
  return debits
    .filter(d => d.team_id === teamId && d.kind === 'debit' && d.settle_mode === 'avrakning' && d.status === 'sent'
      && !d.paid_at && !d.credited_from_invoice_id && !credited.has(d.id) && toCents(d.total) > 0)
    .map(d => {
      const total = round2(d.total);
      const done = settled.get(d.id) ?? 0;
      return {
        id: d.id, number: d.invoice_number || '', date: dateOf(d.date), created_at: String(d.created_at ?? ''),
        label: String(d.description ?? '').trim() || String(d.title ?? '').trim() || 'Fordran',
        total, settled: done, remaining: fromCents(toCents(total) - toCents(done)),
        related_a_order_id: d.related_a_order_id ?? null,
        related_label: d.related_a_order_id ? relatedInvoiceLabel(d.related_order) : null,
      };
    })
    .filter(d => toCents(d.remaining) > 0)
    .sort(compareDeductions);
}

export function compareDeductions(a: { date: string; created_at: string; number: string }, b: { date: string; created_at: string; number: string }) {
  return a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at) || a.number.localeCompare(b.number);
}

// ---------------------------------------------------------------------------
// Fördelning

export interface AllocationInput {
  /** Valda fakturor i grupp A (positiva belopp) */
  invoices: number[];
  /** Valda kreditfakturor i grupp B (negativa eller positiva belopp, räknas som avgående) */
  credits: number[];
  /** Valda avdrag i grupp C, i valfri ordning; fördelas äldst först */
  deductions: Array<{ id: string; remaining: number; total?: number; date: string; created_at?: string; number?: string }>;
}
export interface Allocation { id: string; take: number; remainingAfter: number }
export interface AllocationResult {
  invoicesTotal: number; creditsTotal: number; deductionsTotal: number; net: number;
  allocations: Allocation[];
  /** Avdrag som inte fick något alls den här gången (fakturorna räckte inte) */
  untouched: string[];
  error: null | 'no_invoice' | 'credits_exceed';
}

/**
 * Samma regler som create_montor_settlement: minst en faktura, krediter får inte
 * överstiga fakturorna, avdragen fördelas äldst först och nettot blir aldrig negativt
 * (sista avdraget delkvittas, resten ligger kvar). Räknas i ören.
 */
export function allocateSettlement(input: AllocationInput): AllocationResult {
  const inv = input.invoices.reduce((s, a) => s + Math.abs(toCents(a)), 0);
  const cred = input.credits.reduce((s, a) => s + Math.abs(toCents(a)), 0);
  const base = { invoicesTotal: fromCents(inv), creditsTotal: fromCents(cred), allocations: [] as Allocation[], untouched: [] as string[] };
  if (input.invoices.length === 0) return { ...base, deductionsTotal: 0, net: fromCents(inv - cred), untouched: input.deductions.map(d => d.id), error: 'no_invoice' };
  if (cred > inv) return { ...base, deductionsTotal: 0, net: fromCents(inv - cred), untouched: input.deductions.map(d => d.id), error: 'credits_exceed' };
  let left = inv - cred;
  let ded = 0;
  const ordered = [...input.deductions].sort((a, b) => compareDeductions(
    { date: a.date, created_at: a.created_at ?? '', number: a.number ?? '' },
    { date: b.date, created_at: b.created_at ?? '', number: b.number ?? '' },
  ));
  const allocations: Allocation[] = [];
  const untouched: string[] = [];
  for (const d of ordered) {
    const rem = toCents(d.remaining);
    const take = Math.max(0, Math.min(rem, left));
    if (take <= 0) { untouched.push(d.id); continue; }
    left -= take;
    ded += take;
    allocations.push({ id: d.id, take: fromCents(take), remainingAfter: fromCents(rem - take) });
  }
  return { ...base, deductionsTotal: fromCents(ded), net: fromCents(inv - cred - ded), allocations, untouched, error: null };
}

/** Översikt per team: allt som skulle ingå om inget kryssas ur. */
export function teamPayoutOverview(teamId: string, aOrders: AOrderLike[], debits: DebitLike[], items: SettlementItemLike[]) {
  const invoices = eligibleInvoices(teamId, aOrders, debits, items);
  const credits = eligibleCredits(teamId, aOrders, debits, items);
  const deductions = eligibleDeductions(teamId, debits, items);
  const allocation = allocateSettlement({ invoices: invoices.map(i => i.amount), credits: credits.map(c => c.amount), deductions });
  return {
    invoices, credits, deductions,
    invoicesSum: fromCents(invoices.reduce((s, i) => s + toCents(i.amount), 0)),
    creditsSum: fromCents(credits.reduce((s, c) => s + Math.abs(toCents(c.amount)), 0)),
    deductionsOpen: fromCents(deductions.reduce((s, d) => s + toCents(d.remaining), 0)),
    allocation,
  };
}

// ---------------------------------------------------------------------------
// Statusar

export interface SettlementLike { status: string; paid_at?: string | null; settlement_number?: string | null }

export function settlementStatusText(s: SettlementLike): string {
  switch (s.status) {
    case 'created': return 'Skapad';
    case 'sent': return 'Skickad';
    case 'paid': return s.paid_at ? `Betald ${String(s.paid_at).slice(0, 10)}` : 'Betald';
    case 'cancelled': return 'Makulerad';
    default: return s.status;
  }
}

export function formatKr(n: number | string | null | undefined): string {
  const v = round2(n);
  const s = Number.isInteger(v)
    ? v.toLocaleString('sv-SE')
    : v.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return s.replace(/\u2212/g, '-') + ' kr';
}

/**
 * Avdragets status för montören och personalen. `items` = synliga rader för just
 * den här debetfakturan (montören ser bara skickade och betalda specifikationer).
 */
export function deductionStatusText(d: DebitLike, items: SettlementItemLike[]): string {
  if (d.status === 'credited') return 'Krediterad';
  if (d.status === 'cancelled') return 'Makulerad';
  const mine = items.filter(it => it.active && it.item_kind === 'deduction' && it.debit_invoice_id === d.id);
  const used = mine.reduce((s, it) => s + Math.abs(toCents(it.amount)), 0);
  const numbers = Array.from(new Set(mine.map(it => it.settlement_number).filter(Boolean))) as string[];
  const total = toCents(d.total);
  if (used >= total && used > 0) return `Kvittad mot ${numbers.join(', ')}`;
  if (d.status === 'paid' || d.paid_at) return 'Betald';
  if (d.settle_mode !== 'avrakning') return 'Betalas till bankgiro 5032-4573';
  if (used > 0) return `Delvis kvittad, kvar ${formatKr(fromCents(total - used))}`;
  return 'Regleras vid nästa utbetalning';
}

// ---------------------------------------------------------------------------
// Avdrag som avser en viss självfaktura (valfritt). Avdraget står aldrig på självfakturan;
// kopplingen visas bara på debetfakturan, i utbetalningen och i montörsvyn.

/** Fakturans nuvarande nummer, annars "#ordernummer". */
export function relatedInvoiceRef(o: RelatedOrderLike | null | undefined): string {
  const nr = String(o?.invoice_number ?? '').trim();
  if (nr) return nr;
  return o?.order_number != null && o.order_number !== '' ? `#${o.order_number}` : '—';
}

/** "Avser ALEX-097 (Blåsippsbacken 93, Vällingby)", eller "Avser ALEX-097" utan adress. */
export function relatedInvoiceLabel(o: RelatedOrderLike | null | undefined, withAddress = true): string {
  const addr = withAddress ? String(o?.customer_address ?? '').trim() : '';
  return `Avser ${relatedInvoiceRef(o)}${addr ? ` (${addr})` : ''}`;
}

export const RELATED_INVOICE_NOT_INCLUDED = 'Fakturan som avdraget avser är inte med i den här utbetalningen';

/** Notis på avdragsraden när fakturan avdraget avser inte är ikryssad. Blockerar inte. */
export function relatedInvoiceNotice(relatedAOrderId: string | null | undefined, selectedInvoiceIds: Iterable<string>): string | null {
  if (!relatedAOrderId) return null;
  for (const id of selectedInvoiceIds) if (id === relatedAOrderId) return null;
  return RELATED_INVOICE_NOT_INCLUDED;
}

export interface RelatedInvoiceSource extends AOrderLike { case_id?: string | null }
export interface RelatedInvoiceOption { id: string; invoice_number: string; case_id: string | null; label: string; address: string }

/**
 * Fakturor ett avdrag kan avse: teamets A-order-, kompletterings- och serviceorderfakturor
 * med fakturanummer – status 'invoiced', eller krediterade original (inte kreditfakturan själv).
 * Nyast först. Visning: "ALEX-094 · Blåsippsbacken 93, Vällingby · 37 929 kr".
 */
export function relatedInvoiceOptions(teamId: string | null | undefined, aOrders: RelatedInvoiceSource[]): RelatedInvoiceOption[] {
  if (!teamId) return [];
  const sortKey = (o: RelatedInvoiceSource) => String(o.invoice_sent_at ?? '') || dateOf(o.date);
  return aOrders
    .filter(o => o.team_id === teamId && String(o.invoice_number ?? '').trim()
      && (o.status === 'invoiced' || (o.status === 'credited' && !o.credited_from_order_id)))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || String(b.invoice_number).localeCompare(String(a.invoice_number), 'sv', { numeric: true }))
    .map(o => {
      const address = String(o.customer_address ?? '').trim();
      return {
        id: o.id, invoice_number: String(o.invoice_number).trim(), case_id: o.case_id ?? null, address,
        label: [String(o.invoice_number).trim(), address, formatKr(o.total_amount)].filter(Boolean).join(' · '),
      };
    });
}
