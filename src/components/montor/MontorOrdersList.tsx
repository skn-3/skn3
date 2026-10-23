// "Mina uppdrag" i montörvyn: montörens A-ordrar, kompletteringar och serviceordrar.
// Inga internal_*-fält hämtas här (se minnet om montörens A-orderdokument).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search, ChevronDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RichText } from '@/components/shared/RichText';
import { AOrderStatusDots } from '@/components/aorders/AOrderStatusDots';
import { summarizeAOrderStatuses } from '@/lib/aOrderStatusSummary';
import { normalizeLines } from '@/lib/aOrderLines';
import { aOrderPdfName, invoicePdfName, creditPdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { ORDER_KIND_LABEL } from '@/lib/serviceOrder';

const COLS =
  'id, order_number, created_at, date, total_amount, status, pdf_path, order_sent_at, invoice_number, invoice_sent_at, credited_from_order_id, paid_at, customer_name, customer_address, description, line_items, order_kind, case_id, team_id, montor_teams(name)';

interface Props {
  /** Teamnamn för montören; null = admin utan eget team (ser alla tillåtna). */
  myTeamName: string | null;
  /** Admins montörfilter ('alla' = ingen filtrering). */
  adminFilter?: string;
  onOpenCase: (caseId: string) => void;
}

function kr(n: number) { return Math.round(Number(n) || 0).toLocaleString('sv-SE') + ' kr'; }

function statusText(o: any): string {
  if (o.status === 'credited') return o.credited_from_order_id ? `Kreditfaktura ${o.invoice_number ?? ''}`.trim() : 'Krediterad';
  if (o.status === 'invoiced' && o.paid_at) return `Betald ${o.paid_at}`;
  if (o.status === 'invoiced') return `Fakturerad ${o.invoice_number ?? ''}`.trim();
  if (o.order_sent_at) return 'Skickad';
  return 'Order';
}

async function openPdf(path: string, name: string) {
  const ok = await openDocumentInNewTab(async () => {
    const { data } = await supabase.storage.from('case-documents').createSignedUrl(path, 600, { download: name });
    return data?.signedUrl ?? null;
  });
  if (!ok) toast.error('PDF:en kunde inte öppnas');
}

export function MontorOrdersList({ myTeamName, adminFilter = 'alla', onOpenCase }: Props) {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const teamQuery = useQuery({
    queryKey: ['montor-team', myTeamName],
    enabled: !!myTeamName,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('id, name').eq('name', myTeamName).maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; name: string } | null;
    },
  });
  const myTeamId = teamQuery.data?.id ?? null;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['montor-orders-list', myTeamId],
    enabled: !myTeamName || teamQuery.isFetched,
    queryFn: async () => {
      let q = (supabase as any).from('a_orders').select(COLS).order('date', { ascending: false }).order('created_at', { ascending: false });
      if (myTeamId) q = q.eq('team_id', myTeamId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (adminFilter !== 'alla' && o.montor_teams?.name !== adminFilter) return false;
      if (!t) return true;
      return [o.customer_name, o.customer_address, o.order_number, o.invoice_number]
        .some((f) => f != null && String(f).toLowerCase().includes(t));
    });
  }, [orders, search, adminFilter]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök kund, adress, order- eller fakturanr..."
          className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">Inga uppdrag ännu.</p>
      ) : (
        visible.map((o) => {
          const isOpen = openId === o.id;
          const isService = o.order_kind === 'service';
          const isCreditNote = o.status === 'credited' && !!o.credited_from_order_id;
          const lines = normalizeLines(o.line_items);
          const groups = summarizeAOrderStatuses([o]).filter((g) => g.total > 0);
          return (
            <div key={o.id} className="rounded-lg border bg-card text-sm">
              <button
                type="button"
                className="w-full text-left p-3 space-y-1 min-h-[48px]"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : o.id)}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[11px] font-normal">{ORDER_KIND_LABEL[o.order_kind || 'standard'] ?? 'Montage'}</Badge>
                  <span className="font-medium font-mono">#{o.order_number ?? '—'}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{o.date}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
                <div className="truncate">{[o.customer_name, o.customer_address].filter(Boolean).join(' · ') || '—'}</div>
                <div className="flex items-center gap-2">
                  {groups.length > 0 && (
                    <span onClick={(e) => e.stopPropagation()}><AOrderStatusDots groups={groups} /></span>
                  )}
                  <span className="text-xs text-muted-foreground">{statusText(o)}</span>
                  <span className={`ml-auto font-semibold whitespace-nowrap ${Number(o.total_amount) < 0 ? 'text-destructive' : ''}`}>
                    {kr(o.total_amount)} <span className="text-[10px] font-normal text-muted-foreground">ex moms</span>
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t p-3 space-y-3">
                  {o.description?.trim() && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{isService ? 'Utfört arbete' : 'Beskrivning'}</div>
                      <RichText text={o.description} />
                    </div>
                  )}
                  {lines.length > 0 && (
                    <div className="space-y-1">
                      {lines.map((l) => (
                        <div key={l.id} className="flex justify-between gap-3">
                          <span className="min-w-0">{l.name} <span className="text-muted-foreground">· {l.qty} × {l.unit_price.toLocaleString('sv-SE')}</span></span>
                          <span className="whitespace-nowrap">{kr(l.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-1 font-semibold">
                        <span>Summa</span><span>{kr(o.total_amount)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {isCreditNote ? (
                      o.pdf_path && (
                        <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => openPdf(o.pdf_path, creditPdfName(o))}>
                          <FileText className="h-4 w-4 mr-1" /> Kreditfaktura
                        </Button>
                      )
                    ) : (
                      <>
                        {o.order_sent_at && (
                          <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => openPdf(`a-orders/${o.id}.pdf`, aOrderPdfName(o))}>
                            <FileText className="h-4 w-4 mr-1" /> {isService ? 'Serviceorder PDF' : 'A-order PDF'}
                          </Button>
                        )}
                        {o.invoice_number && o.invoice_sent_at && o.pdf_path && (
                          <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => openPdf(`a-orders/${o.id}-faktura.pdf`, invoicePdfName(o))}>
                            <FileText className="h-4 w-4 mr-1" /> Faktura
                          </Button>
                        )}
                      </>
                    )}
                    {o.case_id && (
                      <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => onOpenCase(o.case_id)}>
                        <ExternalLink className="h-4 w-4 mr-1" /> Öppna ärendet
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
