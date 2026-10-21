// "Min lön" – konsultens egen läsvy. Inga adminfunktioner, inga Drive-länkar, ingen redigering.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Chip } from '@/components/ui/chip';
import { monthLabel } from '@/lib/consultantPay';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { invokeConsultantDrive, invokeConsultantSelf, fmtKr, DOC_TYPE_LABELS } from './consultantApi';
import { NextPayoutCard, PAYOUT_STATUS } from './NextPayoutCard';

interface Overview {
  consultant: { id: string; name: string; company_name: string; payer_name: string };
  preview: any | null;
  payouts: any[];
  loans: Array<{ id: string; date: string; amount: number; note: string | null; balance: number }>;
  loan_balance: number;
  paid_this_year: number;
}

const fmtLoan = (n: number) => (n < 0 ? `−${fmtKr(Math.abs(n))}` : n > 0 ? `+${fmtKr(n)}` : '—');

export function MyPayView() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setData(await invokeConsultantSelf<Overview>({ action: 'overview' }));
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refreshPreview = async (force: boolean) => {
    if (!data) return;
    setRefreshing(true);
    try {
      const r = await invokeConsultantDrive<{ preview: any }>({ action: 'preview', consultant_id: data.consultant.id, force });
      setData(d => (d ? { ...d, preview: r.preview } : d));
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setRefreshing(false);
  };

  // Hämta en färsk förhandsvisning en gång vid laddning (återanvänder sparad tolkning om underlaget är oförändrat).
  const consultantId = data?.consultant.id;
  useEffect(() => { if (consultantId) void refreshPreview(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [consultantId]);

  const openPdf = (payoutId: string, which: 'invoice' | 'spec') => {
    void openDocumentInNewTab(async () => {
      const r = await invokeConsultantSelf<{ url: string }>({ action: 'pdf', payout_id: payoutId, which });
      return r.url;
    }).then(ok => { if (!ok) toast.error('Kunde inte öppna PDF:en'); });
  };

  if (loading) {
    return <div className="px-4 md:px-0 space-y-4 max-w-4xl mx-auto"><Skeleton className="h-56 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }
  if (error || !data) {
    return <div className="px-4 md:px-0 max-w-4xl mx-auto"><Card><CardContent className="p-6 text-sm text-muted-foreground">{error ?? 'Ingen data.'}</CardContent></Card></div>;
  }

  const latest = data.payouts.find(p => p.invoice_number);
  const existing = data.preview?.existing_payout_id ? data.payouts.find(p => p.id === data.preview.existing_payout_id) : null;

  return (
    <div className="px-4 md:px-0 space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold">Min lön</h2>
        <p className="text-sm text-muted-foreground">{data.consultant.company_name} · fakturerar {data.consultant.payer_name}</p>
      </div>

      <NextPayoutCard
        preview={data.preview}
        loading={refreshing && !data.preview}
        refreshing={refreshing}
        onRefresh={() => void refreshPreview(true)}
        existingPayout={existing}
        footnote="Preliminärt – kvitton och eventuell amortering dras vid körningen"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Utbetalt i år (netto ex moms)</div><div className="text-2xl font-semibold tabular-nums mt-1">{fmtKr(data.paid_this_year)}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Lånesaldo</div><div className="text-2xl font-semibold tabular-nums mt-1">{fmtKr(data.loan_balance)}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Senaste faktura</div>
          <div className="text-lg font-semibold tabular-nums mt-1">{latest ? `nr ${latest.invoice_number} · ${latest.invoice_date ?? '—'}` : 'Ingen ännu'}</div>
          {latest && <div className="text-sm text-muted-foreground tabular-nums">{fmtKr(latest.total_incl_vat)} inkl. moms</div>}
        </CardContent></Card>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-bold">Utbetalningar</h3>
        {data.payouts.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Inga utbetalningar ännu.</CardContent></Card>
        ) : data.payouts.map(p => {
          const st = PAYOUT_STATUS[p.status];
          const loan = Number(p.loan_change) || 0;
          const lines = (p.lines ?? []).filter((l: any) => l.included);
          const isOpen = !!open[p.id];
          return (
            <Card key={p.id}>
              <CardContent className="p-5 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-start">
                  <div>
                    <div className="font-bold text-base">{p.kind === 'advance' ? 'Förskott' : p.payout_month ? monthLabel(p.payout_month) : '—'}</div>
                    <div className="text-xs text-muted-foreground">{p.period_start && p.period_end ? `${p.period_start} – ${p.period_end}` : p.invoice_date ?? ''}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {st && <Chip tone={st.tone}>{st.label}</Chip>}
                      {p.kind === 'advance' && <Chip tone="warning">Förskott</Chip>}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums space-y-0.5">
                    {p.kind !== 'advance' && <div>TB {fmtKr(p.tb_amount)} → {p.tier_pct ?? '—'} % → {fmtKr(p.commission_gross)}</div>}
                    {p.kind !== 'advance' && <div className="text-muted-foreground">− Avdrag {fmtKr(p.deductions_total)}</div>}
                    <div className="text-muted-foreground">Lån {fmtLoan(loan)}</div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-2xl font-semibold tabular-nums">{fmtKr(p.net_amount)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{fmtKr(p.total_incl_vat)} inkl. moms</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.invoice_pdf_path && <Button size="sm" variant="outline" onClick={() => openPdf(p.id, 'invoice')}><FileText className="h-4 w-4 mr-1" />Faktura</Button>}
                  {p.spec_pdf_path && <Button size="sm" variant="outline" onClick={() => openPdf(p.id, 'spec')}><FileText className="h-4 w-4 mr-1" />Specifikation</Button>}
                  {p.kind !== 'advance' && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))} aria-expanded={isOpen}>
                      {isOpen ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}Visa avdrag
                    </Button>
                  )}
                </div>
                {isOpen && (
                  lines.length === 0 ? <p className="text-sm text-muted-foreground">Inga avdrag den här månaden.</p> : (
                    <ul className="divide-y divide-border border-t border-border">
                      {lines.map((l: any) => (
                        <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium">{DOC_TYPE_LABELS[l.doc_type ?? ''] ?? (l.kind === 'standard' ? 'Standardavdrag' : 'Avdrag')}</div>
                            <div className="text-xs text-muted-foreground">{l.label}{l.doc_date ? ` · ${l.doc_date}` : ''}</div>
                          </div>
                          <span className="tabular-nums shrink-0">{fmtKr(l.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3 pb-4">
        <h3 className="text-lg font-bold">Lån</h3>
        <Card>
          <CardContent className="p-0">
            {data.loans.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Inga lånerörelser.</p> : (
              <ul className="divide-y divide-border">
                {data.loans.map(l => (
                  <li key={l.id} className="grid grid-cols-[auto_1fr_auto] gap-3 px-5 py-3 text-sm items-baseline">
                    <span className="tabular-nums text-muted-foreground">{l.date}</span>
                    <span className="min-w-0 truncate">{l.note || (Number(l.amount) > 0 ? 'Förskott' : 'Amortering')}</span>
                    <span className="text-right tabular-nums">{fmtLoan(Number(l.amount))}<span className="block text-xs text-muted-foreground">saldo {fmtKr(l.balance)}</span></span>
                  </li>
                ))}
                <li className="flex justify-between px-5 py-3 font-semibold"><span>Saldo</span><span className="tabular-nums">{fmtKr(data.loan_balance)}</span></li>
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
      {refreshing && <span className="sr-only"><Loader2 /></span>}
    </div>
  );
}
