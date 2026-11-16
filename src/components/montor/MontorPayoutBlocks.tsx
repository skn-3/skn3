// "Utbetalningar" och "Avdrag" i Mina uppdrag – bara eget team.
// Montören ser bara skickade och betalda utbetalningsspecifikationer (RLS) och sina
// egna avdrag (debetfakturor kind 'debit'). Inga interna fält hämtas.
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatDaySv } from '@/lib/dateSv';
import { deductionStatusText, formatKr, settlementStatusText, type SettlementItemLike } from '@/lib/montorSettlement';
import { montorInvoicePdfName, settlementPdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';

const db = supabase as any;

async function openPdf(path: string, name: string) {
  const ok = await openDocumentInNewTab(async () => {
    const { data } = await supabase.storage.from('case-documents').createSignedUrl(path, 600, { download: name });
    return data?.signedUrl ?? null;
  });
  if (!ok) toast.error('PDF:en kunde inte öppnas');
}

export function MontorPayoutBlocks({ teamId }: { teamId: string | null }) {
  const { data } = useQuery({
    queryKey: ['montor-payout-blocks', teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const [s, d] = await Promise.all([
        db.from('montor_settlements').select('id, settlement_number, settlement_date, company_name, net_amount, status, paid_at, pdf_path')
          .eq('team_id', teamId).in('status', ['sent', 'paid']).order('settlement_date', { ascending: false }),
        db.from('montor_debit_invoices').select('id, invoice_number, date, title, description, total, status, paid_at, settle_mode, pdf_path, kind, credited_from_invoice_id, debit_type, montor_teams(name)')
          .eq('team_id', teamId).eq('kind', 'debit').gt('total', 0).order('date', { ascending: false }),
      ]);
      if (s.error) throw s.error;
      if (d.error) throw d.error;
      const ids = (d.data ?? []).map((x: any) => x.id);
      let items: SettlementItemLike[] = [];
      if (ids.length) {
        const { data: it, error } = await db.from('montor_settlement_items')
          .select('item_kind, a_order_id, debit_invoice_id, amount, active, montor_settlements!inner(settlement_number, status)')
          .in('debit_invoice_id', ids).eq('active', true).in('montor_settlements.status', ['sent', 'paid']);
        if (error) throw error;
        items = (it ?? []).map((x: any) => ({ ...x, settlement_number: x.montor_settlements?.settlement_number ?? null, settlement_status: x.montor_settlements?.status ?? null }));
      }
      return { settlements: (s.data ?? []) as any[], deductions: (d.data ?? []) as any[], items };
    },
  });
  if (!teamId || !data || (!data.settlements.length && !data.deductions.length)) return null;

  return (
    <div className="grid items-start gap-2.5 lg:grid-cols-2">
      {data.settlements.length > 0 && (
        <section aria-labelledby="montor-utbetalningar" className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <h3 id="montor-utbetalningar" className="font-display text-[17px] font-semibold">Utbetalningar</h3>
          <ul className="mt-2 divide-y divide-border">
            {data.settlements.map(s => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-xs text-muted-foreground">{s.settlement_number}</span><span className="text-xs text-muted-foreground">{formatDaySv(s.settlement_date)}</span></div>
                  <div className={`text-xs ${s.status === 'paid' ? 'text-success' : 'text-muted-foreground'}`}>{s.status === 'paid' ? `Betald ${formatDaySv(s.paid_at)}` : settlementStatusText(s)}</div>
                </div>
                <div className="text-right"><div className="font-display text-lg tabular-nums">{formatKr(s.net_amount)}</div><div className="text-[10px] uppercase tracking-[1px] text-muted-foreground/80">att utbetala</div></div>
                {s.pdf_path && <Button variant="outline" className="h-11" onClick={() => openPdf(s.pdf_path, settlementPdfName(s))}><FileText />PDF</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.deductions.length > 0 && (
        <section aria-labelledby="montor-avdrag" className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <h3 id="montor-avdrag" className="font-display text-[17px] font-semibold">Avdrag</h3>
          <ul className="mt-2 divide-y divide-border">
            {data.deductions.map(d => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-xs text-muted-foreground">{d.invoice_number}</span><span className="text-xs text-muted-foreground">{formatDaySv(d.date)}</span></div>
                  <div className="break-words text-sm">{d.description || d.title || 'Avdrag'}</div>
                  <div className="text-xs text-muted-foreground">{deductionStatusText(d, data.items)}</div>
                </div>
                <div className="font-display text-lg tabular-nums text-muted-foreground">−{formatKr(d.total)}</div>
                {d.pdf_path && <Button variant="outline" className="h-11" onClick={() => openPdf(d.pdf_path, montorInvoicePdfName(d))}><FileText />PDF</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
