import { useState } from 'react';
import { Upload, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { HOUR_RATE } from '@/lib/constants';

interface Parsed {
  invoice_number: string | null;
  invoice_date: string | null;
  sales_order_number: string | null;
  customer_name: string | null;
  team_prefix: string | null;
  total_amount: number | null;
  line_items: Array<{ name: string; unit_price: number; qty: number; amount: number }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPrefillReady: (prefill: any) => void;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, '');

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Math.round(n).toLocaleString('sv-SE') + ' kr';
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(',')[1] || '');
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function MockfjardsInvoiceImportDialog({ open, onOpenChange, onPrefillReady }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [duplicate, setDuplicate] = useState<{ orderNumber: number | null } | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<any | null>(null);

  function reset() {
    setFile(null); setParsed(null); setParsing(false);
    setDuplicate(null); setPendingPrefill(null);
  }

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setParsed(null);
    try {
      const file_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('parse-mockfjards-invoice', {
        body: { file_base64, mime_type: file.type || 'application/pdf' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const p = data as Parsed;
      setParsed(p);
      await buildPrefill(p);
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte läsa fakturan');
    } finally {
      setParsing(false);
    }
  }

  async function buildPrefill(p: Parsed) {
    // Duplicate check
    let dupNum: number | null = null;
    if (p.invoice_number) {
      const { data: dups } = await (supabase as any)
        .from('a_orders')
        .select('order_number')
        .eq('mockfjards_invoice_number', p.invoice_number)
        .limit(1);
      if (dups && dups.length) dupNum = dups[0].order_number ?? null;
    }

    // Case match by order_number
    let matchedCase: any = null;
    if (p.sales_order_number) {
      const { data: casesList } = await (supabase as any)
        .from('cases')
        .select('id, order_number, address, customer_name, extra_hours_sold, extra_hours_approved')
        .not('order_number', 'is', null);

      if (casesList) {
        const targetNorm = norm(p.sales_order_number);
        const match = casesList.find((c: any) => norm(c.order_number) === targetNorm);
        if (match) matchedCase = match;
      }
    }

    // Team match by invoice_prefix
    let matchedTeam: any = null;
    if (p.team_prefix) {
      const { data: teams } = await (supabase as any)
        .from('montor_teams')
        .select('id, invoice_prefix')
        .ilike('invoice_prefix', p.team_prefix);
      if (teams && teams.length) matchedTeam = teams[0];
    }

    const sold = Number(matchedCase?.extra_hours_sold ?? 0) || 0;
    const approved = Number(matchedCase?.extra_hours_approved ?? 0) || 0;
    const extra = matchedCase ? Math.max(sold - approved, 0) : 0;

    const prefill = {
      customer_name: matchedCase?.customer_name || p.customer_name || '',
      customer_address: matchedCase?.address || '',
      case_id: matchedCase?.id ?? null,
      team_id: matchedTeam?.id ?? '__none__',
      line_items: p.line_items,
      date: p.invoice_date || new Date().toISOString().slice(0, 10),
      description: `Skapad från Mockfjärds-faktura ${p.invoice_number || '—'} · Fsg.order ${p.sales_order_number || '—'}`,
      internalExtraHours: extra,
      internalHourRate: HOUR_RATE,
      mockfjards_invoice_number: p.invoice_number,
    };
    setPendingPrefill(prefill);
    if (dupNum !== null) setDuplicate({ orderNumber: dupNum });
  }

  function proceed() {
    if (pendingPrefill) {
      onPrefillReady(pendingPrefill);
      reset();
      onOpenChange(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Skapa A-order från Mockfjärds-faktura</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              onClick={() => document.getElementById('mfi-file-input')?.click()}
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/60'}`}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm">{file ? file.name : 'Klicka eller dra hit EN PDF'}</div>
              <input id="mfi-file-input" type="file" accept="application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
            </div>

            {parsed && (
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" /> Avläst</div>
                <div><span className="text-muted-foreground">Fakturanr:</span> {parsed.invoice_number || '—'}</div>
                <div><span className="text-muted-foreground">Datum:</span> {parsed.invoice_date || '—'}</div>
                <div><span className="text-muted-foreground">Kund:</span> {parsed.customer_name || '—'}</div>
                <div><span className="text-muted-foreground">Fsg. order:</span> {parsed.sales_order_number || '—'}</div>
                <div><span className="text-muted-foreground">Summa:</span> {fmt(parsed.total_amount)}</div>
                <div><span className="text-muted-foreground">Rader:</span> {parsed.line_items?.length ?? 0}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Avbryt</Button>
            {!parsed && (
              <Button onClick={handleParse} disabled={!file || parsing} className="gap-2">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Läs av
              </Button>
            )}
            {parsed && !duplicate && (
              <Button onClick={proceed} className="gap-2">Öppna A-order</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!duplicate} onOpenChange={v => { if (!v) setDuplicate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dubblettvarning</AlertDialogTitle>
            <AlertDialogDescription>
              Faktura {parsed?.invoice_number} är redan inläst{duplicate?.orderNumber ? ` (A-order #${duplicate.orderNumber})` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicate(null)}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDuplicate(null); proceed(); }}>Skapa ändå</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
