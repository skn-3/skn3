// "Registrera avdrag": montörsdebetfaktura (kind 'debit', N3-serien) när ett team är
// skyldigt N3prenad pengar. Samma flöde som tidigare debetfakturor (N3-nummer, PDF,
// send-montor-debit-invoice). Typen styr momsen; avräkning mot nästa utbetalning är förvalt.
// Avdraget står aldrig på självfakturan – kvittningen sker i utbetalningsspecifikationen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CaseCombobox } from '@/components/shared/CaseCombobox';
import { RelatedInvoiceCombobox } from './RelatedInvoiceCombobox';
import { useIsMobile } from '@/hooks/use-mobile';
import { createAndSendDebitInvoice, DEBIT_ATTACHMENT_MAX_BYTES, DEBIT_ATTACHMENT_TYPES } from '@/lib/debitInvoice';
import { DEBIT_TYPES, SETTLE_MODE_TEXT, debitTotals, debitTypeInfo, formatKr, relatedInvoiceOptions, type DebitType, type RelatedInvoiceSource, type SettleMode } from '@/lib/montorSettlement';
import { SETTLEMENT_QUERY_KEYS } from '@/lib/montorSettlementActions';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUser: string;
  /** Förifyllt team (id), t.ex. från Utbetala till montör */
  initialTeamId?: string | null;
  /** Förifyllt team (namn), t.ex. ärendets montör i ärendepanelen */
  initialTeamName?: string | null;
  /** Förifyllt ärende (ärendepanelen) */
  initialCaseId?: string | null;
  /** Förvald faktura som avdraget avser (A-orderhistoriken) */
  initialAOrderId?: string | null;
}

function parseAmount(v: string): number { return Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0; }

export function MontorDebitInvoiceDialog({ open, onOpenChange, currentUser, initialTeamId, initialTeamName, initialCaseId, initialAOrderId }: Props) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [teamId, setTeamId] = useState('');
  const [debitType, setDebitType] = useState<DebitType | ''>('');
  const [settleMode, setSettleMode] = useState<SettleMode>('avrakning');
  const [caseId, setCaseId] = useState('');
  const [relatedId, setRelatedId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ['montor_teams_active'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: cases = [] } = useQuery({
    queryKey: ['cases_for_debit'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('cases').select('id, address, customer_name').order('address');
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (!open) return;
    setDebitType(''); setSettleMode('avrakning'); setDescription(''); setAmount(''); setFile(null);
    setCaseId(initialCaseId || '');
    setTeamId(initialTeamId || '');
    setRelatedId(initialAOrderId || '');
  }, [open, initialTeamId, initialCaseId, initialAOrderId]);
  useEffect(() => {
    if (open && !initialTeamId && initialTeamName && teams.length) {
      const t = teams.find(x => x.name === initialTeamName);
      if (t) setTeamId(t.id);
    }
  }, [open, initialTeamId, initialTeamName, teams]);

  const { data: teamInvoices = [] } = useQuery({
    queryKey: ['debit_related_invoices', teamId],
    enabled: open && !!teamId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('a_orders')
        .select('id, team_id, status, total_amount, paid_at, invoice_number, invoice_sent_at, date, credited_from_order_id, customer_address, order_kind, order_number, case_id')
        .eq('team_id', teamId).not('invoice_number', 'is', null);
      if (error) throw error;
      return data as RelatedInvoiceSource[];
    },
  });
  const invoiceOptions = useMemo(() => relatedInvoiceOptions(teamId, teamInvoices), [teamId, teamInvoices]);
  // Byter man team försvinner en faktura från ett annat team.
  useEffect(() => {
    if (relatedId && teamInvoices.length && !teamInvoices.some(o => o.id === relatedId)) setRelatedId('');
  }, [teamInvoices, relatedId]);
  function pickInvoice(id: string) {
    setRelatedId(id);
    const opt = invoiceOptions.find(o => o.id === id);
    if (opt?.case_id) setCaseId(opt.case_id);
  }

  const team = useMemo(() => teams.find(t => t.id === teamId) || null, [teams, teamId]);
  const recipient = team?.invoice_email || team?.email || '';
  const amountNum = parseAmount(amount);
  const totals = debitType ? debitTotals(debitType, amountNum) : null;
  const typeInfo = debitTypeInfo(debitType);

  function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (!DEBIT_ATTACHMENT_TYPES.includes(f.type)) { toast.error('Underlaget måste vara PDF, JPG, PNG eller WebP'); return; }
    if (f.size > DEBIT_ATTACHMENT_MAX_BYTES) { toast.error('Underlaget får vara högst 10 MB'); return; }
    setFile(f);
  }

  async function go() {
    if (!team) { toast.error('Välj team'); return; }
    if (!recipient) { toast.error('Montörsteamet saknar e-post'); return; }
    if (!debitType) { toast.error('Välj typ av avdrag'); return; }
    if (!description.trim()) { toast.error('Skriv en beskrivning'); return; }
    if (!(amountNum > 0)) { toast.error('Ange ett belopp större än 0'); return; }
    setBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(); due.setDate(due.getDate() + 10);
      const amt = Math.round(amountNum * 100) / 100;
      const line = { description: description.trim(), qty: 1, unit: 'st', unit_price: amt, amount: amt };
      const res = await createAndSendDebitInvoice({
        team,
        title: typeInfo?.short || '',
        description: description.trim(),
        lines: [{ name: line.description, amount: amt }],
        detailedLines: [line],
        vatMode: totals!.vatMode,
        debitType,
        settleMode,
        date: today,
        dueDate: settleMode === 'bankgiro' ? due.toISOString().slice(0, 10) : null,
        createdBy: currentUser,
        caseId: caseId || null,
        attachment: file,
        kind: 'debit',
        relatedAOrderId: relatedId || null,
      });
      toast.success(`Avdrag ${res.invoice_number} registrerat och skickat till ${recipient}`);
      SETTLEMENT_QUERY_KEYS.forEach(k => qc.invalidateQueries({ queryKey: [...k] }));
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte registrera avdraget');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="w-full sm:max-w-xl max-h-[100dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrera avdrag</SheetTitle>
          <SheetDescription>Skapar en debetfaktura till montören. Avdraget står aldrig på självfakturan.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 py-4 text-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debit-team">Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="debit-team" className="h-11"><SelectValue placeholder="Välj team" /></SelectTrigger>
                <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.company_name || t.name}</SelectItem>)}</SelectContent>
              </Select>
              {team && !recipient && <p className="text-xs text-destructive">Teamet saknar e-post.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Ärende (valfritt)</Label>
              <CaseCombobox cases={cases} value={caseId} onChange={setCaseId} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="debit-related">Avser faktura (valfritt)</Label>
            <RelatedInvoiceCombobox id="debit-related" options={invoiceOptions} value={relatedId} onChange={pickInvoice} disabled={!teamId} placeholder={teamId ? 'Ingen faktura vald' : 'Välj team först'} />
            <p className="text-xs text-muted-foreground">Visas på debetfakturan och i utbetalningen, aldrig på självfakturan.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Typ av avdrag</legend>
            <RadioGroup value={debitType} onValueChange={v => setDebitType(v as DebitType)} className="gap-2">
              {DEBIT_TYPES.map(t => (
                <label key={t.key} htmlFor={`debit-type-${t.key}`} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${debitType === t.key ? 'border-primary bg-accent/40' : 'border-border'}`}>
                  <RadioGroupItem value={t.key} id={`debit-type-${t.key}`} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="debit-desc">Beskrivning</Label>
            <Textarea id="debit-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="t.ex. Repad karm vid montage, krav från kund" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debit-amount">Belopp exkl. moms</Label>
              <Input id="debit-amount" inputMode="decimal" className="h-11 text-right" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
              {totals ? (<>
                <div className="flex justify-between"><span className="text-muted-foreground">Moms</span><span>{totals.vatMode === 'vanlig' ? formatKr(totals.vatAmount) : totals.vatMode === 'omvand' ? 'Omvänd' : 'Ingen moms'}</span></div>
                <div className="mt-1 flex justify-between font-semibold"><span>Totalt</span><span>{formatKr(totals.total)}</span></div>
              </>) : <span className="text-muted-foreground">Välj typ för att se momsen.</span>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Underlag (valfritt)</Label>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label="Välj underlag" onChange={e => pickFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border p-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Ta bort underlaget" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" />Bifoga kvitto, PDF eller bild</Button>
            )}
            <p className="text-xs text-muted-foreground">Sparas privat och bifogas mejlet till montören.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Reglering</legend>
            <RadioGroup value={settleMode} onValueChange={v => setSettleMode(v as SettleMode)} className="gap-2">
              {(['avrakning', 'bankgiro'] as SettleMode[]).map(m => (
                <label key={m} htmlFor={`settle-${m}`} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 ${settleMode === m ? 'border-primary bg-accent/40' : 'border-border'}`}>
                  <RadioGroupItem value={m} id={`settle-${m}`} />
                  <span>{SETTLE_MODE_TEXT[m]}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          {team && <p className="text-xs text-muted-foreground">Skickas till {recipient || '—'} med kopia till n3prenad@smartklimat.org.</p>}
        </div>
        <SheetFooter className="gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button className="h-11" onClick={go} disabled={busy || !team || !recipient || !debitType || !description.trim() || !(amountNum > 0)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrera och skicka
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
