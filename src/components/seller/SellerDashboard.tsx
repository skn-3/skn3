import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllCases, fetchAllDeviations, fetchAllVisits } from '@/lib/supabaseClient';
import { STATUS_LABELS, SELLERS } from '@/lib/constants';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SellerDashboardProps {
  sellerName: string;
}

export function SellerDashboard({ sellerName }: SellerDashboardProps) {
  const [filterSeller, setFilterSeller] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: allCases, isLoading: loadingCases } = useQuery({
    queryKey: ['cases_all'],
    queryFn: fetchAllCases,
  });

  const { data: allDeviations } = useQuery({
    queryKey: ['deviations_all'],
    queryFn: fetchAllDeviations,
  });

  const { data: allVisits } = useQuery({
    queryKey: ['visits_all'],
    queryFn: fetchAllVisits,
  });

  if (loadingCases) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const cases = (allCases || []).filter((c) => {
    if (filterSeller !== 'all' && c.seller !== filterSeller) return false;
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
  const tbValues = cases.filter((c) => c.tb_percent != null).map((c) => Number(c.tb_percent));
  const avgTb = tbValues.length ? (tbValues.reduce((a, b) => a + b, 0) / tbValues.length).toFixed(1) : '–';
  const unresolvedDevs = filteredDeviations.filter((d) => !d.resolved).length;

  const statusCounts = cases.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Per seller table
  const perSeller = SELLERS.reduce((acc, s) => {
    const sc = (allCases || []).filter((c) => c.seller === s);
    acc.push({
      name: s,
      count: sc.length,
      value: sc.reduce((sum, c) => sum + (Number(c.order_value) || 0), 0),
    });
    return acc;
  }, [] as { name: string; count: number; value: number }[]);

  // Monthly order value
  const monthlyData = cases.reduce((acc, c) => {
    const month = c.created_at.substring(0, 7);
    acc[month] = (acc[month] || 0) + (Number(c.order_value) || 0);
    return acc;
  }, {} as Record<string, number>);
  const monthlyChart = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }));

  // Visit KPIs
  const visitsPerSeller = SELLERS.map((s) => {
    const sv = (allVisits || []).filter((v) => v.seller === s);
    const signerat = sv.filter((v) => v.result === 'signerat').length;
    return {
      name: s,
      total: sv.length,
      signerat,
      hitRate: sv.length ? ((signerat / sv.length) * 100).toFixed(0) : '0',
    };
  });

  const nejVisits = visits.filter((v) => v.result === 'nej');
  const lostValue = nejVisits.reduce((sum, v) => sum + (Number(v.order_value) || 0), 0);

  const today = new Date().toISOString().split('T')[0];
  const pendingFollowUps = (allVisits || []).filter(
    (v) => v.result === 'aterkoppla' && !v.case_id && v.follow_up_date && v.follow_up_date <= today
  );

  // Monthly visits
  const monthlyVisits = visits.reduce((acc, v) => {
    const month = v.date.substring(0, 7);
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const monthlyVisitsChart = Object.entries(monthlyVisits)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  // Avg time to close
  const linkedVisits = (allVisits || []).filter((v) => v.result === 'signerat' && v.case_id);
  const avgDaysToClose = linkedVisits.length
    ? (() => {
        const totalDays = linkedVisits.reduce((sum, v) => {
          const matchingCase = (allCases || []).find((c) => c.id === v.case_id);
          if (!matchingCase) return sum;
          const visitDate = new Date(v.date);
          const caseDate = new Date(matchingCase.created_at);
          return sum + Math.abs(Math.floor((caseDate.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24)));
        }, 0);
        return Math.round(totalDays / linkedVisits.length);
      })()
    : null;

  return (
    <div className="space-y-6 px-4 md:px-0">
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
            <Label className="text-xs">Från</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Till</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Antal ärenden</p>
          <p className="text-3xl font-bold text-card-foreground">{cases.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Totalt ordervärde</p>
          <p className="text-3xl font-bold text-primary">{totalValue.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">TB% genomsnitt</p>
          <p className="text-3xl font-bold text-card-foreground">{avgTb}%</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Avvikelser</p>
          <p className="text-3xl font-bold text-card-foreground">{filteredDeviations.length}</p>
          <p className="text-xs text-destructive">{unresolvedDevs} olösta</p>
        </div>
      </div>

      {/* Visit KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Antal besök</p>
          <p className="text-3xl font-bold text-card-foreground">{visits.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Tappat ordervärde</p>
          <p className="text-3xl font-bold text-destructive">{lostValue.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Återkopplingar att följa</p>
          <p className="text-3xl font-bold text-yellow-600">{pendingFollowUps.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Snitt tid till avslut</p>
          <p className="text-3xl font-bold text-card-foreground">{avgDaysToClose != null ? `${avgDaysToClose} dagar` : '–'}</p>
        </div>
      </div>

      {/* Per seller */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ärenden per säljare</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Säljare</th>
                <th className="pb-2">Antal</th>
                <th className="pb-2">Ordervärde</th>
              </tr>
            </thead>
            <tbody>
              {perSeller.map((s) => (
                <tr key={s.name} className="border-t">
                  <td className="py-1.5 text-card-foreground">{s.name}</td>
                  <td className="py-1.5">{s.count}</td>
                  <td className="py-1.5">{s.value.toLocaleString('sv-SE')} kr</td>
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
              {visitsPerSeller.map((s) => (
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
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ordervärde per månad</h3>
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

      {monthlyVisitsChart.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Besök per månad</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyVisitsChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
    </div>
  );
}
