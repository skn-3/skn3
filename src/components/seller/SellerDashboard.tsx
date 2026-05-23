import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllCases, fetchAllDeviations, fetchAllVisits, fetchAllCaseEvents } from '@/lib/supabaseClient';
import type { CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS, SELLERS, MONTORS, DEVIATION_TYPES, DEVIATION_RESPONSIBLE, HOUR_RATE, LOST_REASONS, COMPETITORS } from '@/lib/constants';
import { Loader2, TrendingDown, ShieldAlert, Info } from 'lucide-react';
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { formatAmount } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

interface SellerDashboardProps {
  sellerName: string;
}

const BUDGET = 55_000_000;
const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', '#F59E0B', '#6B7280'];

function extractCityFromAddress(address: string): string {
  const parts = (address || '').split(',').map(s => s.trim());
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

function getCaseCity(c: { city?: string | null; address: string }): string {
  return (c.city && c.city.trim()) ? c.city.trim() : extractCityFromAddress(c.address);
}

export function SellerDashboard({ sellerName }: SellerDashboardProps) {
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [filterMontor, setFilterMontor] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeImported, setIncludeImported] = useState(true);
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);

  const { data: allCasesRaw, isLoading: loadingCases } = useQuery({ queryKey: ['cases_all'], queryFn: fetchAllCases });
  const { data: allDeviations } = useQuery({ queryKey: ['deviations_all'], queryFn: fetchAllDeviations });
  const { data: allVisits } = useQuery({ queryKey: ['visits_all'], queryFn: fetchAllVisits });
  const { data: allEvents } = useQuery({ queryKey: ['case_events_all'], queryFn: fetchAllCaseEvents });

  if (loadingCases) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  // Filter imported cases if toggle is off
  const allCases = (allCasesRaw || []).filter(c => includeImported || !(c as any).imported);

  // Extract all cities for filter
  const allCities = [...new Set(allCases.map(c => getCaseCity(c as any)))].sort();

  const cases = allCases.filter((c) => {
    if (filterSeller !== 'all' && c.seller !== filterSeller) return false;
    if (filterMontor !== 'all' && c.team !== filterMontor) return false;
    if (filterCity !== 'all' && getCaseCity(c as any) !== filterCity) return false;
    if (dateFrom && c.created_at < dateFrom) return false;
    if (dateTo && c.created_at > dateTo + 'T23:59:59') return false;
    return true;
  });

  const visits = (allVisits || []).filter((v) => {
    if (filterSeller !== 'all' && v.seller !== filterSeller) return false;
    if (dateFrom && v.date < dateFrom) return false;
    if (dateTo && v.date > dateTo) return false;
    return true;
  });

  const deviations = allDeviations || [];
  const caseIds = new Set(cases.map((c) => c.id));
  const filteredDeviations = deviations.filter((d) => caseIds.has(d.case_id));

  const totalValue = cases.reduce((sum, c) => sum + (Number(c.order_value) || 0), 0);
  const avgOrderValue = cases.length ? Math.round(totalValue / cases.length) : 0;
  const tbValues = cases.filter((c) => c.tb_percent != null).map((c) => Number(c.tb_percent));
  const avgTb = tbValues.length ? (tbValues.reduce((a, b) => a + b, 0) / tbValues.length).toFixed(1) : '–';
  const unresolvedDevs = filteredDeviations.filter((d) => !d.resolved).length;
  const totalDevCost = filteredDeviations.reduce((sum, d) => sum + (Number((d as any).cost) || 0), 0);

  // Budget progress — only cases from current year, company-wide (not affected by seller/city/date filters)
  const currentYear = new Date().getFullYear();
  const signedThisYear = allCases.filter(c =>
    c.created_at &&
    new Date(c.created_at).getFullYear() === currentYear
  );
  const allTotalValue = signedThisYear.reduce((sum, c) => sum + (Number(c.order_value) || 0), 0);
  const budgetPct = Math.min(100, (allTotalValue / BUDGET) * 100);
  const budgetColor = budgetPct > 50 ? 'text-green-600' : budgetPct > 25 ? 'text-yellow-600' : 'text-destructive';

  // Per seller table
  const perSeller = SELLERS.map((s) => {
    const sc = (allCases || []).filter((c) => c.seller === s);
    return { name: s, count: sc.length, value: sc.reduce((sum, c) => sum + (Number(c.order_value) || 0), 0) };
  });

  // Monthly order value
  const monthlyData = cases.reduce((acc, c) => {
    const month = c.created_at.substring(0, 7);
    acc[month] = (acc[month] || 0) + (Number(c.order_value) || 0);
    return acc;
  }, {} as Record<string, number>);
  const monthlyChart = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));

  // Visit KPIs
  const visitsPerSeller = SELLERS.map((s) => {
    const sv = (allVisits || []).filter((v) => v.seller === s);
    const signerat = sv.filter((v) => v.result === 'signerat').length;
    return { name: s, total: sv.length, signerat, hitRate: sv.length ? ((signerat / sv.length) * 100).toFixed(0) : '0' };
  });

  const nejVisits = visits.filter((v) => v.result === 'nej');
  const lostValue = nejVisits.reduce((sum, v) => sum + (Number(v.order_value) || 0), 0);

  const today = new Date().toISOString().split('T')[0];
  const pendingFollowUps = (allVisits || []).filter(
    (v) => v.result === 'aterkoppla' && !v.case_id && v.follow_up_date && v.follow_up_date <= today
  );

  // --- Sales per city ---
  const normalizeCity = (s: string) => (s || '').trim().toLowerCase();
  const cityMap: Record<string, { count: number; value: number }> = {};
  cases.forEach(c => {
    const city = getCaseCity(c as any);
    if (!cityMap[city]) cityMap[city] = { count: 0, value: 0 };
    cityMap[city].count++;
    cityMap[city].value += Number(c.order_value) || 0;
  });
  // Key visits by normalized city so they match getCaseCity output regardless of case/whitespace
  const cityVisitMap: Record<string, { total: number; signerat: number }> = {};
  visits.forEach(v => {
    const key = normalizeCity(extractCityFromAddress(v.address));
    if (!key) return;
    if (!cityVisitMap[key]) cityVisitMap[key] = { total: 0, signerat: 0 };
    cityVisitMap[key].total++;
    if (v.result === 'signerat') cityVisitMap[key].signerat++;
  });
  const cityData = Object.entries(cityMap)
    .map(([city, d]) => {
      const v = cityVisitMap[normalizeCity(city)];
      const hasVisits = !!(v && v.total > 0);
      return {
        city,
        count: d.count,
        value: d.value,
        hitRate: hasVisits ? Math.round((v!.signerat / v!.total) * 100) : null,
        visitTotal: v?.total ?? 0,
        visitSigned: v?.signerat ?? 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  // --- Data quality outliers ---
  const positiveValues = (allCases || [])
    .map(c => Number(c.order_value) || 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const medianOV = positiveValues.length
    ? positiveValues[Math.floor(positiveValues.length / 2)]
    : 0;
  const medianThreshold = medianOV * 3;
  const SELLERS_LIST: string[] = [...SELLERS];
  const outlierCases = cases.map(c => {
    const ov = Number(c.order_value) || 0;
    const tb = c.tb_percent != null ? Number(c.tb_percent) : null;
    const seller = (c.seller || '').trim();
    return {
      caseData: c,
      highOV: ov > 500_000 || (medianThreshold > 0 && ov > medianThreshold),
      badTB: tb != null && (tb > 100 || tb < 0),
      missingSeller: !seller,
      unknownSeller: !!seller && !SELLERS_LIST.includes(seller),
      ov,
      tb,
      seller,
    };
  }).filter(o => o.highOV || o.badTB || o.missingSeller || o.unknownSeller)
    .sort((a, b) => b.ov - a.ov);

  // --- Conversion funnel ---
  const totalVisits = visits.length;
  const aterkoppla = visits.filter(v => v.result === 'aterkoppla').length;
  const signerat = visits.filter(v => v.result === 'signerat').length;
  const montageKlart = cases.filter(c => ['montage_klart', 'fakturerad'].includes(c.status)).length;
  const funnel = [
    { step: 'Besök', count: totalVisits },
    { step: 'Återkoppling', count: aterkoppla + signerat },
    { step: 'Signerat', count: signerat },
    { step: 'Montage klart', count: montageKlart },
  ];
  const maxFunnel = Math.max(1, funnel[0]?.count || 1);

  // --- Reclamation cost by type ---
  const devCostByType: Record<string, number> = {};
  filteredDeviations.forEach(d => {
    const label = DEVIATION_TYPES.find(dt => dt.value === d.type)?.label || d.type;
    devCostByType[label] = (devCostByType[label] || 0) + (Number((d as any).cost) || 0);
  });
  const devCostByTypeChart = Object.entries(devCostByType).map(([name, value]) => ({ name, value }));

  // --- Cost by responsible ---
  const devCostByResp: Record<string, number> = {};
  filteredDeviations.forEach(d => {
    const label = DEVIATION_RESPONSIBLE.find(r => r.value === d.responsible)?.label || d.responsible;
    devCostByResp[label] = (devCostByResp[label] || 0) + (Number((d as any).cost) || 0);
  });
  const devCostByRespChart = Object.entries(devCostByResp).map(([name, value]) => ({ name, value }));

  // --- Unresolved deviations list ---
  const unresolvedList = filteredDeviations
    .filter(d => !d.resolved)
    .map(d => {
      const c = cases.find(c => c.id === d.case_id);
      const daysSince = Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: d.id,
        address: c?.address || '–',
        type: DEVIATION_TYPES.find(dt => dt.value === d.type)?.label || d.type,
        description: d.description.substring(0, 80),
        daysSince,
      };
    });

  // --- Montör statistics ---
  const montorStats = MONTORS.map(m => {
    const mc = (allCases || []).filter(c => c.team === m);
    const montageKlart = mc.filter(c => ['montage_klart', 'fakturerad'].includes(c.status)).length;
    const pagaende = mc.filter(c => !['montage_klart', 'fakturerad'].includes(c.status)).length;
    const montorDevs = deviations.filter(d => mc.some(c => c.id === d.case_id));
    const extraHours = mc.reduce((sum, c) => sum + c.extra_hours_requested, 0);
    return { name: m, montage: montageKlart, pagaende, deviations: montorDevs.length, extraHours };
  }).sort((a, b) => b.montage - a.montage);

  // --- Lead times from case_events ---
  const events = allEvents || [];
  const statusTransitions: Record<string, Record<string, Date>> = {};
  events.forEach(e => {
    if (e.event_type === 'status_change') {
      if (!statusTransitions[e.case_id]) statusTransitions[e.case_id] = {};
      const desc = e.description.toLowerCase();
      if (desc.includes('km bokad') && !statusTransitions[e.case_id]['km_bokad'])
        statusTransitions[e.case_id]['km_bokad'] = new Date(e.created_at);
      if (desc.includes('km klar') && !statusTransitions[e.case_id]['km_klar'])
        statusTransitions[e.case_id]['km_klar'] = new Date(e.created_at);
      if (desc.includes('montage bokat') && !statusTransitions[e.case_id]['montage_bokat'])
        statusTransitions[e.case_id]['montage_bokat'] = new Date(e.created_at);
      if (desc.includes('montage klart') && !statusTransitions[e.case_id]['montage_klart'])
        statusTransitions[e.case_id]['montage_klart'] = new Date(e.created_at);
    }
  });
  // Case created_at as "ny"
  (allCases || []).forEach(c => {
    if (!statusTransitions[c.id]) statusTransitions[c.id] = {};
    statusTransitions[c.id]['ny'] = new Date(c.created_at);
  });

  function avgDaysBetween(from: string, to: string): number | null {
    const diffs: number[] = [];
    Object.values(statusTransitions).forEach(t => {
      if (t[from] && t[to]) {
        const days = (t[to].getTime() - t[from].getTime()) / (1000 * 60 * 60 * 24);
        if (days >= 0) diffs.push(days);
      }
    });
    return diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null;
  }

  const leadTimes = [
    { step: 'Ny → KM bokad', days: avgDaysBetween('ny', 'km_bokad') },
    { step: 'KM bokad → KM klar', days: avgDaysBetween('km_bokad', 'km_klar') },
    { step: 'KM klar → Montage bokat', days: avgDaysBetween('km_klar', 'montage_bokat') },
    { step: 'Montage bokat → Montage klart', days: avgDaysBetween('montage_bokat', 'montage_klart') },
  ].filter(l => l.days !== null);

  // --- Extra hours analysis ---
  const totalSold = cases.reduce((s, c) => s + c.extra_hours_sold, 0);
  const totalRequested = cases.reduce((s, c) => s + c.extra_hours_requested, 0);
  const totalApproved = cases.reduce((s, c) => s + c.extra_hours_approved, 0);
  const totalRejected = totalRequested - totalApproved;
  const soldRevenue = totalSold * HOUR_RATE;
  const approvedCost = totalApproved * HOUR_RATE;
  const netResult = soldRevenue - approvedCost;
  const casesWithHours = cases.filter(c => c.extra_hours_sold > 0 || c.extra_hours_requested > 0);
  const avgApprovedPerCase = casesWithHours.length ? (totalApproved / casesWithHours.length).toFixed(1) : '0';

  // Extra hours per case table
  const extraHoursPerCase = casesWithHours.map(c => ({
    address: c.address,
    team: c.team || '–',
    sold: c.extra_hours_sold,
    requested: c.extra_hours_requested,
    approved: c.extra_hours_approved,
    revenue: c.extra_hours_sold * HOUR_RATE,
    cost: c.extra_hours_approved * HOUR_RATE,
    result: (c.extra_hours_sold - c.extra_hours_approved) * HOUR_RATE,
  })).sort((a, b) => a.result - b.result);

  // Extra hours per montör
  const extraHoursPerMontor = MONTORS.map(m => {
    const mc = cases.filter(c => c.team === m);
    const mRequested = mc.reduce((s, c) => s + c.extra_hours_requested, 0);
    const mApproved = mc.reduce((s, c) => s + c.extra_hours_approved, 0);
    const caseCount = mc.filter(c => c.extra_hours_requested > 0 || c.extra_hours_sold > 0).length;
    return {
      name: m,
      caseCount,
      requested: mRequested,
      approved: mApproved,
      cost: mApproved * HOUR_RATE,
      avg: caseCount ? (mApproved / caseCount).toFixed(1) : '0',
    };
  }).filter(m => m.requested > 0 || m.cost > 0).sort((a, b) => b.cost - a.cost);

  // Monthly sold vs approved
  const monthlyExtraHours: Record<string, { sold: number; approved: number }> = {};
  cases.forEach(c => {
    const month = c.created_at.substring(0, 7);
    if (!monthlyExtraHours[month]) monthlyExtraHours[month] = { sold: 0, approved: 0 };
    monthlyExtraHours[month].sold += c.extra_hours_sold;
    monthlyExtraHours[month].approved += c.extra_hours_approved;
  });
  const monthlyExtraChart = Object.entries(monthlyExtraHours)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, 'Intäkt (sålda)': d.sold * HOUR_RATE, 'Kostnad (godkända)': d.approved * HOUR_RATE }));

  // Status breakdown
  const statusCounts = cases.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-6 px-4 md:px-0">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
        <div className="flex gap-3 ml-auto flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Säljare</Label>
            <Select value={filterSeller} onValueChange={setFilterSeller}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {SELLERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Montör</Label>
            <Select value={filterMontor} onValueChange={setFilterMontor}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {MONTORS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ort</Label>
            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {allCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Från</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Till</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <Switch checked={includeImported} onCheckedChange={setIncludeImported} id="import-toggle" />
            <Label htmlFor="import-toggle" className="text-xs cursor-pointer">Inkl. importerade</Label>
          </div>
        </div>
      </div>

      {/* ROW 1: KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Antal ärenden</p>
          <p className="text-3xl font-bold text-card-foreground">{cases.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Totalt ordervärde <span className="text-xs">ex moms</span></p>
          <p className="text-3xl font-bold text-primary">{formatAmount(totalValue)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Snitt ordervärde <span className="text-xs">ex moms</span></p>
          <p className="text-3xl font-bold text-card-foreground">{formatAmount(avgOrderValue)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">TB% genomsnitt</p>
          <p className="text-3xl font-bold text-card-foreground">{avgTb}%</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Reklamationskostnad</p>
          <p className="text-3xl font-bold text-destructive">{formatAmount(totalDevCost)}</p>
          <p className="text-xs text-muted-foreground">{unresolvedDevs} olösta avvikelser</p>
        </div>
      </div>

      {/* Budget progress */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Budgetmål {currentYear}</h3>
          <span className={`text-sm font-bold ${budgetColor}`}>
            {(allTotalValue / 1_000_000).toFixed(1)} msek av {(BUDGET / 1_000_000).toFixed(0)} msek ({budgetPct.toFixed(0)}%) — {signedThisYear.length} ärenden
          </span>
        </div>
        <Progress value={budgetPct} className="h-3" />
        <p className="text-xs text-muted-foreground mt-1">
          Mäter alla ärenden skapade {currentYear}. Alla cases i systemet är signerade affärer — pipeline-statusarna beskriver var i workflow ärendet befinner sig.
        </p>
      </div>

      {/* Datakvalitet — Tidsstyrd leverans utan tid (inom 7 dagar) */}
      {(() => {
        const today = new Date();
        const in7 = new Date(today.getTime() + 7 * 86400000);
        const flagged = (allCases || []).filter((c: any) => {
          if (!c.scheduled_delivery) return false;
          if (c.delivery_time) return false;
          if (c.delivery_date) {
            const d = new Date(c.delivery_date + 'T00:00:00');
            return d >= new Date(today.toDateString()) && d <= in7;
          }
          if (c.delivery_week && c.delivery_year) {
            const jan4 = new Date(c.delivery_year, 0, 4);
            const dow = jan4.getDay() || 7;
            const start = new Date(jan4);
            start.setDate(jan4.getDate() - dow + 1 + (c.delivery_week - 1) * 7);
            return start >= new Date(today.toDateString()) && start <= in7;
          }
          return false;
        });
        if (flagged.length === 0) return null;
        return (
          <div className="rounded-xl border border-orange-300 bg-orange-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-900 mb-2">
              Datakvalitet — Tidsstyrd leverans utan tid (inom 7 dagar)
            </h3>
            <div className="space-y-2">
              {flagged.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-orange-200 bg-card p-2">
                  <div className="text-sm">
                    <div className="font-medium text-card-foreground">{c.address}{c.city ? `, ${c.city}` : ''}</div>
                    <div className="text-xs text-muted-foreground">{c.customer_name} · {c.team || 'ingen montör'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-orange-500 hover:bg-orange-500/90 text-white">Tidsstyrd leverans — tid ej satt</Badge>
                    <Button size="sm" variant="outline" onClick={() => setSelectedCase(c)}>Sätt tid</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Visit KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Antal besök</p>
          <p className="text-3xl font-bold text-card-foreground">{visits.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Tappat ordervärde <span className="text-xs">ex moms</span></p>
          <p className="text-3xl font-bold text-destructive">{formatAmount(lostValue)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Återkopplingar att följa</p>
          <p className="text-3xl font-bold" style={{ color: '#D97706' }}>{pendingFollowUps.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Snitt tid till avslut</p>
          <p className="text-3xl font-bold text-card-foreground">
            {(() => {
              const linked = (allVisits || []).filter(v => v.result === 'signerat' && v.case_id);
              if (!linked.length) return '–';
              const totalDays = linked.reduce((sum, v) => {
                const mc = (allCases || []).find(c => c.id === v.case_id);
                if (!mc) return sum;
                return sum + Math.abs(Math.floor((new Date(mc.created_at).getTime() - new Date(v.date).getTime()) / 86400000));
              }, 0);
              return `${Math.round(totalDays / linked.length)} dagar`;
            })()}
          </p>
        </div>
      </div>

      {/* Follow-up KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(() => {
          const signedLinked = (allVisits || []).filter(v => v.result === 'signerat' && v.case_id);
          const avgDaysToSign = signedLinked.length
            ? Math.round(signedLinked.reduce((sum, v) => {
                const mc = (allCases || []).find(c => c.id === v.case_id);
                if (!mc) return sum;
                return sum + Math.abs(Math.floor((new Date(mc.created_at).getTime() - new Date(v.date).getTime()) / 86400000));
              }, 0) / signedLinked.length)
            : null;
          const avgFollowUpsBeforeSign = signedLinked.length
            ? (signedLinked.reduce((s, v) => s + ((v as any).follow_up_count || 0), 0) / signedLinked.length).toFixed(1)
            : '–';
          const lostList = (allVisits || []).filter(v => v.lost);
          const avgFollowUpsBeforeLost = lostList.length
            ? (lostList.reduce((s, v) => s + ((v as any).follow_up_count || 0), 0) / lostList.length).toFixed(1)
            : '–';
          return (
            <>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Snitt tid besök → signering</p>
                <p className="text-3xl font-bold text-card-foreground">{avgDaysToSign != null ? `${avgDaysToSign} dagar` : '–'}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Snitt uppföljningar innan signering</p>
                <p className="text-3xl font-bold text-primary">{avgFollowUpsBeforeSign}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">Snitt uppföljningar innan tappad</p>
                <p className="text-3xl font-bold text-destructive">{avgFollowUpsBeforeLost}</p>
              </div>
            </>
          );
        })()}
      </div>
      {cityData.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Försäljning per ort</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Ort</th>
                  <th className="pb-2">Antal ärenden</th>
                  <th className="pb-2">Ordervärde <span className="text-xs font-normal">ex moms</span></th>
                  <th className="pb-2">
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help">
                            Hit rate <Info className="h-3 w-3 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Andel registrerade kundbesök som ledde till signerat avtal. Importerade ärenden räknas inte (de saknar besökshistorik).
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cityData.map(c => (
                  <tr key={c.city} className="border-t">
                    <td className="py-1.5 text-card-foreground font-medium">{c.city}</td>
                    <td className="py-1.5">{c.count}</td>
                    <td className="py-1.5">{formatAmount(c.value)}</td>
                    <td className="py-1.5 text-primary font-medium">
                      {c.hitRate !== null ? (
                        <>{c.hitRate}% <span className="text-xs text-muted-foreground font-normal">({c.visitSigned}/{c.visitTotal})</span></>
                      ) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data quality outliers */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          DATAKVALITET — {outlierCases.length > 0 ? `${outlierCases.length} ärenden att granska` : 'ärenden att granska'}
        </h3>
        {outlierCases.length === 0 ? (
          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-3 py-2 text-sm text-green-700 dark:text-green-300">
            Ingen avvikande data — allt ser bra ut ✓
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Adress</th>
                  <th className="pb-2">Säljare</th>
                  <th className="pb-2">Ordervärde <span className="text-xs font-normal">ex moms</span></th>
                  <th className="pb-2">TB%</th>
                  <th className="pb-2">Anledning</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {outlierCases.map(o => (
                  <tr key={o.caseData.id} className="border-t">
                    <td className="py-1.5">
                      <button
                        onClick={() => setSelectedCase(o.caseData)}
                        className="text-card-foreground font-medium hover:text-primary hover:underline text-left"
                      >
                        {o.caseData.address}
                      </button>
                    </td>
                    <td className="py-1.5">
                      {o.missingSeller
                        ? <span className="text-destructive italic">(saknas)</span>
                        : o.unknownSeller
                          ? <span className="text-destructive italic">(okänd: {o.seller})</span>
                          : o.caseData.seller}
                    </td>
                    <td className="py-1.5">{formatAmount(o.ov)}</td>
                    <td className="py-1.5">{o.tb != null ? `${o.tb}%` : '–'}</td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {o.highOV && (
                          <Badge className="bg-orange-500 hover:bg-orange-500/90 text-white">Högt ordervärde</Badge>
                        )}
                        {o.badTB && (
                          <Badge variant="destructive">Ogiltigt TB%</Badge>
                        )}
                        {o.unknownSeller && (
                          <Badge variant="destructive">Okänd säljare</Badge>
                        )}
                        {o.missingSeller && (
                          <Badge variant="destructive">Säljare saknas</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5">
                      <Button size="sm" variant="outline" onClick={() => setSelectedCase(o.caseData)}>Granska</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* ROW 3: Conversion funnel */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Konverteringstratt</h3>
        <div className="space-y-3">
          {funnel.map((f, i) => {
            const pct = maxFunnel ? Math.round((f.count / maxFunnel) * 100) : 0;
            return (
              <div key={f.step} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-card-foreground font-medium">{f.step}</span>
                  <span className="text-muted-foreground">{f.count} ({pct}%)</span>
                </div>
                <div className="h-6 bg-muted rounded overflow-hidden" style={{ width: '100%' }}>
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: `hsl(var(--primary) / ${1 - i * 0.15})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW 4: Reclamation & deviations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {devCostByTypeChart.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Reklamationskostnad per typ</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={devCostByTypeChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" fontSize={12} width={100} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString('sv-SE')} kr`} />
                  <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {devCostByRespChart.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Kostnad per ansvar</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={devCostByRespChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {devCostByRespChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toLocaleString('sv-SE')} kr`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Unresolved deviations */}
      {unresolvedList.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Olösta avvikelser ({unresolvedList.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Adress</th>
                  <th className="pb-2">Typ</th>
                  <th className="pb-2">Beskrivning</th>
                  <th className="pb-2">Dagar</th>
                </tr>
              </thead>
              <tbody>
                {unresolvedList.map(d => (
                  <tr key={d.id} className="border-t">
                    <td className="py-1.5 text-card-foreground font-medium">{d.address}</td>
                    <td className="py-1.5">{d.type}</td>
                    <td className="py-1.5 text-muted-foreground truncate max-w-[200px]">{d.description}</td>
                    <td className="py-1.5 font-medium text-destructive">{d.daysSince}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ROW 5: Montör statistics */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Montör-statistik</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2">Montör</th>
              <th className="pb-2">Montage</th>
              <th className="pb-2">Pågående</th>
              <th className="pb-2">Avvikelser</th>
              <th className="pb-2">Extra tim begärda</th>
            </tr>
          </thead>
          <tbody>
            {montorStats.map(m => (
              <tr key={m.name} className="border-t">
                <td className="py-1.5 text-card-foreground font-medium">{m.name}</td>
                <td className="py-1.5">{m.montage}</td>
                <td className="py-1.5">{m.pagaende}</td>
                <td className="py-1.5">{m.deviations}</td>
                <td className="py-1.5">{m.extraHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ROW 6: Lead times */}
      {leadTimes.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Genomsnittliga ledtider (dagar)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadTimes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="step" fontSize={11} width={180} />
                <Tooltip formatter={(v: number) => `${v} dagar`} />
                <Bar dataKey="days" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ROW 7: Extra hours analysis */}
      <div className="rounded-xl border bg-card p-4 space-y-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Extra timmar-analys</h3>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-primary">{totalSold} st</p>
            <p className="text-sm font-medium text-card-foreground">{formatAmount(soldRevenue)}</p>
            <p className="text-xs text-muted-foreground">Sålda (intäkt)</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-destructive">{totalApproved} st</p>
            <p className="text-sm font-medium text-card-foreground">{formatAmount(approvedCost)}</p>
            <p className="text-xs text-muted-foreground">Godkända (kostnad)</p>
          </div>
          <div className={`text-center p-3 rounded-lg ${netResult >= 0 ? 'bg-green-50' : 'bg-destructive/10'}`}>
            <p className={`text-2xl font-bold ${netResult >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {netResult >= 0 ? '+' : ''}{formatAmount(netResult)}
            </p>
            <p className="text-xs text-muted-foreground">Nettoresultat</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-card-foreground">{avgApprovedPerCase}</p>
            <p className="text-xs text-muted-foreground">Snitt godkända/ärende</p>
          </div>
        </div>

        {/* Per case table */}
        {extraHoursPerCase.length > 0 && (
          <>
            <h4 className="text-sm font-semibold text-muted-foreground">Extra timmar per ärende</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2">Adress</th>
                    <th className="pb-2">Montör</th>
                    <th className="pb-2 text-right">Sålda</th>
                    <th className="pb-2 text-right">Begärda</th>
                    <th className="pb-2 text-right">Godkända</th>
                    <th className="pb-2 text-right">Intäkt</th>
                    <th className="pb-2 text-right">Kostnad</th>
                    <th className="pb-2 text-right">Resultat</th>
                  </tr>
                </thead>
                <tbody>
                  {extraHoursPerCase.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 text-card-foreground font-medium truncate max-w-[150px]">{c.address}</td>
                      <td className="py-1.5">{c.team}</td>
                      <td className="py-1.5 text-right">{c.sold}</td>
                      <td className="py-1.5 text-right">{c.requested}</td>
                      <td className="py-1.5 text-right">{c.approved}</td>
                      <td className="py-1.5 text-right">{c.revenue.toLocaleString('sv-SE')}</td>
                      <td className="py-1.5 text-right">{c.cost.toLocaleString('sv-SE')}</td>
                      <td className={`py-1.5 text-right font-semibold ${c.result >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {c.result >= 0 ? '+' : ''}{c.result.toLocaleString('sv-SE')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Per montör table */}
        {extraHoursPerMontor.length > 0 && (
          <>
            <h4 className="text-sm font-semibold text-muted-foreground">Extra timmar per montör</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2">Montör</th>
                  <th className="pb-2 text-right">Ärenden</th>
                  <th className="pb-2 text-right">Begärda</th>
                  <th className="pb-2 text-right">Godkända</th>
                  <th className="pb-2 text-right">Kostnad</th>
                  <th className="pb-2 text-right">Snitt/ärende</th>
                </tr>
              </thead>
              <tbody>
                {extraHoursPerMontor.map(m => (
                  <tr key={m.name} className="border-t">
                    <td className="py-1.5 text-card-foreground font-medium">{m.name}</td>
                    <td className="py-1.5 text-right">{m.caseCount}</td>
                    <td className="py-1.5 text-right">{m.requested}</td>
                    <td className="py-1.5 text-right">{m.approved}</td>
                    <td className="py-1.5 text-right font-medium text-destructive">{m.cost.toLocaleString('sv-SE')} kr</td>
                    <td className="py-1.5 text-right">{m.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Monthly chart: sold vs approved */}
        {monthlyExtraChart.length > 0 && (
          <>
            <h4 className="text-sm font-semibold text-muted-foreground">Sålda vs godkända per månad (kr)</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyExtraChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString('sv-SE')} kr`} />
                  <Legend />
                  <Bar dataKey="Intäkt (sålda)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Kostnad (godkända)" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Per seller & hit rate */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ärenden per säljare</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Säljare</th>
                <th className="pb-2">Antal</th>
                <th className="pb-2">Ordervärde <span className="text-xs font-normal">ex moms</span></th>
              </tr>
            </thead>
            <tbody>
              {perSeller.map(s => (
                <tr key={s.name} className="border-t">
                  <td className="py-1.5 text-card-foreground">{s.name}</td>
                  <td className="py-1.5">{s.count}</td>
                  <td className="py-1.5">{formatAmount(s.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Hit rate per säljare</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Säljare</th>
                <th className="pb-2">Besök</th>
                <th className="pb-2">Signerat</th>
                <th className="pb-2">Hit rate</th>
              </tr>
            </thead>
            <tbody>
              {visitsPerSeller.map(s => (
                <tr key={s.name} className="border-t">
                  <td className="py-1.5 text-card-foreground">{s.name}</td>
                  <td className="py-1.5">{s.total}</td>
                  <td className="py-1.5">{s.signerat}</td>
                  <td className="py-1.5 font-medium text-primary">{s.hitRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      {monthlyChart.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ordervärde per månad <span className="text-xs normal-case">ex moms</span></h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v: number) => `${v.toLocaleString('sv-SE')} kr`} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Status breakdown */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Per status</h3>
        <div className="space-y-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <span className="text-card-foreground">{STATUS_LABELS[status] || status}</span>
              <span className="font-medium text-muted-foreground">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending follow-ups */}
      {pendingFollowUps.length > 0 && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
          <h3 className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-3">Återkopplingar att följa upp</h3>
          <div className="space-y-2">
            {pendingFollowUps.map((v) => (
              <div key={v.id} className="flex justify-between text-sm border-b border-yellow-200 pb-2">
                <div>
                  <span className="font-medium text-foreground">{v.customer_name}</span>
                  <span className="text-muted-foreground ml-2">{v.address}</span>
                </div>
                <span className="text-destructive font-medium">{v.follow_up_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Förlorade affärer */}
      {(() => {
        const lostVisits = visits.filter(v => v.lost);
        if (lostVisits.length === 0) return null;

        const LOST_COLORS: Record<string, string> = {
          konkurrent: 'hsl(var(--destructive))',
          pris: '#F59E0B',
          avvaktar: '#6B7280',
          finansiering: '#8B5CF6',
          renovering: '#10B981',
          ingen_kontakt: '#3B82F6',
          ovrigt: '#9CA3AF',
        };

        const totalLostValue = lostVisits.reduce((s, v) => s + (Number(v.order_value) || 0), 0);

        const reasonCounts: Record<string, number> = {};
        lostVisits.forEach(v => {
          const r = v.lost_reason || 'ovrigt';
          reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        });
        const topReasonKey = Object.entries(reasonCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
        const topReasonLabel = LOST_REASONS.find(r => r.value === topReasonKey)?.label || topReasonKey || '–';

        const reasonChart = Object.entries(reasonCounts).map(([key, count]) => ({
          name: LOST_REASONS.find(r => r.value === key)?.label || key,
          value: count,
          key,
        }));

        const competitorVisits = lostVisits.filter(v => v.lost_reason === 'konkurrent');
        const competitorMap: Record<string, { count: number; value: number }> = {};
        competitorVisits.forEach(v => {
          const k = v.lost_competitor || 'annan';
          if (!competitorMap[k]) competitorMap[k] = { count: 0, value: 0 };
          competitorMap[k].count++;
          competitorMap[k].value += Number(v.order_value) || 0;
        });
        const competitorRows = Object.entries(competitorMap)
          .map(([key, d]) => ({
            name: COMPETITORS.find(c => c.value === key)?.label || key,
            count: d.count,
            value: d.value,
          }))
          .sort((a, b) => b.value - a.value);

        const recent = [...lostVisits]
          .sort((a, b) => (b.created_at || b.date).localeCompare(a.created_at || a.date))
          .slice(0, 5);

        return (
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              <h3 className="text-base font-semibold text-card-foreground">Förlorade affärer</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Antal tappade</p>
                <p className="text-2xl font-bold text-destructive">{lostVisits.length}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Förlorat ordervärde</p>
                <p className="text-2xl font-bold text-destructive">{formatAmount(totalLostValue)}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Vanligaste anledning</p>
                <p className="text-lg font-semibold text-card-foreground">{topReasonLabel}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tappade affärer per anledning</h4>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={reasonChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {reasonChart.map((entry, i) => (
                      <Cell key={i} fill={LOST_COLORS[entry.key] || '#9CA3AF'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {competitorRows.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Förlorat till konkurrent</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2">Konkurrent</th>
                        <th className="py-2 text-right">Antal</th>
                        <th className="py-2 text-right">Förlorat värde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitorRows.map(r => (
                        <tr key={r.name} className="border-b">
                          <td className="py-2 font-medium text-card-foreground">{r.name}</td>
                          <td className="py-2 text-right">{r.count}</td>
                          <td className="py-2 text-right text-destructive font-medium">{formatAmount(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Senaste tappade affärer</h4>
              <div className="space-y-2">
                {recent.map(v => {
                  const reasonLabel = LOST_REASONS.find(r => r.value === v.lost_reason)?.label || v.lost_reason || '–';
                  const competitorLabel = v.lost_competitor
                    ? (COMPETITORS.find(c => c.value === v.lost_competitor)?.label || v.lost_competitor)
                    : null;
                  const comment = v.lost_comment && v.lost_comment.length > 80
                    ? v.lost_comment.substring(0, 80) + '…'
                    : v.lost_comment;
                  return (
                    <div key={v.id} className="rounded-lg border bg-background p-3 text-sm space-y-1">
                      <div className="flex justify-between gap-2">
                        <div>
                          <div className="font-medium text-card-foreground">{v.address}</div>
                          <div className="text-muted-foreground text-xs">{v.customer_name}</div>
                        </div>
                        {v.order_value != null && (
                          <span className="text-destructive font-medium whitespace-nowrap">
                            {Number(v.order_value).toLocaleString('sv-SE')} kr
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5">{reasonLabel}</span>
                        {competitorLabel && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{competitorLabel}</span>
                        )}
                      </div>
                      {comment && <p className="text-xs text-muted-foreground italic">"{comment}"</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedCase && (
        <CaseDetailPanel
          caseData={selectedCase}
          currentUser={sellerName}
          isSeller={true}
          onClose={() => setSelectedCase(null)}
        />
      )}
    </div>
  );
}
