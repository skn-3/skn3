// "Mina uppdrag" i montörvyn: montörens A-ordrar, kompletteringar och serviceordrar.
// Inga internal_*-fält hämtas här (se minnet om montörens A-orderdokument).
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, ExternalLink, ClipboardList } from 'lucide-react';
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
import { ORDER_FILTERS, ORDER_KINDS, orderFilterKey, orderSummary, type OrderFilter, type OrderKindFilter } from '@/lib/montorLists';
import { ListSearchToggle, ListSearchField } from './ListSearch';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const COLS =
  'id, order_number, created_at, date, total_amount, status, pdf_path, order_sent_at, invoice_number, invoice_sent_at, credited_from_order_id, paid_at, customer_name, customer_address, description, line_items, order_kind, case_id, team_id, montor_teams(name)';

interface Props {
  /** Teamnamn för montören; null = admin utan eget team (ser alla tillåtna). */
  myTeamName: string | null;
  /** Admins montörfilter ('alla' = ingen filtrering). */
  adminFilter?: string;
  onOpenCase: (caseId: string) => void;
  initialOpenId?: string | null;
  onInitialOpenHandled?: () => void;
  onCountChange?: (count: number) => void;
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

const STATUS_LINE = { order: 'bg-gold', sent: 'bg-sage', invoiced: 'bg-ink', paid: 'bg-success', credited: 'bg-muted-foreground' };
interface Filters { status: OrderFilter; kinds: OrderKindFilter[]; search: string; searchOpen: boolean }
function defaultFilters(): Filters { return { status: 'all', kinds: [], search: '', searchOpen: false }; }
function readFilters(key: string): Filters {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!saved) return defaultFilters();
    return {
      status: ORDER_FILTERS.some(f => f.key === saved.status) ? saved.status : 'all',
      kinds: Array.isArray(saved.kinds) ? saved.kinds.filter((k: OrderKindFilter) => ORDER_KINDS.some(t => t.key === k)) : [],
      search: typeof saved.search === 'string' ? saved.search : '', searchOpen: !!saved.searchOpen,
    };
  } catch { return defaultFilters(); }
}
export function MontorOrdersList({ myTeamName, adminFilter = 'alla', onOpenCase, initialOpenId, onInitialOpenHandled, onCountChange }: Props) {
  const storageKey = `montor-order-filters:${myTeamName || 'admin'}:${adminFilter}`;
  const [filters, setFilters] = useState(() => readFilters(storageKey));
  const [filterKey, setFilterKey] = useState(storageKey);
  if (filterKey !== storageKey) { setFilterKey(storageKey); setFilters(readFilters(storageKey)); }
  const { search, status, kinds, searchOpen } = filters;
  const reducedMotion = useReducedMotion();
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(filters)); } catch { /* Storage may be disabled. */ } }, [storageKey, filters]);
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

  const { data: orders = [], isLoading, isFetched } = useQuery({
    queryKey: ['montor-orders-list', myTeamId],
    enabled: !myTeamName || teamQuery.isFetched,
    queryFn: async () => {
      let q = (supabase as any).from('a_orders').select(COLS).order('date', { ascending: false }).order('created_at', { ascending: false });
      if (myTeamName && !myTeamId) return [];
      if (myTeamId) q = q.eq('team_id', myTeamId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const scoped = useMemo(() => orders.filter(o => adminFilter === 'alla' || o.montor_teams?.name === adminFilter), [orders, adminFilter]);
  useEffect(() => { if (isFetched) onCountChange?.(scoped.length); }, [isFetched, scoped.length, onCountChange]);
  const summary = orderSummary(scoped, new Date().getFullYear());
  const typed = scoped.filter(o => !kinds.length || kinds.includes(o.order_kind || 'standard'));
  const visible = typed.filter(o => {
    if (status !== 'all' && orderFilterKey(o) !== status) return false;
    const t = search.trim().toLowerCase();
    return !t || [o.customer_name, o.customer_address, o.order_number, o.invoice_number].some(f => f != null && String(f).toLowerCase().includes(t));
  });

  useEffect(() => {
    if (!initialOpenId || !isFetched) return;
    if (orders.some(o => o.id === initialOpenId)) {
      setFilters(defaultFilters()); setOpenId(initialOpenId);
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`montor-order-${initialOpenId}`)?.scrollIntoView({ block: 'center' })));
    } else toast.error('Kunde inte hitta ordern');
    onInitialOpenHandled?.();
  }, [initialOpenId, isFetched, orders]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto snap-x pb-1" aria-label="Orderstatus">
        {ORDER_FILTERS.map(f => <Button key={f.key} variant={status === f.key ? 'default' : 'outline'} aria-pressed={status === f.key} onClick={() => setFilters(v => ({ ...v, status: f.key }))} className={`h-11 shrink-0 snap-start rounded-full border-border px-4 ${status === f.key ? 'bg-ink text-primary-foreground' : 'bg-background'}`}>
          {f.label}<span className={`font-mono text-[11px] ${status === f.key ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{typed.filter(o => f.key === 'all' || orderFilterKey(o) === f.key).length}</span>
        </Button>)}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1" aria-label="Ordertyp">
          {ORDER_KINDS.map(k => <Button key={k.key} variant="outline" aria-pressed={kinds.includes(k.key)} onClick={() => setFilters(v => ({ ...v, kinds: v.kinds.includes(k.key) ? v.kinds.filter(x => x !== k.key) : [...v.kinds, k.key] }))} className={`h-11 shrink-0 rounded-full border-border px-3 text-xs ${kinds.includes(k.key) ? 'border-ink bg-gold-soft text-ink' : 'bg-background text-muted-foreground'}`}>{k.label}</Button>)}
        </div>
        <ListSearchToggle open={searchOpen} active={!!search} onToggle={() => setFilters(v => ({ ...v, searchOpen: !v.searchOpen }))} />
      </div>
      {searchOpen && <ListSearchField value={search} onChange={search => setFilters(v => ({ ...v, search }))} placeholder="Sök kund, adress, order- eller fakturanr..." />}
      <div className="grid grid-cols-3 gap-3 border-y border-border py-4">
        <div><div className="font-display text-xl tabular-nums text-ink">{summary.open}</div><div className="text-[11px] text-muted-foreground">öppna</div></div>
        <div><div className="font-display text-xl tabular-nums text-ink break-words">{kr(summary.unpaid)}</div><div className="text-[11px] text-muted-foreground">fakturerat obetalt</div></div>
        <div><div className="font-display text-xl tabular-nums text-ink">{summary.paidThisYear}</div><div className="text-[11px] text-muted-foreground">betalda i år</div></div>
      </div>
      {isLoading || (myTeamName && teamQuery.isLoading) ? (
        <div className="grid gap-2.5 lg:grid-cols-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground"><ClipboardList className="h-8 w-8" /><p>Inga uppdrag matchar filtret</p><Button variant="outline" className="h-11" onClick={() => setFilters(defaultFilters())}>Visa alla</Button></div>
      ) : (
        <div className="grid items-start gap-2.5 lg:grid-cols-2">
        {visible.map(o => {
          const isOpen = openId === o.id;
          const isService = o.order_kind === 'service';
          const isCreditNote = o.status === 'credited' && !!o.credited_from_order_id;
          const lines = normalizeLines(o.line_items);
          const groups = summarizeAOrderStatuses([o]).filter(g => g.total > 0);
          return <article key={o.id} id={`montor-order-${o.id}`} className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card card-lift animate-fade-up motion-reduce:animate-none">
            <span aria-hidden="true" className={`absolute inset-y-4 left-0 w-[3px] rounded-r ${STATUS_LINE[orderFilterKey(o)]}`} />
            <div className="relative p-4">
              <Button variant="ghost" className="absolute inset-0 h-full w-full rounded-2xl p-0 hover:bg-muted/20" aria-label={`${isOpen ? 'Stäng' : 'Visa'} ${ORDER_KIND_LABEL[o.order_kind || 'standard'] || 'Montage'} #${o.order_number}, ${o.customer_address || o.customer_name}`} aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : o.id)} />
              <div className="pointer-events-none relative space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-border text-[11px] font-normal uppercase tracking-normal">{ORDER_KIND_LABEL[o.order_kind || 'standard'] ?? 'Montage'}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">#{o.order_number ?? '—'}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{o.date}</span>
                </div>
                <div><h3 className="font-display text-[17px] font-semibold leading-snug tracking-normal break-words">{o.customer_address || 'Adress saknas'}</h3><p className="mt-1 text-sm text-muted-foreground break-words">{o.customer_name || '—'}</p></div>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0"><div className="pointer-events-auto relative w-fit">{groups.length > 0 && <AOrderStatusDots groups={groups} appearance="installer" />}</div><p className="text-xs text-muted-foreground break-words">{statusText(o)}</p></div>
                  <div className="shrink-0 text-right"><div className="font-display text-lg tabular-nums tracking-normal">{kr(o.total_amount)}</div><div className="text-[11px] text-muted-foreground">ex moms</div></div>
                </div>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {isOpen && <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.24 }} className="overflow-hidden">
                <div className="space-y-4 border-t border-border p-4 animate-fade-up motion-reduce:animate-none text-sm">
                  {o.description?.trim() && <div><div className="mb-2 text-[11px] uppercase text-muted-foreground">{isService ? 'Utfört arbete' : 'Beskrivning'}</div><RichText text={o.description} /></div>}
                  {lines.length > 0 && <div className="divide-y divide-border">
                    {lines.map(l => <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2"><div className="min-w-0 break-words">{l.name}<div className="text-xs text-muted-foreground">{l.qty} × {kr(l.unit_price)}</div></div><span className="tabular-nums">{kr(l.amount)}</span></div>)}
                    <div className="flex justify-between gap-3 pt-3 font-semibold"><span>Summa</span><span className="tabular-nums">{kr(o.total_amount)}</span></div>
                  </div>}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {isCreditNote ? o.pdf_path && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(o.pdf_path, creditPdfName(o))}><FileText />Kreditfaktura</Button> : <>
                      {o.order_sent_at && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(`a-orders/${o.id}.pdf`, aOrderPdfName(o))}><FileText />{isService ? 'Serviceorder PDF' : 'A-order PDF'}</Button>}
                      {o.invoice_number && o.invoice_sent_at && o.pdf_path && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(`a-orders/${o.id}-faktura.pdf`, invoicePdfName(o))}><FileText />Faktura</Button>}
                    </>}
                    {o.case_id && <Button variant="outline" className="h-12 sm:h-11" onClick={() => onOpenCase(o.case_id)}><ExternalLink />Öppna ärendet</Button>}
                  </div>
                </div>
              </motion.div>}
            </AnimatePresence>
          </article>;
        })}
        </div>
      )}
    </div>
  );
}
