// Skapa utbetalning: tre grupper med kryssrutor och löpande summering.
// Förhandsvisningen räknas med src/lib/montorSettlement.ts; de sparade beloppen
// räknas alltid av create_montor_settlement i databasen.
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { allocateSettlement, formatKr, relatedInvoiceNotice, teamPayoutOverview, type AOrderLike, type DebitLike, type SettlementItemLike } from '@/lib/montorSettlement';
import { createMontorSettlement, SETTLEMENT_QUERY_KEYS } from '@/lib/montorSettlementActions';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: { id: string; name: string; company_name: string | null; bankgiro: string | null } | null;
  aOrders: AOrderLike[];
  debits: DebitLike[];
  items: SettlementItemLike[];
}

function Row({ id, checked, onChange, number, label, date, amount, extra }: { id: string; checked: boolean; onChange: (v: boolean) => void; number: string; label: string; date: string; amount: string; extra?: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-start gap-3 py-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(v === true)} className="mt-1 h-5 w-5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">{number}</span>
          <span className="tabular-nums font-medium">{amount}</span>
        </span>
        <span className="block break-words text-sm">{label || '—'}</span>
        <span className="block text-xs text-muted-foreground">{date}{extra}</span>
      </span>
    </label>
  );
}

export function CreateSettlementSheet({ open, onOpenChange, team, aOrders, debits, items }: Props) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [off, setOff] = useState<Set<string>>(new Set());

  const overview = useMemo(() => (team ? teamPayoutOverview(team.id, aOrders, debits, items) : null), [team, aOrders, debits, items]);
  useEffect(() => { if (open) { setOff(new Set()); setDate(new Date().toISOString().slice(0, 10)); } }, [open, team?.id]);

  const toggle = (id: string, on: boolean) => setOff(prev => { const n = new Set(prev); if (on) n.delete(id); else n.add(id); return n; });
  const invoices = overview?.invoices ?? [];
  const credits = overview?.credits ?? [];
  const deductions = overview?.deductions ?? [];
  const selInv = invoices.filter(i => !off.has(i.id));
  const selCred = credits.filter(c => !off.has(c.id));
  const selDed = deductions.filter(d => !off.has(d.id));
  const alloc = allocateSettlement({ invoices: selInv.map(i => i.amount), credits: selCred.map(c => c.amount), deductions: selDed });
  const allocById = new Map(alloc.allocations.map(a => [a.id, a]));
  const noBankgiro = !String(team?.bankgiro ?? '').trim();

  async function create() {
    if (!team || alloc.error || noBankgiro) return;
    setBusy(true);
    try {
      const row = await createMontorSettlement({
        teamId: team.id,
        invoiceIds: selInv.filter(i => i.kind === 'invoice').map(i => i.id),
        selfBillingIds: selInv.filter(i => i.kind === 'self_billing_invoice').map(i => i.id),
        creditNoteIds: selCred.map(c => c.id),
        deductionIds: selDed.filter(d => allocById.has(d.id)).map(d => d.id),
        date,
      });
      toast.success(`${row.settlement_number} skapad: ${formatKr(row.net_amount)} att utbetala`);
      SETTLEMENT_QUERY_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [...k] }));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skapa utbetalningen');
      qc.invalidateQueries({ queryKey: ['montor_settlement_data'] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="flex w-full flex-col gap-0 p-0 sm:max-w-xl max-h-[100dvh]">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Skapa utbetalning</SheetTitle>
          <SheetDescription>{team?.company_name || team?.name} · bankgiro {team?.bankgiro || 'saknas'}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
          {noBankgiro && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">Teamet saknar bankgiro. Komplettera under Montörsteam innan utbetalning.</p>}

          <section aria-labelledby="grp-a">
            <h3 id="grp-a" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">A. Självfakturor att betala</h3>
            {invoices.length === 0 ? <p className="py-2 text-muted-foreground">Inga obetalda självfakturor.</p> : (
              <div className="divide-y">{invoices.map(i => (
                <Row key={i.id} id={`a-${i.id}`} checked={!off.has(i.id)} onChange={v => toggle(i.id, v)} number={i.number} label={i.label} date={i.date} amount={formatKr(i.amount)}
                  extra={i.kind === 'self_billing_invoice' ? ' · KM-självfaktura' : undefined} />
              ))}</div>
            )}
          </section>

          {credits.length > 0 && (
            <section aria-labelledby="grp-b">
              <h3 id="grp-b" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">B. Kreditfakturor att kvitta</h3>
              <div className="divide-y">{credits.map(c => (
                <Row key={c.id} id={`b-${c.id}`} checked={!off.has(c.id)} onChange={v => toggle(c.id, v)} number={c.number} label={c.label} date={c.date} amount={`-${formatKr(Math.abs(c.amount))}`} />
              ))}</div>
            </section>
          )}

          <section aria-labelledby="grp-c">
            <h3 id="grp-c" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">C. Avdrag att kvitta</h3>
            {deductions.length === 0 ? <p className="py-2 text-muted-foreground">Inga öppna avdrag.</p> : (
              <div className="divide-y">{deductions.map(d => {
                const a = allocById.get(d.id);
                const selected = !off.has(d.id);
                const note = !selected ? '' : !a ? ' · räcker inte, ligger kvar till nästa utbetalning'
                  : a.remainingAfter > 0 ? ` · kvittas ${formatKr(a.take)}, kvar att kvitta ${formatKr(a.remainingAfter)}` : '';
                const missing = relatedInvoiceNotice(d.related_a_order_id, selInv.map(i => i.id));
                return (
                  <Row key={d.id} id={`c-${d.id}`} checked={selected} onChange={v => toggle(d.id, v)} number={d.number} label={d.label} date={d.date}
                    amount={`-${formatKr(a ? a.take : d.remaining)}`}
                    extra={<>{d.settled > 0 ? ` · av ${formatKr(d.total)}, ${formatKr(d.settled)} redan kvittat` : ''}{note}
                      {d.related_label && <span className="mt-0.5 block text-sm text-foreground">{d.related_label}</span>}
                      {missing && <span className="mt-0.5 block font-medium text-warning-ink dark:text-warning">{missing}</span>}</>} />
                );
              })}</div>
            )}
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="settle-date">Datum</Label>
            <Input id="settle-date" type="date" className="h-11 w-48" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="border-t bg-muted/30 p-5 text-sm" aria-live="polite">
          <div className="flex justify-between"><span className="text-muted-foreground">Summa fakturor</span><span className="tabular-nums">{formatKr(alloc.invoicesTotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Avgår kreditfakturor</span><span className="tabular-nums">-{formatKr(alloc.creditsTotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Avgår kvittade fordringar</span><span className="tabular-nums">-{formatKr(alloc.deductionsTotal)}</span></div>
          <div className="mt-1 flex justify-between border-t pt-1 text-base font-semibold"><span>Att utbetala</span><span className="tabular-nums">{formatKr(alloc.net)}</span></div>
          {alloc.error === 'no_invoice' && <p role="alert" className="mt-2 text-destructive">Välj minst en faktura att betala.</p>}
          {alloc.error === 'credits_exceed' && <p role="alert" className="mt-2 text-destructive">Kreditfakturorna är större än fakturorna. Kryssa i fler fakturor eller ur en kreditfaktura.</p>}
          <SheetFooter className="mt-4 gap-2 pb-[env(safe-area-inset-bottom)]">
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
            <Button className="h-11" onClick={create} disabled={busy || !!alloc.error || noBankgiro || !date}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Skapa specifikation
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
