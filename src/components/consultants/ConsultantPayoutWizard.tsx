// Guiden för ny lönekörning (eller granskning av sparat utkast).
// Steg 1: välj månadsmapp i Drive. Steg 2: provisionsunderlag + TB.
// Steg 3: avdrag (standard, kvitton med AI-tolkning, manuella) + lån.
// Steg 4: sammanställning, förhandsgranskning och skapande av faktura.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { calcPayout, monthLabel, type PayLine } from '@/lib/consultantPay';
import { consultantInvoicePdfName, consultantSpecPdfName } from '@/lib/pdfNames';
import { buildConsultantInvoicePdf } from '@/lib/consultantInvoicePdf';
import { buildConsultantSpecPdf } from '@/lib/consultantSpecPdf';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { invokeConsultantDrive, invokeConsultantPayout, blobToBase64, fmtKr, DOC_TYPE_LABELS } from './consultantApi';

interface ReceiptLine {
  key: string;
  kind: 'standard' | 'receipt' | 'manual';
  included: boolean;
  label: string;
  amount: number;
  doc_type: string;
  issuer?: string | null;
  doc_date?: string | null;
  reg_nr?: string | null;
  doc_number?: string | null;
  doc_number_norm?: string | null;
  original_amount?: number | null;
  fee_amount?: number | null;
  is_reminder?: boolean;
  is_owner_cost_candidate?: boolean;
  drive_file_id?: string | null;
  drive_file_name?: string | null;
  drive_web_link?: string | null;
  duplicate_of?: any;
  error?: string | null;
  ai_raw?: any;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultant: any | null;
  currentUser: string;
  initialPayout?: any | null; // sparat utkast → granskningsläge (startar på steg 4)
  onDone: () => void;
}

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

export function ConsultantPayoutWizard({ open, onOpenChange, consultant, currentUser, initialPayout, onDone }: Props) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  // Steg 1
  const [months, setMonths] = useState<any[]>([]);
  const [folderId, setFolderId] = useState('');
  const [manualMonth, setManualMonth] = useState(''); // YYYY-MM för mappar utan tolkad månad
  const [scan, setScan] = useState<any | null>(null);

  // Steg 2
  const [provision, setProvision] = useState<any | null>(null);
  const [tb, setTb] = useState('');
  const [tbNote, setTbNote] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));

  // Steg 3
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [loanMode, setLoanMode] = useState<'none' | 'repay'>('none');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanBalance, setLoanBalance] = useState(0);

  // Steg 4
  const [notes, setNotes] = useState('');
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const tiers = useMemo(() => (Array.isArray(consultant?.commission_tiers) && consultant.commission_tiers.length ? consultant.commission_tiers : undefined), [consultant]);
  const standardDeductions: Array<{ label?: string; amount?: number; defaultOn?: boolean }> = useMemo(
    () => (Array.isArray(consultant?.standard_deductions) ? consultant.standard_deductions : []), [consultant]);

  const reset = useCallback(() => {
    setStep(1); setBusy(false); setProgress('');
    setMonths([]); setFolderId(''); setManualMonth(''); setScan(null);
    setProvision(null); setTb(''); setTbNote(''); setInvoiceDate(new Date().toISOString().slice(0, 10));
    setLines([]); setLoanMode('none'); setLoanAmount(''); setLoanBalance(0);
    setNotes(''); setPayoutId(null); setConfirmCreate(false);
  }, []);

  // Granskningsläge: ladda sparat utkast och hoppa till steg 4.
  const loadDraft = useCallback(async (payout: any) => {
    reset();
    setPayoutId(payout.id);
    setInvoiceDate(payout.invoice_date ?? new Date().toISOString().slice(0, 10));
    setTb(payout.tb_amount != null ? String(payout.tb_amount) : '');
    setNotes(payout.notes ?? '');
    setProvision({
      payout_date: payout.provision_payout_date,
      period_start: payout.period_start,
      period_end: payout.period_end,
      rows: Array.isArray(payout.tb_rows) ? payout.tb_rows : [],
      corrections: Array.isArray(payout.tb_corrections) ? payout.tb_corrections : [],
      sum_rows: payout.tb_sum_rows, sum_corrections: payout.tb_sum_corrections, sum_total: payout.tb_amount,
      needs_review: payout.tb_needs_review, note: payout.tb_note,
      file: payout.provision_file_id ? { id: payout.provision_file_id, name: payout.provision_file_name, webViewLink: null } : null,
    });
    const lc = Number(payout.loan_change) || 0;
    if (lc < 0) { setLoanMode('repay'); setLoanAmount(String(Math.abs(lc))); }
    const { data: savedLines } = await supabase.from('consultant_payout_lines').select('*').eq('payout_id', payout.id).order('sort');
    setLines((savedLines ?? []).map((l: any) => ({
      key: nextKey(), kind: l.kind, included: l.included, label: l.label, amount: Number(l.amount),
      doc_type: l.doc_type ?? 'annat', issuer: l.issuer, doc_date: l.doc_date, reg_nr: l.reg_nr,
      doc_number: l.doc_number, doc_number_norm: l.doc_number_norm, original_amount: l.original_amount,
      fee_amount: l.fee_amount, is_reminder: l.is_reminder, is_owner_cost_candidate: l.is_owner_cost_candidate,
      drive_file_id: l.drive_file_id, drive_file_name: l.drive_file_name, drive_web_link: l.drive_web_link,
      duplicate_of: l.duplicate_of, ai_raw: l.ai_raw,
    })));
    setStep(4);
  }, [reset]);

  useEffect(() => {
    if (!open || !consultant) return;
    if (initialPayout) { void loadDraft(initialPayout); return; }
    reset();
    setBusy(true);
    void (async () => {
      try {
        const data = await invokeConsultantDrive<{ months: any[] }>({ action: 'months', consultant_id: consultant.id });
        setMonths(data.months ?? []);
        if (data.months?.length) setFolderId(data.months[0].id);
      } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
      setBusy(false);
    })();
    void supabase.from('consultant_loans').select('amount').eq('consultant_id', consultant.id)
      .then(({ data }) => setLoanBalance((data ?? []).reduce((s, r) => s + Number(r.amount), 0)));
  }, [open, consultant, initialPayout, reset, loadDraft]);

  const selectedMonth = months.find(m => m.id === folderId) ?? null;
  const payoutMonth = selectedMonth?.payout_month ?? (manualMonth ? `${manualMonth}-01` : null);

  const doScan = async () => {
    if (!consultant || !folderId) return;
    setBusy(true);
    try {
      const data = await invokeConsultantDrive<any>({ action: 'scan', consultant_id: consultant.id, folder_id: folderId });
      setScan(data);
      setProvision(null);
      setTb(''); setTbNote('');
      setLines(standardDeductions.map((d, i) => ({
        key: nextKey(), kind: 'standard' as const, included: d.defaultOn !== false,
        label: d.label ?? `Standardavdrag ${i + 1}`, amount: Number(d.amount) || 0, doc_type: 'annat',
      })));
      if (data.provision_file?.id) {
        try {
          const prov = await invokeConsultantDrive<any>({ action: 'provision', consultant_id: consultant.id, file_id: data.provision_file.id });
          setProvision(prov);
          setTb(prov.sum_total != null ? String(prov.sum_total) : '');
        } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
      }
      setStep(2);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const parseReceipts = async () => {
    if (!consultant || !scan?.deduction_files?.length) { setStep(3); return; }
    const files: any[] = scan.deduction_files;
    const subfolderByFile: Record<string, string> = {};
    for (const f of files) if (f.subfolder) subfolderByFile[f.id] = f.subfolder;
    setBusy(true);
    const parsed: ReceiptLine[] = [];
    let done = 0;
    try {
      for (let i = 0; i < files.length; i += 6) {
        const batch = files.slice(i, i + 6);
        setProgress(`Tolkar ${Math.min(i + 6, files.length)} av ${files.length} …`);
        const data = await invokeConsultantDrive<{ items: any[] }>({
          action: 'deductions', consultant_id: consultant.id,
          file_ids: batch.map((f: any) => f.id), subfolder_by_file: subfolderByFile,
        });
        for (let j = 0; j < batch.length; j++) {
          const f = batch[j];
          const item = data.items?.[j];
          if (!item || item.error) {
            parsed.push({
              key: nextKey(), kind: 'receipt', included: false, label: f.name, amount: 0, doc_type: 'annat',
              drive_file_id: f.id, drive_file_name: f.name, drive_web_link: f.webViewLink,
              error: item?.error ?? 'Kunde inte tolkas',
            });
          } else {
            const p = item.parsed ?? {};
            parsed.push({
              key: nextKey(), kind: 'receipt', included: !item.duplicate_of, label: p.description || f.name,
              amount: Number(p.amount_total) || 0, doc_type: p.doc_type ?? 'annat', issuer: p.issuer,
              doc_date: p.doc_date, reg_nr: p.reg_nr, doc_number: p.doc_number, doc_number_norm: item.doc_number_norm,
              original_amount: p.original_amount, fee_amount: p.fee_amount, is_reminder: p.is_reminder,
              is_owner_cost_candidate: p.is_owner_cost_candidate,
              drive_file_id: f.id, drive_file_name: f.name, drive_web_link: f.webViewLink,
              duplicate_of: item.duplicate_of ?? null, ai_raw: p,
            });
          }
        }
        done = Math.min(i + 6, files.length);
      }
      setLines(prev => [...prev.filter(l => l.kind === 'standard'), ...parsed]);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setProgress('');
    setBusy(false);
    void done;
    setStep(3);
  };

  const tbNum = Number(tb) || 0;
  const loanRepayment = loanMode === 'repay' ? Number(loanAmount) || 0 : 0;
  const calc = useMemo(() => calcPayout({
    tb: tbNum, tiers,
    lines: lines.map((l): PayLine => ({ kind: l.kind, amount: l.amount, included: l.included })),
    loanRepayment, vatRate: Number(consultant?.vat_rate ?? 25),
  }), [tbNum, tiers, lines, loanRepayment, consultant]);

  const tbChanged = provision?.sum_total != null && Math.abs(tbNum - Number(provision.sum_total)) > 0.005;
  const needsTbNote = tbChanged || !scan?.provision_file;
  const canNext2 = tbNum > 0 && (!needsTbNote || tbNote.trim().length > 0);

  const updateLine = (key: string, patch: Partial<ReceiptLine>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  // Spara utkast: upsert payout + ersätt rader. Returnerar payout-id.
  const saveDraft = async (): Promise<string | null> => {
    if (!consultant) return null;
    const row: Record<string, unknown> = {
      consultant_id: consultant.id,
      kind: 'payout',
      payout_month: payoutMonth,
      period_start: provision?.period_start ?? null,
      period_end: provision?.period_end ?? null,
      drive_month_folder_id: folderId || null,
      drive_month_folder_name: selectedMonth?.name ?? scan?.folder?.name ?? null,
      provision_file_id: provision?.file?.id ?? scan?.provision_file?.id ?? null,
      provision_file_name: provision?.file?.name ?? scan?.provision_file?.name ?? null,
      provision_payout_date: provision?.payout_date ?? null,
      tb_rows: provision?.rows ?? [],
      tb_corrections: provision?.corrections ?? [],
      tb_sum_rows: Number(provision?.sum_rows) || 0,
      tb_sum_corrections: Number(provision?.sum_corrections) || 0,
      tb_amount: tbNum,
      tb_needs_review: Boolean(provision?.needs_review) || tbChanged,
      tb_note: [provision?.note, tbNote.trim()].filter(Boolean).join('. ') || null,
      tier_pct: calc.pct,
      commission_gross: calc.gross,
      deductions_total: calc.deductions,
      loan_change: loanRepayment > 0 ? -loanRepayment : 0,
      net_amount: calc.net,
      vat_rate: Number(consultant.vat_rate ?? 25),
      vat_amount: calc.vat,
      total_incl_vat: calc.total,
      invoice_date: invoiceDate || null,
      notes: notes.trim() || null,
      source: 'wizard',
      created_by: currentUser,
    };
    let id = payoutId;
    if (id) {
      const { error } = await supabase.from('consultant_payouts').update(row as never).eq('id', id).eq('status', 'draft');
      if (error) throw error;
      const { error: delErr } = await supabase.from('consultant_payout_lines').delete().eq('payout_id', id);
      if (delErr) throw delErr;
    } else {
      const { data, error } = await supabase.from('consultant_payouts').insert({ ...row, status: 'draft' } as never).select('id').single();
      if (error) throw error;
      id = data.id;
      setPayoutId(id);
    }
    if (lines.length) {
      const { error } = await supabase.from('consultant_payout_lines').insert(lines.map((l, i) => ({
        payout_id: id, consultant_id: consultant.id, kind: l.kind, label: l.label, amount: l.amount,
        doc_type: l.doc_type, issuer: l.issuer ?? null, doc_date: l.doc_date ?? null, reg_nr: l.reg_nr ?? null,
        doc_number: l.doc_number ?? null, doc_number_norm: l.doc_number_norm ?? null,
        original_amount: l.original_amount ?? null, fee_amount: l.fee_amount ?? null,
        is_reminder: l.is_reminder ?? null, is_owner_cost_candidate: l.is_owner_cost_candidate ?? false,
        drive_file_id: l.drive_file_id ?? null, drive_file_name: l.drive_file_name ?? null,
        drive_web_link: l.drive_web_link ?? null, included: l.included,
        duplicate_of: l.duplicate_of?.line_id ?? null, ai_raw: l.ai_raw ?? null, sort: i,
      })));
      if (error) throw error;
    }
    return id;
  };

  const payoutForPdf = (invoiceNumber: string | number | null) => ({
    kind: 'payout',
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    payout_month: payoutMonth,
    period_start: provision?.period_start ?? null,
    period_end: provision?.period_end ?? null,
    provision_payout_date: provision?.payout_date ?? null,
    tb_rows: provision?.rows ?? [],
    tb_corrections: provision?.corrections ?? [],
    tb_sum_rows: Number(provision?.sum_rows) || 0,
    tb_sum_corrections: Number(provision?.sum_corrections) || 0,
    tb_amount: tbNum,
    tier_pct: calc.pct,
    commission_gross: calc.gross,
    deductions_total: calc.deductions,
    loan_change: loanRepayment > 0 ? -loanRepayment : 0,
    net_amount: calc.net,
    vat_rate: Number(consultant?.vat_rate ?? 25),
    vat_amount: calc.vat,
    total_incl_vat: calc.total,
  });

  const specLinesForPdf = () => lines.map(l => ({
    kind: l.kind, label: l.label, amount: l.amount, doc_type: l.doc_type, doc_date: l.doc_date,
    reg_nr: l.reg_nr, doc_number: l.doc_number, included: l.included,
    duplicate_of: l.duplicate_of ? (l.duplicate_of.line_id ?? 'x') : null,
  }));

  const preview = async (which: 'invoice' | 'spec') => {
    if (!consultant) return;
    setBusy(true);
    try {
      const doc = which === 'invoice'
        ? buildConsultantInvoicePdf({ consultant, payout: payoutForPdf(consultant.next_invoice_number) })
        : buildConsultantSpecPdf({
            consultant, payout: payoutForPdf(consultant.next_invoice_number), lines: specLinesForPdf(),
            loanBalanceBefore: loanBalance, loanBalanceAfter: loanBalance - loanRepayment, generatedBy: currentUser,
          });
      const ok = await openDocumentInNewTab(async () => URL.createObjectURL(doc.output('blob')));
      if (!ok) toast.error('Kunde inte öppna förhandsgranskningen');
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const doSaveDraft = async () => {
    setBusy(true);
    try {
      await saveDraft();
      toast.success('Utkastet sparades');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const creating = useRef(false);
  const doCreate = async () => {
    if (!consultant || creating.current) return;
    creating.current = true;
    setConfirmCreate(false);
    setBusy(true);
    try {
      const id = await saveDraft();
      if (!id) throw new Error('Kunde inte spara utkastet');
      const reserved = await invokeConsultantPayout<{ invoice_number: number; invoice_date: string }>({ action: 'reserve', payout_id: id });
      const payout = payoutForPdf(reserved.invoice_number);
      const invoiceDoc = buildConsultantInvoicePdf({ consultant, payout });
      const specDoc = buildConsultantSpecPdf({
        consultant, payout, lines: specLinesForPdf(),
        loanBalanceBefore: loanBalance, loanBalanceAfter: loanBalance - loanRepayment, generatedBy: currentUser,
      });
      const result = await invokeConsultantPayout<{ ok: boolean; log_error?: string }>({
        action: 'finalize', payout_id: id,
        invoice_pdf_base64: await blobToBase64(invoiceDoc.output('blob')),
        spec_pdf_base64: await blobToBase64(specDoc.output('blob')),
        file_name: consultantInvoicePdfName(consultant, reserved.invoice_number, reserved.invoice_date),
        spec_file_name: consultantSpecPdfName(consultant, reserved.invoice_number, payoutMonth),
      });
      toast.success(`Faktura ${reserved.invoice_number} skapad`);
      if (result.log_error) toast.warning(`Loggningen misslyckades: ${result.log_error}`);
      onOpenChange(false);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
    creating.current = false;
  };

  const steps = ['Månad', 'Underlag', 'Avdrag', 'Sammanställning'];

  return (
    <Sheet open={open} onOpenChange={v => { if (!busy) onOpenChange(v); }}>
      <SheetContent side="right" className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initialPayout ? `Granska utkast – ${consultant?.name ?? ''}` : `Ny lönekörning – ${consultant?.name ?? ''}`}</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-2 my-4">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${step === i + 1 ? 'bg-primary text-primary-foreground' : step > i + 1 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
              <span className={`text-xs ${step === i + 1 ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
              {i < steps.length - 1 && <span className="text-muted-foreground">·</span>}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            {busy && months.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Hämtar månadsmappar …</div>
            ) : months.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">Inga månadsmappar hittades i konsultens Löner-mapp.</p>
            ) : (
              <RadioGroup value={folderId} onValueChange={setFolderId} className="space-y-2">
                {months.map(m => (
                  <label key={m.id} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                    <RadioGroupItem value={m.id} className="mt-0.5" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">{m.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        skapad {m.createdTime ? String(m.createdTime).slice(0, 10) : '—'}
                        {' · '}
                        {m.payout_month ? monthLabel(m.payout_month) : 'okänd månad – ange nedan'}
                      </span>
                      {m.existing_payout && (
                        <Badge variant="outline" className="mt-1">Redan körd: Faktura {m.existing_payout.invoice_number ?? '—'} · {m.existing_payout.status}</Badge>
                      )}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
            {selectedMonth && !selectedMonth.payout_month && (
              <div className="space-y-1.5">
                <Label>Månad för körningen</Label>
                <Input type="month" value={manualMonth} onChange={e => setManualMonth(e.target.value)} />
              </div>
            )}
            {selectedMonth?.existing_payout && (
              <p className="text-xs text-amber-700 dark:text-amber-400">Detta skapar en till körning för samma månad.</p>
            )}
            <div className="flex justify-end">
              <Button onClick={() => void doScan()} disabled={busy || !folderId || (selectedMonth && !selectedMonth.payout_month && !manualMonth)}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Nästa
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {scan?.provision_file ? (
              <div className="rounded-md border p-3 text-sm flex items-center gap-2">
                <span className="font-medium">Provisionsfil:</span>
                <span className="truncate">{scan.provision_file.name}</span>
                <span className="text-xs text-muted-foreground">ändrad {scan.provision_file.modifiedTime ? String(scan.provision_file.modifiedTime).slice(0, 10) : '—'}</span>
                {scan.provision_file.webViewLink && <a href={scan.provision_file.webViewLink} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
            ) : (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">Ingen provisions-PDF i mappen. Ange TB manuellt och skriv en anteckning.</div>
            )}

            {provision && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Utbetalningsdatum</span>{provision.payout_date ?? '—'}</div>
                  <div className="col-span-2"><span className="text-xs text-muted-foreground block">Period</span>{provision.period_start && provision.period_end ? `${provision.period_start} – ${provision.period_end}` : '—'}</div>
                </div>
                {provision.needs_review && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">{provision.note || 'Underlaget behöver granskas.'}</div>
                )}
                {Array.isArray(provision.rows) && provision.rows.length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Ordernr</TableHead><TableHead>Kund</TableHead><TableHead>Signerad</TableHead><TableHead className="text-right">Belopp</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {provision.rows.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{r.order_number ?? ''}</TableCell>
                            <TableCell>{r.customer_name ?? ''}</TableCell>
                            <TableCell>{r.signing_date ?? '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtKr(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {Array.isArray(provision.corrections) && provision.corrections.length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Korrigering</TableHead><TableHead className="text-right">Belopp</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {provision.corrections.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{r.text ?? r.customer_name ?? r.order_number ?? ''}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtKr(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Summa Utb.ÅF</span><span className="tabular-nums">{fmtKr(provision.sum_rows)}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Summa Korrigering</span><span className="tabular-nums">{fmtKr(provision.sum_corrections)}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Summa Total</span><span className="tabular-nums font-medium">{fmtKr(provision.sum_total)}</span></div>
                </div>
              </div>
            )}

            {Array.isArray(scan?.other_files) && scan.other_files.length > 0 && (
              <p className="text-xs text-muted-foreground">Övriga filer i mappen: {scan.other_files.map((f: any) => f.name).join(', ')}</p>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>TB (kr)</Label>
                <Input type="number" inputMode="decimal" value={tb} onChange={e => setTb(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Anteckning {needsTbNote ? '(obligatorisk)' : ''}</Label>
                <Textarea value={tbNote} onChange={e => setTbNote(e.target.value)} placeholder={tbChanged ? 'TB ändrat – förklara varför' : ''} />
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Tillbaka</Button>
              <Button onClick={() => void parseReceipts()} disabled={!canNext2 || busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Nästa
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            {progress && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{progress}</div>}

            <section className="space-y-2">
              <h3 className="font-medium text-sm">Standardavdrag</h3>
              {lines.filter(l => l.kind === 'standard').length === 0 && <p className="text-xs text-muted-foreground">Inga standardavdrag på konsulten.</p>}
              {lines.filter(l => l.kind === 'standard').map(l => (
                <div key={l.key} className="flex items-center gap-3">
                  <Checkbox checked={l.included} onCheckedChange={v => updateLine(l.key, { included: v === true })} id={`std-${l.key}`} />
                  <Label htmlFor={`std-${l.key}`} className="flex-1">{l.label}</Label>
                  <Input type="number" inputMode="decimal" className="w-28" value={String(l.amount)} onChange={e => updateLine(l.key, { amount: Number(e.target.value) || 0 })} />
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="font-medium text-sm">Kvitton</h3>
              {lines.filter(l => l.kind === 'receipt').length === 0 && <p className="text-xs text-muted-foreground">Inga kvitton i månadsmappen.</p>}
              {lines.filter(l => l.kind === 'receipt').length > 0 && (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dra av</TableHead><TableHead>Typ</TableHead><TableHead>Beskrivning</TableHead>
                        <TableHead>Datum</TableHead><TableHead>Regnr</TableHead><TableHead>Nummer</TableHead>
                        <TableHead className="text-right">Belopp</TableHead><TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.filter(l => l.kind === 'receipt').map(l => (
                        <TableRow key={l.key}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Checkbox checked={l.included} onCheckedChange={v => updateLine(l.key, { included: v === true })} />
                              {l.duplicate_of && (
                                <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                                  {l.duplicate_of.in_batch ? 'Dubblett i samma mapp' : `Dragen tidigare: ${l.duplicate_of.payout_month ? monthLabel(l.duplicate_of.payout_month) : '—'} · faktura ${l.duplicate_of.invoice_number ?? '—'}`}
                                </Badge>
                              )}
                              {l.is_owner_cost_candidate && <Badge variant="outline" className="text-[10px]">Ägarkostnad?</Badge>}
                              {l.error && <span className="text-[10px] text-destructive">Kunde inte tolkas</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select value={l.doc_type} onValueChange={v => updateLine(l.key, { doc_type: v })}>
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(DOC_TYPE_LABELS).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input className="min-w-40" value={l.label} onChange={e => updateLine(l.key, { label: e.target.value })} /></TableCell>
                          <TableCell><Input type="date" className="w-32" value={l.doc_date ?? ''} onChange={e => updateLine(l.key, { doc_date: e.target.value || null })} /></TableCell>
                          <TableCell><Input className="w-20" value={l.reg_nr ?? ''} onChange={e => updateLine(l.key, { reg_nr: e.target.value || null })} /></TableCell>
                          <TableCell><Input className="w-24" value={l.doc_number ?? ''} onChange={e => updateLine(l.key, { doc_number: e.target.value || null })} /></TableCell>
                          <TableCell><Input type="number" inputMode="decimal" className="w-24 text-right" value={String(l.amount)} onChange={e => updateLine(l.key, { amount: Math.round((Number(e.target.value) || 0) * 100) / 100 })} /></TableCell>
                          <TableCell>
                            {l.drive_web_link && <a href={l.drive_web_link} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setLines(prev => [...prev, { key: nextKey(), kind: 'manual', included: true, label: '', amount: 0, doc_type: 'annat' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" />Lägg till manuell rad
              </Button>
              {lines.filter(l => l.kind === 'manual').map(l => (
                <div key={l.key} className="flex items-center gap-2">
                  <Input className="flex-1" placeholder="Etikett" value={l.label} onChange={e => updateLine(l.key, { label: e.target.value })} />
                  <Input type="number" inputMode="decimal" className="w-28 text-right" placeholder="Belopp" value={String(l.amount)} onChange={e => updateLine(l.key, { amount: Math.round((Number(e.target.value) || 0) * 100) / 100 })} />
                  <Button variant="ghost" size="icon" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="font-medium text-sm">Lån</h3>
              <p className="text-xs text-muted-foreground">Aktuellt saldo: {fmtKr(loanBalance)}</p>
              <RadioGroup value={loanMode} onValueChange={v => setLoanMode(v as 'none' | 'repay')} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="none" />Ingen amortering</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="repay" />Amortering</label>
              </RadioGroup>
              {loanMode === 'repay' && (
                <Input type="number" inputMode="decimal" className="w-40" placeholder="Belopp" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} />
              )}
            </section>

            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>TB × {calc.pct} %</span><span className="tabular-nums">{fmtKr(calc.gross)}</span></div>
              <div className="flex justify-between"><span>Avdrag</span><span className="tabular-nums">−{fmtKr(calc.deductions)}</span></div>
              <div className="flex justify-between"><span>Amortering</span><span className="tabular-nums">−{fmtKr(calc.loanRepayment)}</span></div>
              <div className="flex justify-between font-medium"><span>Netto ex moms</span><span className="tabular-nums">{fmtKr(calc.net)}</span></div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Tillbaka</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void doSaveDraft()} disabled={busy}>Spara utkast</Button>
                <Button onClick={() => setStep(4)} disabled={busy}>Nästa</Button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>TB × {calc.pct} % = Provision</span><span className="tabular-nums">{fmtKr(calc.gross)}</span></div>
              <div className="flex justify-between"><span>− Standardavdrag</span><span className="tabular-nums">{fmtKr(lines.filter(l => l.kind === 'standard' && l.included).reduce((s, l) => s + l.amount, 0))}</span></div>
              <div className="flex justify-between"><span>− Kvitton ({lines.filter(l => l.kind !== 'standard' && l.included).length} st)</span><span className="tabular-nums">{fmtKr(lines.filter(l => l.kind !== 'standard' && l.included).reduce((s, l) => s + l.amount, 0))}</span></div>
              <div className="flex justify-between"><span>− Amortering</span><span className="tabular-nums">{fmtKr(calc.loanRepayment)}</span></div>
              <div className="flex justify-between font-medium border-t pt-1.5"><span>= Netto ex moms</span><span className="tabular-nums">{fmtKr(calc.net)}</span></div>
              <div className="flex justify-between"><span>+ Moms {Number(consultant?.vat_rate ?? 25)} %</span><span className="tabular-nums">{fmtKr(calc.vat)}</span></div>
              <div className="flex justify-between font-semibold text-base"><span>= Totalt att betala</span><span className="tabular-nums">{fmtKr(calc.total)}</span></div>
            </div>
            {calc.net < 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">Nettot är negativt. Kontrollera avdragen innan du skapar fakturan.</div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fakturadatum</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Anteckning</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(initialPayout ? 4 : 3)} disabled={!!initialPayout}>Tillbaka</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void doSaveDraft()} disabled={busy}>Spara utkast</Button>
                <Button variant="outline" onClick={() => void preview('invoice')} disabled={busy}>Förhandsgranska faktura</Button>
                <Button variant="outline" onClick={() => void preview('spec')} disabled={busy}>Förhandsgranska specifikation</Button>
                <Button onClick={() => setConfirmCreate(true)} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Skapa faktura
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>

      <AlertDialog open={confirmCreate} onOpenChange={setConfirmCreate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skapa faktura?</AlertDialogTitle>
            <AlertDialogDescription>Fakturanummer {consultant?.next_invoice_number ?? '—'} reserveras och kan inte återanvändas. Fortsätt?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doCreate()}>Skapa faktura</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
