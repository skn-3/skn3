// Förskottsfaktura: skapar ett förskott (advance) via consultant-payout,
// reserverar fakturanummer och sparar faktura-PDF:en. Ingen specifikation.
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildConsultantInvoicePdf } from '@/lib/consultantInvoicePdf';
import { consultantInvoicePdfName } from '@/lib/pdfNames';
import { invokeConsultantPayout, blobToBase64, fmtKr , archiveAfterCreate } from './consultantApi';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultant: any | null;
  loanBalance: number;
  currentUser: string;
  onDone: () => void;
  onCreated?: (payoutId: string) => void;
}

export function AdvanceInvoiceDialog({ open, onOpenChange, consultant, loanBalance, currentUser, onDone, onCreated }: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);

  const amountNum = Number(amount) || 0;
  const balanceAfter = loanBalance + amountNum;

  const create = async () => {
    if (!consultant || creating.current) return;
    creating.current = true;
    setBusy(true);
    try {
      const { payout } = await invokeConsultantPayout<{ payout: any }>({
        action: 'advance', consultant_id: consultant.id, amount: amountNum,
        note: note.trim() || null, invoice_date: date,
      });
      const reserved = await invokeConsultantPayout<{ invoice_number: number; invoice_date: string }>({ action: 'reserve', payout_id: payout.id });
      const doc = buildConsultantInvoicePdf({
        consultant,
        payout: { ...payout, invoice_number: reserved.invoice_number, invoice_date: reserved.invoice_date },
      });
      const result = await invokeConsultantPayout<{ ok: boolean; log_error?: string }>({
        action: 'finalize', payout_id: payout.id,
        invoice_pdf_base64: await blobToBase64(doc.output('blob')),
        file_name: consultantInvoicePdfName(consultant, reserved.invoice_number, reserved.invoice_date),
      });
      if (result.log_error) toast.warning(`Loggningen misslyckades: ${result.log_error}`);
      await archiveAfterCreate(payout.id, reserved.invoice_number, 'Förskottsfaktura');
      onOpenChange(false);
      setAmount(''); setNote('');
      onDone();
      onCreated?.(payout.id);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    creating.current = false;
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Förskottsfaktura – {consultant?.name ?? ''}</DialogTitle>
          <DialogDescription>Skapar en faktura på förskott av provision. Beloppet läggs på lånesaldot.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Belopp ex moms (kr)</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Anteckning</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fakturadatum</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Lånesaldo efter förskottet: <span className="font-medium text-foreground tabular-nums">{fmtKr(balanceAfter)}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button onClick={() => void create()} disabled={busy || amountNum <= 0 || !date}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Skapa förskottsfaktura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
