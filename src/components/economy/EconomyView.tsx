import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { listOrdersByCaseIds, type OrderRow } from '@/integrations/orderGateway';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { ChevronDown, ChevronRight, AlertTriangle, TrendingDown, FileWarning, FileX } from 'lucide-react';
import type { CaseRow } from '@/lib/supabaseClient';

type DocRow = {
  id: string;
  case_id: string;
  doc_type: 'mockfjards_payout' | 'a_order' | 'sheet_metal_invoice' | 'montor_invoice';
  total_amount: number | null;
  invoice_number: string | null;
  created_at: string;
};

type CostRow = { id: string; case_id: string; amount: number; category: 'ovrigt' | 'reklamation' };
type SmoRow = { id: string; case_id: string };

type OfferRow = {
  id: string;
  offer_number: string | null;
  status: string;
  customer_name: string | null;
  title: string | null;
  total_incl_vat: number | null;
  total_after_rot: number | null;
  rot_enabled: boolean | null;
  created_at: string;
};

type UppdragRow = {
  id: string;
  uppdrag_number: string | null;
  customer_name: string | null;
  title: string | null;
  status: string;
  revenue_ex_vat: number | null;
  cost_ex_vat: number | null;
  slutfaktura_amount: number | null;
  slutfaktura_sent_at: string | null;
  created_at: string;
};

type Period = 'month' | 'quarter' | 'year' | 'all';

function fmtKr(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE').replace(/\s/g, ' ')} kr`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)} %`;
}

function caseDate(c: CaseRow): Date {
  const s = c.montage_date || c.delivery_date || c.created_at;
  return new Date(s as string);
}

function periodStart(p: Period): Date | null {
  if (p === 'all') return null;
  const now = new Date();
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  return new Date(now.getFullYear(), 0, 1);
}

interface CaseEconomy {
  c: CaseRow;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  costBreakdown: { montor: number; caseCosts: number; reklamation: number; sheet: number; montorInvoice: number };
  hasRevenue: boolean;
  hasCost: boolean;
  complete: boolean;
}

export function EconomyView() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [smos, setSmos] = useState<SmoRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [uppdragList, setUppdragList] = useState<UppdragRow[]>([]);
  const [period, setPeriod] = useState<Period>('all');
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'revenue' | 'cost'>('profit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [cRes, dRes, ccRes, smRes, oRes, uRes] = await Promise.all([
        supabase.from('cases').select('*'),
        supabase.from('case_documents').select('id, case_id, doc_type, total_amount, invoice_number, created_at'),
        supabase.from('case_costs').select('id, case_id, amount, category'),
        supabase.from('sheet_metal_orders').select('id, case_id'),
        supabase.from('offers').select('id, offer_number, status, customer_name, title, total_incl_vat, total_after_rot, rot_enabled, created_at'),
        supabase.from('uppdrag').select('id, uppdrag_number, customer_name, title, status, revenue_ex_vat, cost_ex_vat, slutfaktura_amount, slutfaktura_sent_at, created_at'),
      ]);
      if (cancel) return;
      const allCases = (cRes.data || []) as CaseRow[];
      setCases(allCases);
      setDocs((dRes.data || []) as DocRow[]);
      setCosts((ccRes.data || []) as CostRow[]);
      setSmos((smRes.data || []) as SmoRow[]);
      setOffers((oRes.data || []) as OfferRow[]);
      setUppdragList((uRes.data || []) as UppdragRow[]);
      const ids = allCases.map(c => c.id);
      const ord = await listOrdersByCaseIds(ids);
      if (cancel) return;
      setOrders(ord);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const economy = useMemo<CaseEconomy[]>(() => {
    const docsByCase = new Map<string, DocRow[]>();
    docs.forEach(d => {
      const arr = docsByCase.get(d.case_id) || [];
      arr.push(d);
      docsByCase.set(d.case_id, arr);
    });
    const costsByCase = new Map<string, { ovrigt: number; reklamation: number }>();
    costs.forEach(c => {
      const cur = costsByCase.get(c.case_id) || { ovrigt: 0, reklamation: 0 };
      const amt = Number(c.amount) || 0;
      if (c.category === 'reklamation') cur.reklamation += amt;
      else cur.ovrigt += amt;
      costsByCase.set(c.case_id, cur);
    });
    const orderByCase = new Map<string, OrderRow>();
    orders.forEach(o => { if (o.case_id) orderByCase.set(o.case_id, o); });

    return cases.map(c => {
      const cd = docsByCase.get(c.id) || [];
      const revenue = cd.filter(d => d.doc_type === 'mockfjards_payout')
        .reduce((s, d) => s + (Number(d.total_amount) || 0), 0);
      const order = orderByCase.get(c.id);
      const aOrderSum = cd.filter(d => d.doc_type === 'a_order')
        .reduce((s, d) => s + (Number(d.total_amount) || 0), 0);
      const montorCost = order?.total_amount != null ? Number(order.total_amount) : aOrderSum;
      const hasMontor = order?.total_amount != null || aOrderSum > 0;
      const sheetCost = cd.filter(d => d.doc_type === 'sheet_metal_invoice')
        .reduce((s, d) => s + (Number(d.total_amount) || 0), 0);
      const montorInvoiceCost = cd.filter(d => d.doc_type === 'montor_invoice')
        .reduce((s, d) => s + (Number(d.total_amount) || 0), 0);
      const ccBuckets = costsByCase.get(c.id) || { ovrigt: 0, reklamation: 0 };
      const cost = montorCost + ccBuckets.ovrigt + ccBuckets.reklamation + sheetCost + montorInvoiceCost;
      const profit = revenue - cost;
      const hasRevenue = revenue > 0;
      const complete = hasRevenue && hasMontor;
      return {
        c, revenue, cost, profit,
        margin: revenue > 0 ? profit / revenue : null,
        costBreakdown: { montor: montorCost, caseCosts: ccBuckets.ovrigt, reklamation: ccBuckets.reklamation, sheet: sheetCost, montorInvoice: montorInvoiceCost },
        hasRevenue,
        hasCost: hasMontor,
        complete,
      };
    });
  }, [cases, docs, costs, orders]);

  const filteredEconomy = useMemo(() => {
    const start = periodStart(period);
    if (!start) return economy;
    return economy.filter(e => caseDate(e.c) >= start);
  }, [economy, period]);

  const completeEconomy = useMemo(() => filteredEconomy.filter(e => e.complete), [filteredEconomy]);

  const kpis = useMemo(() => {
    const totRev = completeEconomy.reduce((s, e) => s + e.revenue, 0);
    const totCost = completeEconomy.reduce((s, e) => s + e.cost, 0);
    const totProfit = totRev - totCost;
    const margin = totRev > 0 ? totProfit / totRev : 0;
    return { totRev, totCost, totProfit, margin };
  }, [completeEconomy]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; cost: number; profit: number }>();
    completeEconomy.forEach(e => {
      const d = caseDate(e.c);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = map.get(key) || { month: key, revenue: 0, cost: 0, profit: 0 };
      row.revenue += e.revenue;
      row.cost += e.cost;
      row.profit += e.profit;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [completeEconomy]);

  const sortFn = (a: CaseEconomy, b: CaseEconomy) => {
    let av: number; let bv: number;
    if (sortBy === 'profit') { av = a.profit; bv = b.profit; }
    else if (sortBy === 'margin') { av = a.margin ?? -Infinity; bv = b.margin ?? -Infinity; }
    else if (sortBy === 'revenue') { av = a.revenue; bv = b.revenue; }
    else { av = a.cost; bv = b.cost; }
    return sortDir === 'asc' ? av - bv : bv - av;
  };
  const sortedComplete = useMemo(
    () => filteredEconomy.filter(e => e.complete).sort(sortFn),
    [filteredEconomy, sortBy, sortDir],
  );
  const incompleteList = useMemo(
    () => filteredEconomy.filter(e => !e.complete),
    [filteredEconomy],
  );

  // Team statistics
  type TeamStat = {
    team: string;
    count: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number | null;
    avgProfit: number;
    montorCost: number;
    reklCost: number;
    units: number;
    costPerUnit: number | null;
  };
  const [teamSortBy, setTeamSortBy] = useState<'profit' | 'margin' | 'reklamation'>('profit');
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('desc');
  const teamStats = useMemo<TeamStat[]>(() => {
    const map = new Map<string, CaseEconomy[]>();
    sortedComplete.forEach(e => {
      const team = (e.c.team && e.c.team.trim()) || 'Ej tilldelad';
      const arr = map.get(team) || [];
      arr.push(e);
      map.set(team, arr);
    });
    const stats: TeamStat[] = [];
    map.forEach((arr, team) => {
      const revenue = arr.reduce((s, e) => s + e.revenue, 0);
      const cost = arr.reduce((s, e) => s + e.cost, 0);
      const profit = revenue - cost;
      const montorCost = arr.reduce((s, e) => s + e.costBreakdown.montor, 0);
      const reklCost = arr.reduce((s, e) => s + e.costBreakdown.reklamation, 0);
      const units = arr.reduce((s, e) => s + (e.c.units || 0), 0);
      stats.push({
        team, count: arr.length, revenue, cost, profit,
        margin: revenue > 0 ? profit / revenue : null,
        avgProfit: arr.length > 0 ? profit / arr.length : 0,
        montorCost, reklCost, units,
        costPerUnit: units > 0 ? montorCost / units : null,
      });
    });
    stats.sort((a, b) => {
      let av: number; let bv: number;
      if (teamSortBy === 'profit') { av = a.profit; bv = b.profit; }
      else if (teamSortBy === 'reklamation') { av = a.reklCost; bv = b.reklCost; }
      else { av = a.margin ?? -Infinity; bv = b.margin ?? -Infinity; }
      return teamSortDir === 'asc' ? av - bv : bv - av;
    });
    return stats;
  }, [sortedComplete, teamSortBy, teamSortDir]);

  const bestTeam = useMemo(() => {
    const ranked = teamStats.filter(t => t.costPerUnit != null);
    if (ranked.length < 2) return null;
    return [...ranked].sort((a, b) => a.costPerUnit! - b.costPerUnit!)[0].team;
  }, [teamStats]);
  const worstTeam = useMemo(() => {
    const ranked = teamStats.filter(t => t.costPerUnit != null);
    if (ranked.length < 2) return null;
    return [...ranked].sort((a, b) => b.costPerUnit! - a.costPerUnit!)[0].team;
  }, [teamStats]);

  const toggleTeamSort = (col: 'profit' | 'margin' | 'reklamation') => {
    if (teamSortBy === col) setTeamSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setTeamSortBy(col); setTeamSortDir('desc'); }
  };

  // Datakvalitet / obetalt
  const awaitingPayout = useMemo(
    () => filteredEconomy.filter(e =>
      ['montage_klart', 'fakturerad'].includes(e.c.status) && !e.hasRevenue),
    [filteredEconomy],
  );
  const missingCost = useMemo(
    () => filteredEconomy.filter(e => e.hasRevenue && !e.hasCost),
    [filteredEconomy],
  );
  const lossCases = useMemo(
    () => filteredEconomy.filter(e => e.complete && e.profit < 0),
    [filteredEconomy],
  );
  const sheetCaseIds = useMemo(() => new Set(smos.map(s => s.case_id)), [smos]);
  const missingSheetInvoice = useMemo(
    () => filteredEconomy.filter(e => sheetCaseIds.has(e.c.id) && e.costBreakdown.sheet === 0),
    [filteredEconomy, sheetCaseIds],
  );

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  };

  // Entreprenad (CaseFlow) — separat från Mockfjärds
  const entreprenad = useMemo(() => {
    const start = periodStart(period);
    const inPeriod = <T extends { created_at: string }>(r: T) =>
      !start || new Date(r.created_at) >= start;
    const offersF = offers.filter(inPeriod);
    const uppdragF = uppdragList.filter(inPeriod);

    const offerAmount = (o: OfferRow) =>
      Number((o.rot_enabled ? o.total_after_rot : o.total_incl_vat) ?? 0);

    const sentOrLater = offersF.filter(o => o.status !== 'draft');
    const offeredSum = sentOrLater.reduce((s, o) => s + offerAmount(o), 0);
    const offeredCount = sentOrLater.length;

    const accepted = offersF.filter(o => o.status === 'accepted').length;
    const declined = offersF.filter(o => o.status === 'declined').length;
    const expired = offersF.filter(o => o.status === 'expired').length;
    const decided = accepted + declined + expired;
    const hitRate = decided > 0 ? accepted / decided : null;

    const withCost = uppdragF.filter(u => u.cost_ex_vat != null);
    const marginSum = withCost.reduce(
      (s, u) => s + (Number(u.revenue_ex_vat || 0) - Number(u.cost_ex_vat || 0)),
      0,
    );
    const marginRev = withCost.reduce((s, u) => s + Number(u.revenue_ex_vat || 0), 0);
    const marginPct = marginRev > 0 ? marginSum / marginRev : null;

    const unbilled = uppdragF.filter(u => u.status === 'klar' && !u.slutfaktura_sent_at);
    const unbilledCount = unbilled.length;
    const unbilledSum = unbilled.reduce((s, u) => s + Number(u.slutfaktura_amount || 0), 0);

    const uppdragSorted = [...uppdragF].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return {
      offeredSum, offeredCount, hitRate,
      marginSum, marginPct,
      unbilledCount, unbilledSum,
      uppdragSorted,
    };
  }, [offers, uppdragList, period]);

  const uppdragStatusBadge = (s: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      ej_paborjad: { label: 'Ej påbörjad', variant: 'outline' },
      pagar: { label: 'Pågår', variant: 'secondary' },
      klar: { label: 'Klar', variant: 'default' },
      fakturerad: { label: 'Fakturerad', variant: 'default' },
    };
    const m = map[s] || { label: s, variant: 'outline' as const };
    return <Badge variant={m.variant} className="text-xs">{m.label}</Badge>;
  };


  if (loading) {
    return (
      <div className="px-3 md:px-0 py-12 text-center text-muted-foreground">Laddar ekonomi...</div>
    );
  }

  return (
    <div className="px-3 md:px-0 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Ekonomi</h1>
        <div className="flex gap-1 rounded-md border p-1">
          {(['month', 'quarter', 'year', 'all'] as Period[]).map(p => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'default' : 'ghost'}
              onClick={() => setPeriod(p)}
            >
              {p === 'month' ? 'Månad' : p === 'quarter' ? 'Kvartal' : p === 'year' ? 'År' : 'Allt'}
            </Button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total intäkt</div>
          <div className="text-2xl font-semibold mt-1">{fmtKr(kpis.totRev)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total kostnad</div>
          <div className="text-2xl font-semibold mt-1">{fmtKr(kpis.totCost)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total vinst</div>
          <div className={`text-2xl font-semibold mt-1 ${kpis.totProfit < 0 ? 'text-destructive' : ''}`}>
            {fmtKr(kpis.totProfit)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Vinstmarginal</div>
          <div className="text-2xl font-semibold mt-1">{fmtPct(kpis.margin)}</div>
        </Card>
      </div>
      <div className="text-sm text-muted-foreground">
        Baserat på {completeEconomy.length} av {filteredEconomy.length} ärenden med komplett data
        (både intäkt och montörskostnad). Endast kompletta ärenden räknas — ofullständiga visas
        separat och påverkar inte totalen.
      </div>

      {/* Trend */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Trend per månad</div>
        {monthlyTrend.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Ingen data i vald period</div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmtKr(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Intäkt" fill="hsl(var(--primary))" />
                <Bar dataKey="cost" name="Kostnad" fill="hsl(var(--muted-foreground))" />
                <Bar dataKey="profit" name="Vinst" fill="hsl(var(--accent-foreground))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Per-case profitability — kompletta */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b">
          <div className="text-sm font-medium">Lönsamhet per ärende (kompletta)</div>
          <div className="text-xs text-muted-foreground mt-1">Klicka på en kolumn för att sortera. Klicka raden för kostnadsmix.</div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Ärende</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('revenue')}>Intäkt</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('cost')}>Kostnad</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('profit')}>Vinst</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('margin')}>Marginal</TableHead>
              <TableHead>Team</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedComplete.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Inga kompletta ärenden</TableCell></TableRow>
            )}
            {sortedComplete.map(e => {
              const isOpen = !!expanded[e.c.id];
              const loss = e.profit < 0;
              return (
                <Collapsible
                  key={e.c.id}
                  open={isOpen}
                  onOpenChange={(o) => setExpanded(s => ({ ...s, [e.c.id]: o }))}
                  asChild
                >
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow className={`cursor-pointer ${loss ? 'bg-destructive/5' : ''}`}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{e.c.address}</div>
                          <div className="text-xs text-muted-foreground">{e.c.customer_name}</div>
                        </TableCell>
                        <TableCell>{fmtKr(e.revenue)}</TableCell>
                        <TableCell>{fmtKr(e.cost)}</TableCell>
                        <TableCell className={loss ? 'text-destructive font-medium' : ''}>{fmtKr(e.profit)}</TableCell>
                        <TableCell>{e.margin == null ? '—' : fmtPct(e.margin)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{e.c.team || '—'}</TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="text-xs space-y-1">
                            <div className="font-medium mb-2">Kostnadsmix</div>
                            <div>Montörsbetalning: {fmtKr(e.costBreakdown.montor)}</div>
                            <div>Egna kostnader (case_costs): {fmtKr(e.costBreakdown.caseCosts)}</div>
                            <div>Plåtfakturor: {fmtKr(e.costBreakdown.sheet)}</div>
                            <div>Montörsfaktura (extra): {fmtKr(e.costBreakdown.montorInvoice)}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Ofullständiga ärenden */}
      <Card className="p-0 overflow-hidden opacity-90">
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <button type="button" className="w-full p-4 border-b flex items-center justify-between hover:bg-muted/30 text-left">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Ofullständiga ärenden</div>
                <div className="text-xs text-muted-foreground mt-1">Påverkar inte totalen — saknar intäkt eller kostnad.</div>
              </div>
              <Badge variant="outline">{incompleteList.length}</Badge>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ärende</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Intäkt</TableHead>
                  <TableHead>Kostnad</TableHead>
                  <TableHead>Saknar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incompleteList.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Inga ofullständiga ärenden</TableCell></TableRow>
                )}
                {incompleteList.map(e => {
                  const missing: string[] = [];
                  if (!e.hasRevenue) missing.push('utbetalning');
                  if (!e.hasCost) missing.push('montörskostnad');
                  return (
                    <TableRow key={e.c.id} className="bg-muted/20">
                      <TableCell>
                        <div className="font-medium">{e.c.address}</div>
                        <div className="text-xs text-muted-foreground">{e.c.customer_name}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.c.team || '—'}</TableCell>
                      <TableCell>{e.hasRevenue ? fmtKr(e.revenue) : '—'}</TableCell>
                      <TableCell>{e.hasCost ? fmtKr(e.cost) : '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 items-center">
                          <Badge variant="outline" className="text-xs">Ofullständig</Badge>
                          {missing.map(m => (
                            <span key={m} className="text-xs text-muted-foreground">saknar {m}</span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Statistik per montageteam */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b">
          <div className="text-sm font-medium">Statistik per montageteam</div>
          <div className="text-xs text-muted-foreground mt-1">
            Baserat på kompletta ärenden. Bäst/Sämst = lägst/högst kostnad per enhet. Klicka kolumn för att sortera.
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Jobb</TableHead>
              <TableHead>Intäkt</TableHead>
              <TableHead>Kostnad</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleTeamSort('profit')}>Vinst</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleTeamSort('margin')}>Marginal</TableHead>
              <TableHead>Snittvinst/jobb</TableHead>
              <TableHead>Kostnad/enhet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamStats.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Ingen data</TableCell></TableRow>
            )}
            {teamStats.map(t => {
              const isBest = t.team === bestTeam;
              const isWorst = t.team === worstTeam;
              return (
                <TableRow key={t.team} className={isBest ? 'bg-primary/5' : isWorst ? 'bg-destructive/5' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.team}</span>
                      {isBest && <Badge variant="default" className="text-xs">Bäst</Badge>}
                      {isWorst && <Badge variant="destructive" className="text-xs">Sämst</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{t.count}</TableCell>
                  <TableCell>{fmtKr(t.revenue)}</TableCell>
                  <TableCell>{fmtKr(t.cost)}</TableCell>
                  <TableCell className={t.profit < 0 ? 'text-destructive font-medium' : ''}>{fmtKr(t.profit)}</TableCell>
                  <TableCell>{t.margin == null ? '—' : fmtPct(t.margin)}</TableCell>
                  <TableCell>{fmtKr(t.avgProfit)}</TableCell>
                  <TableCell>{t.costPerUnit == null ? '—' : fmtKr(t.costPerUnit)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>


      {/* Datakvalitet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IssueList
          icon={<FileWarning className="h-4 w-4" />}
          title="Väntar på Mockfjärds-betalning"
          desc="Status klar/fakturerad men ingen utbetalning"
          items={awaitingPayout}
        />
        <IssueList
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Saknar montörskostnad"
          desc="Intäkt finns men ingen kostnad"
          items={missingCost}
        />
        <IssueList
          icon={<TrendingDown className="h-4 w-4" />}
          title="Förlustärenden"
          desc="Intäkt < kostnad"
          items={lossCases}
          showProfit
        />
        <IssueList
          icon={<FileX className="h-4 w-4" />}
          title="Saknar plåtfaktura"
          desc="Plåtorder skickad men ingen faktura kopplad"
          items={missingSheetInvoice}
        />
      </div>

      {/* Entreprenad (CaseFlow) */}
      <div className="pt-6 border-t-2 border-border">
        <h2 className="text-2xl font-semibold mb-1">Entreprenad</h2>
        <div className="text-sm text-muted-foreground mb-4">
          Offerter och uppdrag i CaseFlow — separat från Mockfjärds-ärenden.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Offererat</div>
            <div className="text-2xl font-semibold mt-1">{fmtKr(entreprenad.offeredSum)}</div>
            <div className="text-xs text-muted-foreground mt-1">{entreprenad.offeredCount} st</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Träffprocent</div>
            <div className="text-2xl font-semibold mt-1">
              {entreprenad.hitRate == null ? '–' : fmtPct(entreprenad.hitRate)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Marginal</div>
            <div className={`text-2xl font-semibold mt-1 ${entreprenad.marginSum < 0 ? 'text-destructive' : ''}`}>
              {fmtKr(entreprenad.marginSum)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ({entreprenad.marginPct == null ? '–' : fmtPct(entreprenad.marginPct)})
            </div>
          </Card>
          <Card className={`p-4 ${entreprenad.unbilledCount > 0 ? 'border-orange-400 bg-orange-50/60 dark:bg-orange-950/20' : ''}`}>
            <div className="text-xs text-muted-foreground">Ofakturerat</div>
            <div className={`text-2xl font-semibold mt-1 ${entreprenad.unbilledCount > 0 ? 'text-orange-600 dark:text-orange-400' : ''}`}>
              {entreprenad.unbilledCount} st
            </div>
            <div className="text-xs text-muted-foreground mt-1">{fmtKr(entreprenad.unbilledSum)}</div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden mt-4">
          <div className="p-4 border-b">
            <div className="text-sm font-medium">Uppdrag</div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uppdragsnr</TableHead>
                <TableHead>Kund</TableHead>
                <TableHead>Titel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Intäkt ex moms</TableHead>
                <TableHead>Kostnad</TableHead>
                <TableHead>Marginal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entreprenad.uppdragSorted.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Inga uppdrag i vald period</TableCell></TableRow>
              )}
              {entreprenad.uppdragSorted.map(u => {
                const rev = Number(u.revenue_ex_vat || 0);
                const hasCost = u.cost_ex_vat != null;
                const cost = Number(u.cost_ex_vat || 0);
                const margin = hasCost ? rev - cost : null;
                const marginPct = hasCost && rev > 0 ? (rev - cost) / rev : null;
                const negative = margin != null && margin < 0;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.uppdrag_number || '—'}</TableCell>
                    <TableCell>{u.customer_name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.title || '—'}</TableCell>
                    <TableCell>{uppdragStatusBadge(u.status)}</TableCell>
                    <TableCell>{fmtKr(rev)}</TableCell>
                    <TableCell>{hasCost ? fmtKr(cost) : '—'}</TableCell>
                    <TableCell className={negative ? 'text-destructive font-medium' : ''}>
                      {margin == null ? '—' : `${fmtKr(margin)}${marginPct != null ? ` (${fmtPct(marginPct)})` : ''}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function IssueList({
  icon, title, desc, items, showProfit,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  items: CaseEconomy[];
  showProfit?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">{icon}{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">Inga ärenden</div>
      ) : (
        <ul className="text-sm space-y-1 max-h-64 overflow-auto">
          {items.slice(0, 50).map(e => (
            <li key={e.c.id} className="flex justify-between gap-2 py-1 border-b last:border-0">
              <span className="truncate">
                <span className="font-medium">{e.c.address}</span>
                <span className="text-xs text-muted-foreground ml-2">{e.c.customer_name}</span>
              </span>
              {showProfit && (
                <span className="text-destructive text-xs whitespace-nowrap">{fmtKr(e.profit)}</span>
              )}
            </li>
          ))}
          {items.length > 50 && (
            <li className="text-xs text-muted-foreground pt-2">+ {items.length - 50} till...</li>
          )}
        </ul>
      )}
    </Card>
  );
}
