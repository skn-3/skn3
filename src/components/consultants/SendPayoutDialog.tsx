// Dialog för att mejla en skapad konsultfaktura till konsulten och/eller betalaren.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { consultantDueDate } from '@/lib/consultantPay';
import { invokeConsultantPayout } from './consultantApi';

interface Props {
  payout: any | null;
  consultant: any | null;
  onClose: () => void;
  onSent: () => void;
}

const kr = (n: unknown) => `${(Number(n) || 0).toLocaleString('sv-SE', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} kr`;
const today = () => new Date().toISOString().slice(0, 10);

export function SendPayoutDialog({ payout, consultant, onClose, onSent }: Props) {
  const [toConsultant, setToConsultant] = useState(true);
  const [toPayer, setToPayer] = useState(true);
  const [extra, setExtra] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; sent_to: string[]; error?: string } | null>(null);

  useEffect(() => {
    if (payout) {
      setToConsultant(!!consultant?.email); setToPayer(!!consultant?.payer_email);
      setExtra(''); setMessage(''); setResult(null);
    }
  }, [payout?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!payout || !consultant) return null;
  const due = consultantDueDate(payout.invoice_date ?? today());
  const subjectConsultant = `Självfaktura ${payout.invoice_number} – ${consultant.payer_name}`;
  const subjectPayer = `Att betala: självfaktura ${payout.invoice_number} ${consultant.company_name} – ${kr(payout.total_incl_vat)} senast ${due}`;
  const extraList = extra.split(',').map(s => s.trim()).filter(Boolean);
  const canSend = toConsultant || toPayer || extraList.length > 0;

  const send = async () => {
    setBusy(true);
    try {
      const r = await invokeConsultantPayout<{ ok: boolean; sent_to: string[]; error?: string; log_error?: string }>({
        action: 'send', payout_id: payout.id, to_consultant: toConsultant, to_payer: toPayer,
        extra_emails: extraList, message: message.trim() || undefined,
      });
      setResult(r);
      if (r.ok) toast.success(`Faktura ${payout.invoice_number} skickad`);
      else toast.warning(`Delvis skickad: ${r.error}`);
      if (r.log_error) toast.warning(`Loggningen misslyckades: ${r.log_error}`);
      onSent();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <Dialog open={!!payout} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Skicka faktura {payout.invoice_number}</DialogTitle>
          <DialogDescription>Fakturan och specifikationen mejlas som bilagor.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-2 text-sm">
            {result.sent_to.length > 0 && (
              <div><div className="font-medium">Skickat till</div><ul className="list-disc pl-5">{result.sent_to.map(t => <li key={t}>{t}</li>)}</ul></div>
            )}
            {consultant.cc_email && result.sent_to.length > 0 && <p className="text-muted-foreground">Kopia till {consultant.cc_email}</p>}
            {result.error && <p className="text-destructive">{result.error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-3 min-h-11 cursor-pointer">
              <Checkbox checked={toConsultant} disabled={!consultant.email} onCheckedChange={v => setToConsultant(v === true)} className="mt-0.5" />
              <span className="text-sm">Till {consultant.name} ({consultant.email || 'e-post saknas'})</span>
            </label>
            <label className="flex items-start gap-3 min-h-11 cursor-pointer">
              <Checkbox checked={toPayer} disabled={!consultant.payer_email} onCheckedChange={v => setToPayer(v === true)} className="mt-0.5" />
              <span className="text-sm">Till {consultant.payer_name} ({consultant.payer_email || 'e-post saknas'})</span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="send-extra">Fler mottagare</Label>
              <Input id="send-extra" value={extra} onChange={e => setExtra(e.target.value)} placeholder="namn@foretag.se, annan@foretag.se" inputMode="email" />
              <p className="text-xs text-muted-foreground">Kommaseparerat. Får samma mejl som betalaren.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-msg">Meddelande (valfritt)</Label>
              <Textarea id="send-msg" value={message} onChange={e => setMessage(e.target.value)} rows={3} />
            </div>
            <div className="rounded-md border p-3 space-y-2 text-xs">
              <div className="font-medium text-sm">Ämnesrader</div>
              {toConsultant && <div><span className="text-muted-foreground">Konsulten: </span>{subjectConsultant}</div>}
              {(toPayer || extraList.length > 0) && <div><span className="text-muted-foreground">Betalaren: </span>{subjectPayer}</div>}
              {consultant.cc_email && <div className="text-muted-foreground">Kopia till {consultant.cc_email}</div>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{result ? 'Stäng' : 'Avbryt'}</Button>
          {!result && <Button onClick={() => void send()} disabled={busy || !canSend}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Skicka</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
