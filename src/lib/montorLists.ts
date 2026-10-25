export type OrderFilter = 'all' | 'order' | 'sent' | 'invoiced' | 'paid' | 'credited';
export type OrderKindFilter = 'standard' | 'komplettering' | 'service' | 'fakturor';
export const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'Alla' }, { key: 'order', label: 'Order' },
  { key: 'sent', label: 'Skickad' }, { key: 'invoiced', label: 'Fakturerad' },
  { key: 'paid', label: 'Betald' }, { key: 'credited', label: 'Krediterad' },
];
export const ORDER_KINDS: { key: OrderKindFilter; label: string }[] = [
  { key: 'standard', label: 'Montage' }, { key: 'komplettering', label: 'Komplettering' }, { key: 'service', label: 'Service' },
  { key: 'fakturor', label: 'Fakturor' },
];
interface OrderLike { status?: string | null; order_sent_at?: string | null; paid_at?: string | null; total_amount?: number | null; invoice_sent_at?: string | null; invoice_number?: string | null; date?: string | null; credited_from_order_id?: string | null }
export function orderFilterKey(o: OrderLike): Exclude<OrderFilter, 'all'> {
  if (o.status === 'credited') return 'credited';
  if (o.status === 'invoiced') return o.paid_at ? 'paid' : 'invoiced';
  return o.order_sent_at ? 'sent' : 'order';
}
export function orderSummary(orders: OrderLike[], year: number) {
  return orders.reduce((s, o) => {
    const key = orderFilterKey(o);
    if (key === 'order' || key === 'sent') s.open++;
    if (key === 'invoiced') s.unpaid += Number(o.total_amount) || 0;
    if (key === 'paid' && o.paid_at?.slice(0, 4) === String(year)) s.paidThisYear++;
    return s;
  }, { open: 0, unpaid: 0, paidThisYear: 0 });
}
export const KM_STATUSES = ['vantar_km', 'km_bokad'];
export const MONTAGE_STATUSES = ['montage_bokat', 'montage_pagar', 'leverans_klar'];
const STATUS_ORDER = ['vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat', 'montage_pagar', 'montage_klart', 'fakturerad', 'pausad'];
interface DatedCase { status: string; km_date?: string | null; montage_date?: string | null }
export function relevantCaseDate(c: DatedCase) {
  return ['vantar_km', 'km_bokad', 'km_klar'].includes(c.status) ? c.km_date : c.montage_date;
}
export function compareMontorCases(a: DatedCase, b: DatedCase, tab: string) {
  const date = (c: DatedCase) => (tab === 'km' ? c.km_date : tab === 'montage' ? c.montage_date : relevantCaseDate(c)) || '9999-12-31';
  const status = tab === 'alla' ? STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) : 0;
  return status || date(a).localeCompare(date(b));
}
/** Montörens egna fakturor (montor_debit_invoices). */
export interface MontorInvoiceLike {
  kind?: string | null; status?: string | null; total?: number | null; paid_at?: string | null;
  date?: string | null; credited_from_invoice_id?: string | null;
}
export function isInvoiceCredit(i: MontorInvoiceLike) { return !!i.credited_from_invoice_id || Number(i.total ?? 0) < 0; }
export function invoiceFilterKey(i: MontorInvoiceLike): Exclude<OrderFilter, 'all'> {
  if (i.status === 'credited' || i.status === 'cancelled' || isInvoiceCredit(i)) return 'credited';
  if (i.paid_at || i.status === 'paid') return 'paid';
  if (i.status === 'sent') return 'invoiced';
  return 'order';
}
/** Belopp ur montörens perspektiv: positivt = montören får, negativt = montören betalar. */
export function invoiceSignedAmount(i: MontorInvoiceLike): number {
  const t = Number(i.total) || 0;
  return i.kind === 'debit' ? -t : t;
}

/**
 * Nyckeltal i Mina uppdrag.
 * outstanding = pågående ordrar + fakturerat ej betalt (A-ordrar och självfakturor) − obetalda debiteringar.
 * earned = allt fakturerat under året (A-ordrar, kreditfakturor, självfakturor, debiteringar) oavsett betalning.
 */
export function montorSummary(orders: OrderLike[], invoices: MontorInvoiceLike[], year: number) {
  const y = String(year);
  let pendingCount = 0, pendingAmount = 0, waiting = 0, unpaidDebit = 0, earned = 0, paidOut = 0;
  for (const o of orders) {
    const key = orderFilterKey(o);
    const amt = Number(o.total_amount) || 0;
    if (key === 'order' || key === 'sent') { pendingCount++; pendingAmount += amt; continue; }
    if (key === 'invoiced') waiting += amt;
    const invoiced = o.status === 'invoiced' || (o.status === 'credited' && (!!o.invoice_number || !!o.credited_from_order_id));
    const when = (o.invoice_sent_at || o.date || '').slice(0, 4);
    if (invoiced && when === y) {
      earned += amt;
      if (key === 'paid') paidOut += amt;
    }
  }
  for (const i of invoices) {
    if (i.status === 'cancelled') continue;
    const key = invoiceFilterKey(i);
    const signed = invoiceSignedAmount(i);
    const unpaid = !i.paid_at && i.status !== 'paid';
    if (i.kind === 'debit') { if (unpaid) unpaidDebit += Number(i.total) || 0; }
    else if (key === 'invoiced') waiting += signed;
    if ((i.date || '').slice(0, 4) === y) {
      earned += signed;
      if (i.kind !== 'debit' && !unpaid) paidOut += signed;
    }
  }
  return { pendingCount, pendingAmount, waiting, unpaidDebit, outstanding: pendingAmount + waiting - unpaidDebit, earned, paidOut };
}
