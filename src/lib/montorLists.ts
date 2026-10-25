export type OrderFilter = 'all' | 'order' | 'sent' | 'invoiced' | 'paid' | 'credited';
export type OrderKindFilter = 'standard' | 'komplettering' | 'service';
export const ORDER_FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'Alla' }, { key: 'order', label: 'Order' },
  { key: 'sent', label: 'Skickad' }, { key: 'invoiced', label: 'Fakturerad' },
  { key: 'paid', label: 'Betald' }, { key: 'credited', label: 'Krediterad' },
];
export const ORDER_KINDS: { key: OrderKindFilter; label: string }[] = [
  { key: 'standard', label: 'Montage' }, { key: 'komplettering', label: 'Komplettering' }, { key: 'service', label: 'Service' },
];
interface OrderLike { status?: string | null; order_sent_at?: string | null; paid_at?: string | null; total_amount?: number | null }
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