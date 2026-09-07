import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Maximize2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const fmtKr = (n: number) => `${Math.round(n).toLocaleString('sv-SE')} kr`;

function weekRange(offset: number): { start: Date; end: Date; num: number; label: string } {
  const now = new Date();
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // mån=0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + offset * 7);
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 7);
  const thursday = new Date(start);
  thursday.setDate(thursday.getDate() + 3);
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  const num = Math.ceil(((+thursday - +jan1) / 86400000 + 1) / 7);
  const f = (x: Date) => x.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  const endShow = new Date(end);
  endShow.setDate(endShow.getDate() - 1);
  return { start, end, num, label: `${f(start)} – ${f(endShow)}` };
}

export default function WeeklyPresentation() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(-1); // default: förra veckan
  const wk = weekRange(offset);
  const prev = weekRange(offset - 1);

  const { data } = useQuery({
    queryKey: ['weekly-presentation-data'],
    queryFn: async () => {
      const [casesRes, visitsRes, offersRes] = await Promise.all([
        (supabase as any).from('cases').select('id, created_at, seller, order_value, customer_name, address, status'),
        (supabase as any).from('visits').select('id, date, seller, result, customer_name, address, lost, lost_reason, lost_competitor, lost_comment'),
        (supabase as any).from('offers').select('id, accepted_at, status, customer_name, title, total_after_rot'),
      ]);
      return { cases: casesRes.data ?? [], visits: visitsRes.data ?? [], offers: offersRes.data ?? [] };
    },
    staleTime: 60_000,
  });

  const S = useMemo(() => {
    const cases = (data?.cases ?? []) as any[];
    const visits = (data?.visits ?? []) as any[];
    const offers = (data?.offers ?? []) as any[];
    const inWeek = (iso: string | null, w: { start: Date; end: Date }) =>
      !!iso && new Date(iso) >= w.start && new Date(iso) < w.end;

    const wkCases = cases.filter((c) => inWeek(c.created_at, wk));
    const prevCases = cases.filter((c) => inWeek(c.created_at, prev));
    const wkVisits = visits.filter((v) => inWeek(v.date, wk));
    const wkLost = visits.filter((v) => v.lost && inWeek(v.date, wk));
    const wkOffers = offers.filter((o) => inWeek(o.accepted_at, wk));

    const sum = (arr: any[], f: (x: any) => number) => arr.reduce((s, x) => s + (f(x) || 0), 0);
    const total = sum(wkCases, (c) => Number(c.order_value));
    const prevTotal = sum(prevCases, (c) => Number(c.order_value));
    const signedVisits = wkVisits.filter((v) => v.result === 'signerat').length;
    const hitRate = wkVisits.length > 0 ? Math.round((signedVisits / wkVisits.length) * 100) : null;

    const sellers = Array.from(new Set([...wkCases.map((c) => c.seller), ...wkVisits.map((v) => v.seller)].filter(Boolean)));
    const perSeller = sellers.map((s) => {
      const mc = wkCases.filter((c) => c.seller === s);
      const pc = prevCases.filter((c) => c.seller === s);
      const mv = wkVisits.filter((v) => v.seller === s);
      const sv = mv.filter((v) => v.result === 'signerat').length;
      return {
        seller: s,
        visits: mv.length,
        signings: mc.length,
        hitRate: mv.length > 0 ? Math.round((sv / mv.length) * 100) : null,
        value: sum(mc, (c) => Number(c.order_value)),
        prevValue: sum(pc, (c) => Number(c.order_value)),
      };
    }).sort((a, b) => b.value - a.value);

    const trend = Array.from({ length: 8 }, (_, i) => {
      const w = weekRange(offset - 7 + i);
      const v = sum(cases.filter((c) => inWeek(c.created_at, w)), (c) => Number(c.order_value));
      return { name: `v.${w.num}`, value: Math.round(v), current: i === 7 };
    });

    const deals = [...wkCases].sort((a, b) => (Number(b.order_value) || 0) - (Number(a.order_value) || 0));
    return { total, prevTotal, wkCases, wkVisits, wkLost, wkOffers, signedVisits, hitRate, perSeller, trend, deals };
  }, [data, offset]);

  const delta = S.prevTotal > 0 ? Math.round(((S.total - S.prevTotal) / S.prevTotal) * 100) : null;

  const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) => (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs mt-1">{sub}</div>}
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-screen-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
            </Button>
            <h1 className="text-xl font-bold">Veckomöte</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[160px]">
              <div className="font-semibold">Vecka {wk.num}</div>
              <div className="text-xs text-muted-foreground">{wk.label}</div>
            </div>
            <Button variant="outline" size="icon" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => document.documentElement.requestFullscreen?.()}>
              <Maximize2 className="h-4 w-4 mr-1" /> Helskärm
            </Button>
          </div>
        </div>

        {/* KPI-rad */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Kpi
            label="Signerat värde"
            value={fmtKr(S.total)}
            sub={
              delta != null ? (
                <span className={delta >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                  {delta >= 0 ? '+' : ''}{delta}% vs v.{prev.num}
                </span>
              ) : (
                'ex moms'
              )
            }
          />
          <Kpi label="Nya ärenden" value={String(S.wkCases.length)} sub={`${S.wkVisits.length} besök`} />
          <Kpi label="Signerade besök" value={String(S.signedVisits)} sub={`av ${S.wkVisits.length} besök`} />
          <Kpi label="Hit rate" value={S.hitRate != null ? `${S.hitRate}%` : '—'} sub="signerade / besök" />
        </div>

        {/* Per säljare */}
        <Card className="p-4 mt-4">
          <h2 className="font-semibold mb-3">Per säljare</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Säljare</th>
                  <th className="py-2 pr-3 font-medium">Besök</th>
                  <th className="py-2 pr-3 font-medium">Signeringar</th>
                  <th className="py-2 pr-3 font-medium">Hit rate</th>
                  <th className="py-2 pr-3 font-medium">Signerat värde</th>
                  <th className="py-2 font-medium">Δ förra veckan</th>
                </tr>
              </thead>
              <tbody>
                {S.perSeller.map((r) => {
                  const d = r.prevValue > 0 ? Math.round(((r.value - r.prevValue) / r.prevValue) * 100) : null;
                  return (
                    <tr key={r.seller} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.seller}</td>
                      <td className="py-2 pr-3">{r.visits}</td>
                      <td className="py-2 pr-3">{r.signings}</td>
                      <td className="py-2 pr-3">{r.hitRate != null ? `${r.hitRate}%` : '—'}</td>
                      <td className="py-2 pr-3">{fmtKr(r.value)}</td>
                      <td className={`py-2 ${d != null ? (d >= 0 ? 'text-emerald-600' : 'text-red-600') : ''}`}>
                        {d == null ? '—' : `${d >= 0 ? '+' : ''}${d}%`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Totalt</td>
                  <td className="py-2 pr-3">{S.wkVisits.length}</td>
                  <td className="py-2 pr-3">{S.wkCases.length}</td>
                  <td className="py-2 pr-3">{S.hitRate != null ? `${S.hitRate}%` : '—'}</td>
                  <td className="py-2 pr-3">{fmtKr(S.total)}</td>
                  <td className="py-2" />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Två spalter */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Veckans affärer</h2>
            {S.deals.length === 0 && <p className="text-sm text-muted-foreground">Inga signeringar denna vecka.</p>}
            <div className="space-y-2">
              {S.deals.slice(0, 10).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span className="truncate">{c.address} · {c.customer_name} · {c.seller}</span>
                  <span className="font-semibold shrink-0">{fmtKr(Number(c.order_value) || 0)}</span>
                </div>
              ))}
              {S.deals.length > 10 && (
                <p className="text-xs text-muted-foreground">+ {S.deals.length - 10} till</p>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Tappade denna vecka</h2>
            {S.wkLost.length === 0 && <p className="text-sm text-muted-foreground">Inga tappade affärer registrerade.</p>}
            <div className="space-y-2">
              {S.wkLost.map((v: any) => (
                <div key={v.id} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{v.address || v.customer_name} · {v.seller}</span>
                    <span className="text-red-600 shrink-0">
                      {v.lost_reason || 'okänd anledning'}{v.lost_competitor ? ` · ${v.lost_competitor}` : ''}
                    </span>
                  </div>
                  {v.lost_comment && <p className="text-xs text-muted-foreground mt-0.5">{v.lost_comment}</p>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Nedre rad */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Egna entreprenader — accepterade offerter</h2>
            {S.wkOffers.length === 0 && <p className="text-sm text-muted-foreground">Inga accepterade offerter denna vecka.</p>}
            <div className="space-y-2">
              {S.wkOffers.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <span className="truncate">{o.title || o.customer_name} · {o.customer_name}</span>
                  <span className="font-semibold shrink-0">{fmtKr(Number(o.total_after_rot) || 0)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Signerat värde — 8 veckor</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={S.trend}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => fmtKr(Number(v))} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {S.trend.map((t, i) => (
                      <Cell key={i} fill={t.current ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
