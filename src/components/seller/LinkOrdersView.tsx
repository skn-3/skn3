import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { listUnlinkedOrders, linkCase as gwLinkCase, type OrderRow } from '@/integrations/orderGateway';
import { createCaseEvent } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatAmount } from '@/lib/utils';
import { AlertTriangle, Search, Link2 } from 'lucide-react';

interface LinkOrdersViewProps {
  currentUser: string;
}

type CaseLite = {
  id: string;
  customer_name: string | null;
  address: string | null;
  city: string | null;
  order_number: string | null;
};

type Strength = 'high' | 'medium' | 'low' | 'none';
type Match = { caseRow: CaseLite | null; strength: Strength; reasons: string[]; score: number };

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFC').trim();
const stripDiacritics = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const tokens = (s: any) =>
  stripDiacritics(norm(s))
    .replace(/[^a-z0-9åäö\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);

function tokenOverlap(a: string, b: string) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  ta.forEach(t => { if (tb.has(t)) hit++; });
  return hit / Math.min(ta.size, tb.size);
}

function streetMatch(a: any, b: any) {
  // extract first chunk: "Storgatan 12, 12345 Stockholm" -> "storgatan 12"
  const first = (x: any) => stripDiacritics(norm(x)).split(',')[0].trim();
  const fa = first(a);
  const fb = first(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;
  // street name + number
  const numA = fa.match(/\d+/)?.[0];
  const numB = fb.match(/\d+/)?.[0];
  const ovl = tokenOverlap(fa, fb);
  if (numA && numB && numA === numB && ovl >= 0.5) return 1;
  return ovl;
}

function scoreOrderAgainstCase(order: OrderRow, c: CaseLite): Match {
  const reasons: string[] = [];
  let score = 0;
  let strength: Strength = 'none';

  const orderNum = norm(order.order_number);
  const caseNum = norm(c.order_number);
  if (orderNum && caseNum && orderNum === caseNum) {
    score += 100;
    reasons.push('ordernummer');
    strength = 'high';
  }

  const addrScore = streetMatch(order.customer_address, c.address);
  if (addrScore >= 0.8) {
    score += 60;
    reasons.push('adress');
    if (strength !== 'high') strength = 'high';
  } else if (addrScore >= 0.4) {
    score += 25;
    reasons.push('adress (delvis)');
    if (strength === 'none') strength = 'medium';
  }

  const nameOvl = tokenOverlap(order.customer_name, c.customer_name);
  if (nameOvl >= 0.5) {
    score += 30;
    reasons.push('namn');
    if (strength === 'none') strength = 'medium';
  } else if (nameOvl > 0) {
    score += 10;
    if (strength === 'none') strength = 'low';
  }

  return { caseRow: c, strength, reasons, score };
}

function bestMatch(order: OrderRow, cases: CaseLite[]): Match {
  let best: Match = { caseRow: null, strength: 'none', reasons: [], score: 0 };
  for (const c of cases) {
    const m = scoreOrderAgainstCase(order, c);
    if (m.score > best.score) best = m;
  }
  return best;
}

const strengthBadge: Record<Strength, { label: string; cls: string }> = {
  high:   { label: 'Hög träff',   cls: 'bg-green-100 text-green-800 border-green-300' },
  medium: { label: 'Medel träff', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  low:    { label: 'Låg träff',   cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  none:   { label: 'Ingen träff', cls: 'bg-muted text-muted-foreground border-border' },
};

export function LinkOrdersView({ currentUser }: LinkOrdersViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [manualPick, setManualPick] = useState<Record<string, CaseLite | null>>({});
  const [pendingLink, setPendingLink] = useState<{ order: OrderRow; caseRow: CaseLite } | null>(null);

  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['link-orders-cases'],
    queryFn: async (): Promise<CaseLite[]> => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, customer_name, address, city, order_number');
      if (error) throw error;
      return (data || []) as CaseLite[];
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['link-orders-unlinked', cases.length],
    queryFn: async () => {
      const ids = cases.map(c => c.id);
      return await listUnlinkedOrders(ids);
    },
    enabled: cases.length > 0 || !casesLoading,
  });

  const rows = useMemo(() => {
    return orders
      .map(o => ({ order: o, match: bestMatch(o, cases) }))
      .sort((a, b) => b.match.score - a.match.score);
  }, [orders, cases]);

  const filteredRows = useMemo(() => {
    const q = norm(search);
    if (!q) return rows;
    return rows.filter(({ order }) =>
      norm(order.order_number).includes(q) ||
      norm(order.invoice_number).includes(q) ||
      norm(order.customer_name).includes(q) ||
      norm(order.customer_address).includes(q),
    );
  }, [rows, search]);

  const linkMut = useMutation({
    mutationFn: async ({ order, caseRow }: { order: OrderRow; caseRow: CaseLite }) => {
      const ok = await gwLinkCase(order.id, caseRow.id);
      if (!ok) throw new Error('gateway link_case failed');
      const label = order.order_number || order.invoice_number || String(order.id).slice(0, 8);
      const desc = order._orphan
        ? `Order ${label} omkopplad (tidigare felaktigt case_id: ${order._orphanCaseId})`
        : `Order ${label} kopplad till ärende (förslag från Koppla ordrar)`;
      await createCaseEvent({
        case_id: caseRow.id,
        event_type: 'order_link',
        description: desc,
        created_by: currentUser,
      });
      logActivity({
        category: 'system',
        action: 'order_linked',
        description: `Kopplade order ${label} till ${caseRow.address || caseRow.customer_name}`,
        case_id: caseRow.id,
        metadata: { order_id: order.id, order_label: label, was_orphan: !!order._orphan, source: 'link-orders-view' },
      });
      return { order, caseRow };
    },
    onSuccess: ({ order }) => {
      toast.success('Order kopplad');
      setPendingLink(null);
      setManualPick(prev => { const n = { ...prev }; delete n[String(order.id)]; return n; });
      queryClient.invalidateQueries({ queryKey: ['link-orders-unlinked'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['linked-orders'] });
    },
    onError: (e: any) => {
      console.warn('link order failed', e);
      toast.error('Kunde inte koppla order');
    },
  });

  if (casesLoading || ordersLoading) {
    return <div className="p-6 text-muted-foreground">Laddar okopplade ordrar…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold">Koppla ordrar</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} okopplade ordrar. Höga träffar visas överst — bekräfta för att koppla.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök order eller kund…"
            className="pl-8"
          />
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">Inga okopplade ordrar.</Card>
      ) : (
        <div className="space-y-3">
          {filteredRows.map(({ order, match }) => {
            const id = String(order.id);
            const picked = manualPick[id] ?? match.caseRow;
            const isManual = !!manualPick[id];
            const sb = strengthBadge[isManual ? 'high' : match.strength];
            return (
              <Card key={id} className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto] gap-4 items-start">
                  {/* Order info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {order.order_number ? `Order #${order.order_number}` : (order.invoice_number ? `Faktura ${order.invoice_number}` : 'Order')}
                      </span>
                      {order._orphan && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Tidigare kopplad till raderat ärende
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm">{order.customer_name || <em className="text-muted-foreground">Saknar namn</em>}</div>
                    <div className="text-sm text-muted-foreground">{order.customer_address || '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {order.date ? new Date(order.date).toLocaleDateString('sv-SE') : ''}
                      {order.total_amount != null ? ` · ${formatAmount(order.total_amount)} kr` : ''}
                    </div>
                  </div>

                  <div className="hidden lg:flex items-center justify-center text-muted-foreground">→</div>

                  {/* Suggested case */}
                  <div className="space-y-1">
                    {picked ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{picked.customer_name || 'Okänt namn'}</span>
                          <Badge variant="outline" className={sb.cls}>{sb.label}</Badge>
                          {!isManual && match.reasons.length > 0 && (
                            <span className="text-xs text-muted-foreground">matchar på {match.reasons.join(' + ')}</span>
                          )}
                          {isManual && <span className="text-xs text-muted-foreground">valt manuellt</span>}
                        </div>
                        <div className="text-sm text-muted-foreground">{picked.address || '—'}</div>
                        {picked.order_number && (
                          <div className="text-xs text-muted-foreground">Ärendets order: {picked.order_number}</div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">Ingen kandidat — välj manuellt</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 items-stretch lg:items-end">
                    <Button
                      size="sm"
                      disabled={!picked || linkMut.isPending}
                      onClick={() => picked && setPendingLink({ order, caseRow: picked })}
                    >
                      <Link2 className="h-4 w-4" />
                      Koppla
                    </Button>
                    <ManualPicker
                      cases={cases}
                      onPick={(c) => setManualPick(prev => ({ ...prev, [id]: c }))}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingLink} onOpenChange={(o) => !o && setPendingLink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Koppla order till ärende?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLink && (
                <>
                  Kopplar <strong>{pendingLink.order.order_number ? `#${pendingLink.order.order_number}` : pendingLink.order.invoice_number}</strong>
                  {' '}({pendingLink.order.customer_name || '—'}) till ärendet{' '}
                  <strong>{pendingLink.caseRow.customer_name}</strong> — {pendingLink.caseRow.address}.
                  {pendingLink.order._orphan && ' Ordern var tidigare kopplad till ett raderat ärende.'}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (pendingLink) linkMut.mutate(pendingLink); }}
              disabled={linkMut.isPending}
            >
              Bekräfta koppling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManualPicker({ cases, onPick }: { cases: CaseLite[]; onPick: (c: CaseLite) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const nq = norm(q);
    if (!nq) return cases.slice(0, 30);
    return cases
      .filter(c =>
        norm(c.customer_name).includes(nq) ||
        norm(c.address).includes(nq) ||
        norm(c.order_number).includes(nq),
      )
      .slice(0, 50);
  }, [q, cases]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">Välj annat ärende…</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök namn, adress eller ordernummer"
          />
        </div>
        <div className="max-h-[300px] overflow-auto">
          {results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">Inga träffar</div>
          ) : (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                onClick={() => { onPick(c); setOpen(false); setQ(''); }}
              >
                <div className="font-medium">{c.customer_name || 'Okänt namn'}</div>
                <div className="text-xs text-muted-foreground">{c.address || '—'}</div>
                {c.order_number && <div className="text-xs text-muted-foreground">Order: {c.order_number}</div>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
