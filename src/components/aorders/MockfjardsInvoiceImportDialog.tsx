import { useRef, useState } from 'react';
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
import { rankPayoutCases, type RankedCase } from '@/lib/caseMatching';
import { serviceOrderPrefillFromInvoice } from '@/lib/serviceOrder';

interface Parsed {
  due_date?: string | null;
  source?: 'text' | 'ai';
  warnings?: string[];
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
  /** 'service' fyller en öppen serviceorder (se serviceOrderPrefillFromInvoice) */
  variant?: 'a-order' | 'service';
}

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

export function MockfjardsInvoiceImportDialog({ open, onOpenChange, onPrefillReady, variant = 'a-order' }: Props) {
  const isService = variant === 'service';
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [duplicate, setDuplicate] = useState<{ orderNumber: number | null } | null>(null);
  const [pendingPrefill, setPendingPrefill] = useState<any | null>(null);
  /** Förslag (nivå suggest) när inget ärende kunde kopplas automatiskt. */
  const [suggestions, setSuggestions] = useState<RankedCase<any>[]>([]);
  const [matchTeam, setMatchTeam] = useState<any>(null);
  const [linkedCase, setLinkedCase] = useState<any>(null);

  function reset() {
    setFile(null); setParsed(null); setParsing(false);
    setDuplicate(null); setPendingPrefill(null);
    setSuggestions([]); setMatchTeam(null); setLinkedCase(null);
  }

  function makePrefill(p: Parsed, matchedCase: any, matchedTeam: any) {
    setMatchTeam(matchedTeam);
    setLinkedCase(matchedCase);
    setSuggestions(suggested);
    const prefill = makePrefill(p, matchedCase, matchedTeam);
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
          <DialogHeader><DialogTitle>{isService ? 'Fyll serviceordern från Mockfjärds-faktura' : 'Skapa A-order från Mockfjärds-faktura'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/60'}`}
            >
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <div className="text-sm">{file ? file.name : 'Klicka eller dra hit EN PDF'}</div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
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
                {parsed.due_date && <div><span className="text-muted-foreground">Förfallodatum:</span> {parsed.due_date}</div>}
                <div className="text-xs text-muted-foreground">{parsed.source === 'text' ? 'Läst direkt ur PDF:en' : 'Tolkad av AI – kontrollera uppgifterna'}</div>
                {!isService && linkedCase && (
                  <div className="pt-1"><span className="text-muted-foreground">Ärende:</span> {linkedCase.customer_name} — {linkedCase.address}</div>
                )}
                {!!parsed.warnings?.length && (
                  <ul className="mt-2 list-disc pl-5 text-destructive space-y-1">
                    {parsed.warnings.map(w => <li key={w}>{w}</li>)}
                  </ul>
                )}
              </div>
            )}

            {parsed && !isService && suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Föreslagna ärenden</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(sug => {
                    const active = linkedCase?.id === sug.case.id;
                    return (
                      <Button
                        key={sug.case.id}
                        variant={active ? 'default' : 'outline'}
                        aria-pressed={active}
                        onClick={() => chooseCase(active ? null : sug.case)}
                        className="h-auto min-h-12 whitespace-normal text-left text-xs rounded-md px-3 py-2 justify-start"
                      >
                        {sug.case.customer_name} — {sug.case.address}
                        <span className={active ? '' : 'text-muted-foreground'}>&nbsp;· {sug.label}</span>
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Tryck på rätt ärende för att koppla det, eller fortsätt utan koppling.</p>
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
              <Button onClick={proceed} className="gap-2">{isService ? 'Fyll i serviceordern' : 'Öppna A-order'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!duplicate} onOpenChange={v => { if (!v) setDuplicate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dubblettvarning</AlertDialogTitle>
            <AlertDialogDescription>
              Faktura {parsed?.invoice_number} är redan inläst{duplicate?.orderNumber ? ` (order #${duplicate.orderNumber})` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicate(null)}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDuplicate(null); proceed(); }}>{isService ? 'Fortsätt ändå' : 'Skapa ändå'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
