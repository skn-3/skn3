import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

function kr(n: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n);
}

export function CaseMarginBlock({ caseId, orderValue }: { caseId: string; orderValue: number | null }) {
  const { data, isLoading } = useQuery({
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
      const docs = (dRes.data ?? []) as any[];
      const costs = (cRes.data ?? []) as any[];

      const sum = (arr: any[], f: (x: any) => number) => arr.reduce((s, x) => s + f(x), 0);

      // Samma formel som EconomyView — ändra aldrig här utan att ändra där.
      const payout = sum(docs.filter((d) => d.doc_type === 'mockfjards_payout'), (d) => Number(d.total_amount) || 0);
      const aOrderLocal = aRows.length > 0 ? sum(aRows, (r) => Number(r.total_amount) || 0) : null;
      const aOrderDoc = sum(docs.filter((d) => d.doc_type === 'a_order'), (d) => Number(d.total_amount) || 0);
      const montorCost = aOrderLocal != null ? aOrderLocal : aOrderDoc;
      const hasMontor = (aOrderLocal != null && aOrderLocal !== 0) || aOrderDoc > 0;
      const sheetCost = sum(docs.filter((d) => d.doc_type === 'sheet_metal_invoice'), (d) => Number(d.total_amount) || 0);
      const montorInvoiceCost = sum(docs.filter((d) => d.doc_type === 'montor_invoice'), (d) => Number(d.total_amount) || 0);

      let ovrigt = 0, reklMontor = 0, reklOvrig = 0;
      for (const c of costs) {
        const amt = Number(c.amount) || 0;
        if (c.category === 'reklamation') {
          if (c.responsible === 'montor') reklMontor += amt;
          else if (c.responsible === 'fabrik') { /* fabrik exkluderas — ersätts av fabrik */ }
          else reklOvrig += amt;
        } else ovrigt += amt;
      }

      const cost = montorCost + ovrigt + reklMontor + reklOvrig + sheetCost + montorInvoiceCost;
      return { payout, cost, montorCost, sheetCost, otherCost: ovrigt + reklMontor + reklOvrig + montorInvoiceCost, hasMontor };
    },
  });

  if (isLoading || !data) return null;

  const usingPayout = data.payout > 0;
  const revenue = usingPayout ? data.payout : (Number(orderValue) || 0);
  const profit = revenue - data.cost;
  const marginPct = revenue > 0 ? Math.round((profit / revenue) * 100) : null;

  const tone = !data.hasMontor
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
          <p className="font-medium text-slate-900">{kr(data.cost)}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Montör {kr(data.montorCost)}{data.sheetCost > 0 ? ` · Plåt ${kr(data.sheetCost)}` : ''}{data.otherCost > 0 ? ` · Övrigt ${kr(data.otherCost)}` : ''}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500 text-xs">Marginal</p>
          {data.hasMontor ? (
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
