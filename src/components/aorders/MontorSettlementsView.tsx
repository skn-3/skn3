// "Utbetala till montör" (fliken Utbetalningar): översikt per team, skapa
// utbetalningsspecifikation (UTB-serien) och historik med åtgärder.
// Kvittning sker bara här – aldrig på självfakturan.
import { forwardRef, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Ban, ClipboardCopy, FileText, Loader2, MinusCircle, Send, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMontorSettlementData, useMontorSettlementList, type SettlementTeam } from '@/hooks/useMontorSettlements';
import { formatKr, settlementPaymentLine, settlementStatusText, teamPayoutOverview } from '@/lib/montorSettlement';
import { cancelSettlement, markSettlementPaid, openSettlementPdf, sendSettlement, SETTLEMENT_QUERY_KEYS, undoSettlementPaid } from '@/lib/montorSettlementActions';
import { CreateSettlementSheet } from './CreateSettlementSheet';
import { MontorDebitInvoiceDialog } from './MontorDebitInvoiceDialog';

interface Props { currentUser: string; canManage: boolean }

const STATUS_CLS: Record<string, string> = {
  created: 'bg-secondary text-secondary-foreground hover:bg-secondary',
  sent: 'bg-primary text-primary-foreground hover:bg-primary',
  paid: 'bg-success text-success-foreground hover:bg-success',
  cancelled: 'bg-muted text-muted-foreground hover:bg-muted line-through',
};

export const MontorSettlementsView = forwardRef<HTMLElement, Props>(function MontorSettlementsView({ currentUser, canManage }, ref) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const data = useMontorSettlementData();
  const list = useMontorSettlementList();
  const [createFor, setCreateFor] = useState<SettlementTeam | null>(null);
  const [deductFor, setDeductFor] = useState<{ teamId: string | null } | null>(null);
  const [payFor, setPayFor] = useState<any | null>(null);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cancelFor, setCancelFor] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const d = data.data;
  const overview = useMemo(() => {
    if (!d) return [];
    return d.teams.map(t => ({ team: t, ...teamPayoutOverview(t.id, d.aOrders, d.debits, d.items) }))
      .filter(r => r.team.is_active || r.invoices.length || r.deductions.length || r.credits.length);
  }, [d]);

  const refresh = () => SETTLEMENT_QUERY_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [...k] }));
  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try { await fn(); if (ok) toast.success(ok); refresh(); }
    catch (e: any) { toast.error(e?.message || 'Något gick fel'); }
    finally { setBusy(null); }
  }
  async function copyLine(s: any) {
    const line = settlementPaymentLine(s);
    try { await navigator.clipboard.writeText(line); toast.success('Betalningsraden är kopierad'); }
    catch { toast.error(`Kunde inte kopiera. Raden: ${line}`); }
  }

  return (
    <section ref={ref} id="utbetala-till-montor" tabIndex={-1} aria-labelledby="utbetala-heading" className="space-y-4 outline-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="utbetala-heading" className="text-lg font-semibold">Utbetala till montör</h3>
          <p className="text-xs text-muted-foreground">Självfakturor som betalas minus kreditfakturor och avdrag. Kvittning bara inom samma team.</p>
        </div>
        {canManage && <Button variant="outline" className="h-11 gap-2" onClick={() => setDeductFor({ teamId: null })}><MinusCircle className="h-4 w-4" />Registrera avdrag</Button>}
      </div>

      {data.isLoading ? <Skeleton className="h-32 w-full" /> : data.error ? (
        <p className="text-sm text-destructive">Kunde inte läsa underlaget: {(data.error as Error).message}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {overview.map(r => {
            const net = r.allocation.error ? null : r.allocation.net;
            return (
              <article key={r.team.id} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="font-semibold break-words">{r.team.company_name || r.team.name}</h4>
                  <span className="text-xs text-muted-foreground">{r.team.name}</span>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Obetalda självfakturor ({r.invoices.length})</dt><dd className="tabular-nums">{formatKr(r.invoicesSum)}</dd></div>
                  {r.credits.length > 0 && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Kreditfakturor att kvitta ({r.credits.length})</dt><dd className="tabular-nums">-{formatKr(r.creditsSum)}</dd></div>}
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Öppna avdrag ({r.deductions.length})</dt><dd className="tabular-nums">-{formatKr(r.deductionsOpen)}</dd></div>
                  <div className="flex justify-between gap-2 border-t pt-1 font-semibold"><dt>Netto</dt><dd className="tabular-nums">{net === null ? '—' : formatKr(net)}</dd></div>
                  {r.allocation.allocations.some(a => a.remainingAfter > 0) || r.allocation.untouched.length > 0
                    ? <p className="text-xs text-muted-foreground">Fakturorna räcker inte till alla avdrag. Resten ligger kvar till nästa utbetalning.</p> : null}
                  {!String(r.team.bankgiro ?? '').trim() && <p className="text-xs text-destructive">Bankgiro saknas.</p>}
                </dl>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button className="h-11 flex-1" disabled={r.invoices.length === 0} onClick={() => setCreateFor(r.team)}>Skapa utbetalning</Button>
                    <Button variant="outline" className="h-11" onClick={() => setDeductFor({ teamId: r.team.id })}>Registrera avdrag</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Utbetalningsspecifikationer</h4>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Nummer</th><th className="px-3 py-2 text-left">Team</th><th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-right">Fakturor</th><th className="px-3 py-2 text-right">Avdrag</th><th className="px-3 py-2 text-right">Netto</th>
                <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Laddar...</td></tr>}
              {!list.isLoading && (list.data ?? []).length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Inga utbetalningar ännu.</td></tr>}
              {(list.data ?? []).map(s => {
                const nInv = (s.montor_settlement_items ?? []).filter((i: any) => i.item_kind === 'invoice' || i.item_kind === 'self_billing_invoice').length;
                const deducted = Number(s.credits_total || 0) + Number(s.deductions_total || 0);
                const isBusy = busy === s.id;
                return (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-2 font-mono">{s.settlement_number}</td>
                    <td className="px-3 py-2">{s.company_name || s.montor_teams?.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.settlement_date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKr(s.invoices_total)}<div className="text-[11px] text-muted-foreground">{nInv} {nInv === 1 ? 'faktura' : 'fakturor'}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{deducted ? `-${formatKr(deducted)}` : formatKr(0)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKr(s.net_amount)}</td>
                    <td className="px-3 py-2">
                      <Badge className={STATUS_CLS[s.status] ?? ''}>{settlementStatusText(s)}</Badge>
                      {s.sent_at && <div className="mt-1 text-[11px] text-muted-foreground">Skickad {new Date(s.sent_at).toLocaleDateString('sv-SE')}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-11 gap-1" disabled={isBusy} onClick={() => run(s.id, () => openSettlementPdf(s), '')}>
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Visa PDF
                        </Button>
                        {s.status !== 'cancelled' && <Button variant="outline" size="sm" className="h-11 gap-1" onClick={() => copyLine(s)}><ClipboardCopy className="h-4 w-4" />Kopiera betalningsrad</Button>}
                        {canManage && s.status !== 'cancelled' && (
                          <Button variant="outline" size="sm" className="h-11 gap-1" disabled={isBusy} onClick={() => run(s.id, async () => { const r = await sendSettlement(s.id); if (r?.skipped) toast.info('Utkast: inget riktigt mejl skickades'); }, `${s.settlement_number} skickad`)}>
                            <Send className="h-4 w-4" />{s.sent_at ? 'Skicka igen' : 'Skicka'}
                          </Button>
                        )}
                        {canManage && (s.status === 'created' || s.status === 'sent') && (
                          <Button variant="outline" size="sm" className="h-11 gap-1" disabled={isBusy} onClick={() => { setPayFor(s); setPayDate(new Date().toISOString().slice(0, 10)); }}>
                            <Banknote className="h-4 w-4" />Markera som betald
                          </Button>
                        )}
                        {canManage && s.status === 'paid' && (
                          <Button variant="outline" size="sm" className="h-11 gap-1" disabled={isBusy} onClick={() => run(s.id, () => undoSettlementPaid(s.id), 'Betalmarkeringen är ångrad')}>
                            <Undo2 className="h-4 w-4" />Ångra betald
                          </Button>
                        )}
                        {canManage && (s.status === 'created' || s.status === 'sent') && (
                          <Button variant="outline" size="sm" className="h-11 gap-1 text-destructive" disabled={isBusy} onClick={() => setCancelFor(s)}>
                            <Ban className="h-4 w-4" />Makulera
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CreateSettlementSheet open={!!createFor} onOpenChange={v => { if (!v) setCreateFor(null); }} team={createFor}
        aOrders={d?.aOrders ?? []} debits={d?.debits ?? []} items={d?.items ?? []} />

      <MontorDebitInvoiceDialog open={!!deductFor} onOpenChange={v => { if (!v) setDeductFor(null); }} currentUser={currentUser} initialTeamId={deductFor?.teamId ?? null} />

      <Sheet open={!!payFor} onOpenChange={v => { if (!v && busy !== payFor?.id) setPayFor(null); }}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} className="w-full space-y-5 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Markera {payFor?.settlement_number} som betald</SheetTitle>
            <SheetDescription>{payFor ? `${formatKr(payFor.net_amount)} till ${payFor.company_name}. Fakturorna i specifikationen markeras betalda samma dag.` : ''}</SheetDescription>
          </SheetHeader>
          <div className="space-y-1.5">
            <Label htmlFor="settle-paid-date">Betaldatum</Label>
            <Input id="settle-paid-date" type="date" className="h-11" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setPayFor(null)} disabled={busy === payFor?.id}>Avbryt</Button>
            <Button className="h-11" disabled={!payDate || busy === payFor?.id} onClick={async () => { const s = payFor; await run(s.id, () => markSettlementPaid(s.id, payDate), `${s.settlement_number} markerad betald`); setPayFor(null); }}>
              {busy === payFor?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Bekräfta betald
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={!!cancelFor} onOpenChange={v => { if (!v && busy !== cancelFor?.id) setCancelFor(null); }}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} className="w-full space-y-5 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Makulera {cancelFor?.settlement_number}?</SheetTitle>
            <SheetDescription>Fakturorna och avdragen blir lediga för en ny utbetalning. Numret återanvänds aldrig.{cancelFor?.sent_at ? ' Specifikationen är redan skickad – meddela montören.' : ''}</SheetDescription>
          </SheetHeader>
          <SheetFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setCancelFor(null)} disabled={busy === cancelFor?.id}>Behåll</Button>
            <Button variant="destructive" className="h-11" disabled={busy === cancelFor?.id} onClick={async () => { const s = cancelFor; await run(s.id, () => cancelSettlement(s.id), `${s.settlement_number} makulerad`); setCancelFor(null); }}>
              {busy === cancelFor?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Makulera
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
});
