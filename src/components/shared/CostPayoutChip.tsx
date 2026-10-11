import { Badge } from '@/components/ui/badge';
import { payoutState } from '@/lib/caseCostPayout';

interface Props {
  cost: { a_order_id: string | null; payout_excluded_at: string | null; payout_excluded_by?: string | null };
  /** Ordernummer för A-ordern kostnaden ligger på, om känt. */
  orderNumber?: number | string | null;
  /** Visa "Ej på A-order"-varning när kostnaden är obehandlad (personalvyn). */
  showPending?: boolean;
}

/** Litet statusmärke för en kostnads koppling till A-order/faktura. */
export function CostPayoutChip({ cost, orderNumber, showPending = true }: Props) {
  const state = payoutState(cost);
  if (state === 'added') {
    return (
      <Badge variant="outline" className="border-green-400 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 text-[10px] px-1.5 py-0">
        På A-order{orderNumber != null ? ` #${orderNumber}` : ''}
      </Badge>
    );
  }
  if (state === 'excluded') {
    return (
      <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0" title={cost.payout_excluded_by ? `Beslut av ${cost.payout_excluded_by}` : undefined}>
        Ersätts inte
      </Badge>
    );
  }
  if (!showPending) return null;
  return (
    <Badge variant="outline" className="border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[10px] px-1.5 py-0">
      Ej på A-order
    </Badge>
  );
}
