import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, Ban, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DEVIATION_RESPONSIBLE } from '@/lib/constants';
import {
  fetchUnhandledCaseCosts,
  excludeCostFromPayout,
  restoreCostToPayout,
  COST_PAYOUT_QUERY_KEYS,
  type PayoutCost,
} from '@/lib/caseCostPayout';

interface Props {
  caseId: string | null | undefined;
  currentUser: string;
  /** Kostnads-id:n som redan ligger som rader i formuläret (ännu inte sparade). */
  addedCostIds: Set<string>;
  onAdd: (cost: PayoutCost) => void;
  /** 'order' = A-ordern, 'invoice' = fakturan — styr texterna. */
  target?: 'order' | 'invoice';
}

/**
 * Visar kostnader på ärendet som ännu inte ligger på någon A-order, med knappar för att
 * lägga till dem som rader eller markera att de inte ska ersättas.
 */
export function UnhandledCostsBlock({ caseId, currentUser, addedCostIds, onAdd, target = 'order' }: Props) {
  const qc = useQueryClient();
  const { data: costs = [] } = useQuery({
    queryKey: ['unhandled_case_costs', caseId ?? null],
    enabled: !!caseId,
    queryFn: () => fetchUnhandledCaseCosts(caseId as string),
  });

  if (!caseId || costs.length === 0) return null;

  const invalidate = () => COST_PAYOUT_QUERY_KEYS(caseId).forEach((k) => qc.invalidateQueries({ queryKey: k }));
  const targetLabel = target === 'invoice' ? 'fakturan' : 'A-ordern';

  async function exclude(c: PayoutCost) {
    try {
      await excludeCostFromPayout(c.id, currentUser);
      invalidate();
      toast.success(`"${c.description}" ersätts inte via ${targetLabel}`, {
        action: {
          label: 'Ångra',
          onClick: async () => {
            try { await restoreCostToPayout(c.id); invalidate(); } catch (e: any) { toast.error(e?.message || 'Kunde inte ångra'); }
          },
        },
      });
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte uppdatera kostnaden');
    }
  }

  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300 uppercase">
        <Receipt className="h-4 w-4" /> Kostnader på ärendet som inte ligger på {targetLabel} ({costs.length})
      </div>
      <div className="space-y-1.5">
        {costs.map((c) => {
          const added = addedCostIds.has(c.id);
          const respLabel = c.responsible ? (DEVIATION_RESPONSIBLE.find((r) => r.value === c.responsible)?.label || c.responsible) : null;
          const montorAnsvar = c.category === 'reklamation' && c.responsible === 'montor';
          return (
            <div key={c.id} className="rounded-md border bg-background p-2 text-sm flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  <span>{c.description}</span>
                  {c.category === 'reklamation' && (
                    <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300 text-[10px] px-1.5 py-0">
                      Reklamation{respLabel ? ` · ${respLabel}` : ''}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString('sv-SE')} · {c.created_by} · <span className="font-semibold text-foreground">{Math.round(Number(c.amount)).toLocaleString('sv-SE')} kr</span>
                  {montorAnsvar && <span className="text-destructive"> · Montörens ansvar — läggs normalt inte på {targetLabel}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {added ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 font-medium">
                    <Check className="h-3.5 w-3.5" /> Tillagd som rad
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAdd(c)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till som rad
                  </Button>
                )}
                {!added && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" title={`Ska inte ersättas via ${targetLabel}`} onClick={() => exclude(c)}>
                    <Ban className="h-3.5 w-3.5 mr-1" /> Ersätts inte
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] text-muted-foreground">Raden sparas och kostnaden markeras som ersatt när {targetLabel} sparas. Tar du bort raden blir kostnaden obehandlad igen.</div>
    </div>
  );
}
