// Lånereskontra: alla lånerader med löpande saldo + manuell rad.
// Manuella rader loggas till loggarket via consultant-payout (event 'Lånerad').
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { invokeConsultantPayout, fmtKr } from './consultantApi';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultant: any | null;
  loans: any[];
  onChanged: () => void;
  currentUser: string;
}

export function LoanLedgerSheet({ open, onOpenChange, consultant, loans, onChanged, currentUser }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  let running = 0;
  const rows = loans.map(l => {
    running += Number(l.amount);
    return { ...l, balance: running };
  });
  const total = running;

  const addRow = async () => {
    if (!consultant) return;
    const amountNum = Number(amount);
    if (!amountNum) { toast.error('Ange ett belopp (positivt = förskott, negativt = återbetalning)'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('consultant_loans').insert({
        consultant_id: consultant.id,
        date,
        amount: amountNum,
        note: note.trim() || null,
        created_by: currentUser || 'admin',
      });
      if (error) throw error;
      try {
        await invokeConsultantPayout({
          action: 'log', consultant_id: consultant.id, event: 'Lånerad',
          note: `${date} · ${amountNum > 0 ? '+' : ''}${amountNum} kr · ${note.trim()}`,
        });
        toast.success('Låneraden sparades');
      } catch (logErr) {
        toast.warning(`Raden sparades men loggningen misslyckades: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
      }
      setAmount(''); setNote('');
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Lånereskontra – {consultant?.name ?? ''}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga lånerader ännu.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead><TableHead>Anteckning</TableHead>
                    <TableHead>Faktura</TableHead><TableHead className="text-right">Belopp</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{l.date}</TableCell>
                      <TableCell className="text-xs">{l.note ?? '—'}</TableCell>
                      <TableCell>{l.invoice_number ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKr(l.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtKr(l.balance)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">Summa</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtKr(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          <section className="space-y-3">
            <h3 className="font-medium text-sm">Ny manuell rad</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Datum</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Belopp (+/−)</Label>
                <Input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="+ förskott, − återbetalning" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Anteckning</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <Button onClick={() => void addRow()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}Lägg till rad
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
