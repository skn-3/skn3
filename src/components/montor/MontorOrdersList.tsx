// "Mina uppdrag" i montörvyn: montörens A-ordrar, kompletteringar, serviceordrar och egna fakturor.
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
import { normalizeLines } from '@/lib/aOrderLines';
import { aOrderPdfName, invoicePdfName, creditPdfName, montorInvoicePdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { ORDER_KIND_LABEL } from '@/lib/serviceOrder';
import { formatDaySv } from '@/lib/dateSv';
import {
  ORDER_FILTERS, ORDER_KINDS, orderFilterKey, invoiceFilterKey, isInvoiceCredit, montorSummary,
  type OrderFilter, type OrderKindFilter,
} from '@/lib/montorLists';
import { ListSearchToggle, ListSearchField } from './ListSearch';
import { ScrollFadeRow } from './ScrollFadeRow';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const COLS =
  'id, order_number, created_at, date, total_amount, status, pdf_path, order_sent_at, invoice_number, invoice_sent_at, credited_from_order_id, paid_at, customer_name, customer_address, description, line_items, order_kind, case_id, team_id, montor_teams(name)';
const INVOICE_COLS =
  'id, invoice_number, date, title, description, line_items, subtotal, vat_mode, total, status, kind, pdf_path, sent_at, paid_at, case_id, credited_from_invoice_id, montor_teams(name)';

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

function orderStatusText(o: any): string {
  if (o.status === 'credited') return o.credited_from_order_id ? `Kreditfaktura ${o.invoice_number ?? ''}`.trim() : 'Krediterad';
  if (o.status === 'invoiced' && o.paid_at) return `Betald ${formatDaySv(o.paid_at)}`;
  if (o.status === 'invoiced') return [`Fakturerad ${o.invoice_number ?? ''}`.trim(), formatDaySv(o.invoice_sent_at)].filter(Boolean).join(' · ');
  if (o.order_sent_at) return `Skickad ${formatDaySv(o.order_sent_at)}`;
  return 'Order';
}
function invoiceStatusText(i: any): string {
  if (i.status === 'cancelled') return 'Makulerad';
  if (i.status === 'credited') return 'Krediterad';
  if (i.paid_at || i.status === 'paid') return `Betald ${formatDaySv(i.paid_at || i.date)}`.trim();
  if (i.status === 'sent') return 'Fakturerad';
  return 'Utkast';
}

async function openPdf(path: string, name: string) {
  const ok = await openDocumentInNewTab(async () => {
    const { data } = await supabase.storage.from('case-documents').createSignedUrl(path, 600, { download: name });
    return data?.signedUrl ?? null;
  });
  if (!ok) toast.error('PDF:en kunde inte öppnas');
}

const STATUS_LINE = { order: 'bg-gold', sent: 'bg-sage', invoiced: 'bg-ink', paid: 'bg-success', credited: 'bg-muted-foreground' };
const CHIP = 'h-10 shrink-0 rounded-full border px-3 text-[13px] font-medium';
const CHIP_ON = 'border-ink bg-gold-soft text-ink hover:bg-gold-soft';
const CHIP_OFF = 'border-border bg-background text-muted-foreground';

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

type Item =
  | { src: 'order'; id: string; date: string; kind: OrderKindFilter; key: Exclude<OrderFilter, 'all'>; row: any }
  | { src: 'invoice'; id: string; date: string; kind: 'fakturor'; key: Exclude<OrderFilter, 'all'>; row: any };

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

  const { data: invoices = [] } = useQuery({
    queryKey: ['montor-own-invoices', myTeamId],
    enabled: !myTeamName || teamQuery.isFetched,
    queryFn: async () => {
      if (myTeamName && !myTeamId) return [];
      let q = (supabase as any).from('montor_debit_invoices').select(INVOICE_COLS).order('date', { ascending: false });
      if (myTeamId) q = q.eq('team_id', myTeamId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const inScope = (r: any) => adminFilter === 'alla' || r.montor_teams?.name === adminFilter;
  const scopedOrders = useMemo(() => orders.filter(inScope), [orders, adminFilter]);
  const scopedInvoices = useMemo(() => invoices.filter(inScope), [invoices, adminFilter]);
  const items: Item[] = useMemo(() => [
    ...scopedOrders.map(o => ({ src: 'order' as const, id: o.id, date: o.date || o.created_at?.slice(0, 10) || '', kind: (o.order_kind || 'standard') as OrderKindFilter, key: orderFilterKey(o), row: o })),
    ...scopedInvoices.map(i => ({ src: 'invoice' as const, id: i.id, date: i.date || '', kind: 'fakturor' as const, key: invoiceFilterKey(i), row: i })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [scopedOrders, scopedInvoices]);

  useEffect(() => { if (isFetched) onCountChange?.(items.length); }, [isFetched, items.length, onCountChange]);
  const year = new Date().getFullYear();
  const summary = montorSummary(scopedOrders, scopedInvoices, year);
  const typed = items.filter(it => !kinds.length || kinds.includes(it.kind));
  const visible = typed.filter(it => {
    if (status !== 'all' && it.key !== status) return false;
    const t = search.trim().toLowerCase();
    if (!t) return true;
    const r = it.row;
    const fields = it.src === 'order' ? [r.customer_name, r.customer_address, r.order_number, r.invoice_number] : [r.title, r.invoice_number];
    return fields.some(f => f != null && String(f).toLowerCase().includes(t));
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
    <div className="space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <ScrollFadeRow label="Filtrera uppdrag">
          {ORDER_FILTERS.map(f => <Button key={f.key} variant="outline" aria-pressed={status === f.key} onClick={() => setFilters(v => ({ ...v, status: f.key }))} className={`${CHIP} ${status === f.key ? CHIP_ON : CHIP_OFF}`}>
            {f.label}<span className="font-mono text-[11px] opacity-70">{typed.filter(it => f.key === 'all' || it.key === f.key).length}</span>
          </Button>)}
          <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
          {ORDER_KINDS.map(k => <Button key={k.key} variant="outline" aria-pressed={kinds.includes(k.key)} onClick={() => setFilters(v => ({ ...v, kinds: v.kinds.includes(k.key) ? v.kinds.filter(x => x !== k.key) : [...v.kinds, k.key] }))} className={`${CHIP} ${kinds.includes(k.key) ? CHIP_ON : CHIP_OFF}`}>{k.label}</Button>)}
        </ScrollFadeRow>
        <ListSearchToggle open={searchOpen} active={!!search} onToggle={() => setFilters(v => ({ ...v, searchOpen: !v.searchOpen }))} />
      </div>
      {searchOpen && <ListSearchField value={search} onChange={search => setFilters(v => ({ ...v, search }))} placeholder="Sök kund, adress, titel, order- eller fakturanr..." />}

      <div className="grid max-w-[560px] grid-cols-2 gap-2.5">
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-[1.3px] text-muted-foreground">Utestående</div>
          <div className="mt-1 font-display text-2xl tabular-nums text-ink break-words">{kr(summary.outstanding)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{summary.pendingCount} pågående · {kr(summary.waiting)} väntar på betalning</div>
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-[1.3px] text-muted-foreground">Intjänat {year}</div>
          <div className="mt-1 font-display text-2xl tabular-nums text-ink break-words">{kr(summary.earned)}</div>
          <div className="mt-1 text-xs text-muted-foreground">varav {kr(summary.paidOut)} utbetalt</div>
        </div>
      </div>

      {isLoading || (myTeamName && teamQuery.isLoading) ? (
        <div className="grid gap-2.5 lg:grid-cols-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground"><ClipboardList className="h-8 w-8" /><p>Inga uppdrag matchar filtret</p><Button variant="outline" className="h-11" onClick={() => setFilters(defaultFilters())}>Visa alla</Button></div>
      ) : (
        <div className="grid items-start gap-2.5 lg:grid-cols-2">
          {visible.map(it => it.src === 'order'
            ? <OrderCard key={it.id} o={it.row} isOpen={openId === it.id} reducedMotion={!!reducedMotion} onToggle={() => setOpenId(openId === it.id ? null : it.id)} onOpenCase={onOpenCase} />
            : <InvoiceCard key={it.id} i={it.row} isOpen={openId === it.id} reducedMotion={!!reducedMotion} onToggle={() => setOpenId(openId === it.id ? null : it.id)} onOpenCase={onOpenCase} />)}
        </div>
      )}
    </div>
  );
}

interface CardShellProps {
  id: string; lineKey: keyof typeof STATUS_LINE; label: string; isOpen: boolean; reducedMotion: boolean; onToggle: () => void;
  chip: string; number: string; date: string; title: string; subtitle: string; statusText: string; amount: number; negative: boolean;
  children: React.ReactNode;
}
function CardShell(p: CardShellProps) {
  return <article id={`montor-order-${p.id}`} className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-card card-lift animate-fade-up motion-reduce:animate-none">
    <span aria-hidden="true" className={`absolute inset-y-4 left-0 w-[3px] rounded-r ${STATUS_LINE[p.lineKey]}`} />
    <div className="relative p-4">
      <Button variant="ghost" className="absolute inset-0 h-full w-full rounded-2xl p-0 hover:bg-muted/20" aria-label={`${p.isOpen ? 'Stäng' : 'Visa'} ${p.label}`} aria-expanded={p.isOpen} onClick={p.onToggle} />
      <div className="pointer-events-none relative space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border text-[11px] font-normal uppercase tracking-normal">{p.chip}</Badge>
          {p.number && <span className="font-mono text-xs text-muted-foreground">{p.number}</span>}
          <span className="ml-auto text-xs text-muted-foreground">{p.date}</span>
        </div>
        <div><h3 className="font-display text-[17px] font-semibold leading-snug tracking-normal break-words">{p.title}</h3><p className="mt-1 text-sm text-muted-foreground break-words">{p.subtitle}</p></div>
        <div className="flex items-end justify-between gap-2">
          <p className={`flex min-w-0 items-center gap-2 text-xs break-words ${p.lineKey === 'paid' ? 'text-success' : 'text-muted-foreground'}`}>
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STATUS_LINE[p.lineKey]}`} />{p.statusText}
          </p>
          <div className="shrink-0 text-right">
            <div className={`font-display text-lg tabular-nums tracking-normal ${p.negative ? 'text-muted-foreground' : ''}`}>{p.negative ? '−' : ''}{kr(Math.abs(p.amount))}</div>
            <div className="text-[10px] font-normal uppercase tracking-[1px] text-muted-foreground/80">ex moms</div>
          </div>
        </div>
      </div>
    </div>
    <AnimatePresence initial={false}>
      {p.isOpen && <motion.div key="details" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: p.reducedMotion ? 0 : 0.24 }} className="overflow-hidden">
        <div className="space-y-4 border-t border-border p-4 animate-fade-up motion-reduce:animate-none text-sm">{p.children}</div>
      </motion.div>}
    </AnimatePresence>
  </article>;
}

function Lines({ items, total }: { items: any; total: number }) {
  const lines = normalizeLines(items);
  if (!lines.length) return null;
  return <div className="divide-y divide-border">
    {lines.map(l => <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2"><div className="min-w-0 break-words">{l.name}<div className="text-xs text-muted-foreground">{l.qty} × {kr(l.unit_price)}</div></div><span className="tabular-nums">{kr(l.amount)}</span></div>)}
    <div className="flex justify-between gap-3 pt-3 font-semibold"><span>Summa</span><span className="tabular-nums">{kr(total)}</span></div>
  </div>;
}

function OrderCard({ o, isOpen, reducedMotion, onToggle, onOpenCase }: { o: any; isOpen: boolean; reducedMotion: boolean; onToggle: () => void; onOpenCase: (id: string) => void }) {
  const isService = o.order_kind === 'service';
  const isCreditNote = o.status === 'credited' && !!o.credited_from_order_id;
  const kindLabel = ORDER_KIND_LABEL[o.order_kind || 'standard'] ?? 'Montage';
  return <CardShell id={o.id} lineKey={orderFilterKey(o)} isOpen={isOpen} reducedMotion={reducedMotion} onToggle={onToggle}
    label={`${kindLabel} #${o.order_number}, ${o.customer_address || o.customer_name}`}
    chip={isCreditNote ? 'Kreditfaktura' : kindLabel} number={`#${o.order_number ?? '—'}`} date={formatDaySv(o.date || o.created_at)}
    title={o.customer_address || 'Adress saknas'} subtitle={o.customer_name || '—'} statusText={orderStatusText(o)}
    amount={Number(o.total_amount) || 0} negative={(Number(o.total_amount) || 0) < 0}>
    {o.description?.trim() && <div><div className="mb-2 text-[11px] uppercase text-muted-foreground">{isService ? 'Utfört arbete' : 'Beskrivning'}</div><RichText text={o.description} /></div>}
    <Lines items={o.line_items} total={o.total_amount} />
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {isCreditNote ? o.pdf_path && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(o.pdf_path, creditPdfName(o))}><FileText />Kreditfaktura</Button> : <>
        {o.order_sent_at && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(`a-orders/${o.id}.pdf`, aOrderPdfName(o))}><FileText />{isService ? 'Serviceorder PDF' : 'A-order PDF'}</Button>}
        {o.invoice_number && o.invoice_sent_at && o.pdf_path && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(`a-orders/${o.id}-faktura.pdf`, invoicePdfName(o))}><FileText />Faktura</Button>}
      </>}
      {o.case_id && <Button variant="outline" className="h-12 sm:h-11" onClick={() => onOpenCase(o.case_id)}><ExternalLink />Öppna ärendet</Button>}
    </div>
  </CardShell>;
}

function InvoiceCard({ i, isOpen, reducedMotion, onToggle, onOpenCase }: { i: any; isOpen: boolean; reducedMotion: boolean; onToggle: () => void; onOpenCase: (id: string) => void }) {
  const credit = isInvoiceCredit(i);
  const debit = i.kind === 'debit';
  const chip = credit ? 'Kreditfaktura' : debit ? 'Debitering' : 'Faktura';
  const title = i.title || chip;
  const subtitle = debit && !credit ? 'Att betala till N3prenad'
    : /kontrollm[äa]tning/i.test(title) ? `KM-faktura ${i.invoice_number ?? ''}`.trim() : `Faktura ${i.invoice_number ?? ''}`.trim();
  const total = Number(i.total) || 0;
  return <CardShell id={i.id} lineKey={invoiceFilterKey(i)} isOpen={isOpen} reducedMotion={reducedMotion} onToggle={onToggle}
    label={`${chip} ${i.invoice_number ?? ''}, ${title}`}
    chip={chip} number={i.invoice_number ?? ''} date={formatDaySv(i.date)} title={title} subtitle={subtitle}
    statusText={invoiceStatusText(i)} amount={debit || credit ? -Math.abs(total) : total} negative={debit || credit}>
    {i.description?.trim() && <div><div className="mb-2 text-[11px] uppercase text-muted-foreground">Beskrivning</div><p className="whitespace-pre-line break-words">{i.description}</p></div>}
    <Lines items={i.line_items} total={i.subtotal ?? total} />
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {i.pdf_path && <Button variant="outline" className="h-12 sm:h-11" onClick={() => openPdf(i.pdf_path, montorInvoicePdfName(i))}><FileText />Faktura (PDF)</Button>}
      {i.case_id && <Button variant="outline" className="h-12 sm:h-11" onClick={() => onOpenCase(i.case_id)}><ExternalLink />Öppna ärendet</Button>}
    </div>
  </CardShell>;
}
