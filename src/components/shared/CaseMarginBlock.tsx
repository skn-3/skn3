import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { bucketCaseCosts, computeCaseEconomics, marginWithFallback } from '@/lib/caseEconomy';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

function kr(n: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);
}

export function CaseMarginBlock({ caseId, orderValue }: { caseId: string; orderValue: number | null }) {
  const { data: eco, isLoading } = useQuery({
    queryKey: ['case-margin', caseId],
    queryFn: async () => {
      const [aRes, dRes, cRes] = await Promise.all([
        (supabase as any).from('a_orders').select('total_amount').eq('case_id', caseId),
        (supabase as any).from('case_documents').select('doc_type, total_amount').eq('case_id', caseId),
        (supabase as any).from('case_costs').select('category, responsible, amount').eq('case_id', caseId),
      ]);
      if (aRes.error) throw aRes.error;
      if (dRes.error) throw dRes.error;
      if (cRes.error) throw cRes.error;
      const aRows = (aRes.data ?? []) as any[];
      const aOrderSum = aRows.length > 0 ? aRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) : null;
      return computeCaseEconomics({
        aOrderSum,
        docs: (dRes.data ?? []) as any[],
        buckets: bucketCaseCosts((cRes.data ?? []) as any[]),
      });
    },
  });

  if (isLoading || !eco) return null;

  const { usingPayout, revenue, profit, marginPct } = marginWithFallback(eco, orderValue);
  const otherCost = eco.cost - eco.montorCost - eco.sheetCost;

  const tone = !eco.hasMontor
    ? 'border-amber-200 bg-amber-50/50'
    : profit < 0
      ? 'border-red-200 bg-red-50/50'
      : marginPct != null && marginPct < 15
        ? 'border-amber-200 bg-amber-50/50'
        : 'border-emerald-200 bg-emerald-50/50';

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${tone}`}>
      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        Marginal
      </h4>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500 text-xs">Intäkt {usingPayout ? '' : '(prel. ordervärde)'}</p>
          <p className="font-medium text-slate-900">{kr(revenue)}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs">Kostnader</p>
          <p className="font-medium text-slate-900">{kr(eco.cost)}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Montör {kr(eco.montorCost)}{eco.sheetCost > 0 ? ` · Plåt ${kr(eco.sheetCost)}` : ''}{otherCost > 0 ? ` · Övrigt ${kr(otherCost)}` : ''}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500 text-xs">Marginal</p>
          {eco.hasMontor ? (
            <p className={`font-semibold text-base flex items-center gap-1 ${profit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {profit < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {kr(profit)}{marginPct != null ? ` (${marginPct} %)` : ''}
            </p>
          ) : (
            <p className="text-amber-600 text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Montörskostnad saknas
            </p>
          )}
        </div>
      </div>

      {!usingPayout && (
        <p className="text-xs text-slate-400">Preliminär — baseras på ordervärdet tills Mockfjärds-utbetalningen är uppladdad.</p>
      )}
    </div>
  );
}
