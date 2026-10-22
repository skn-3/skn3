// Adminvy för konsultlöner: översikt, nyckeltal, utbetalningstabell och
// åtkomst till guiden, förskottsfaktura, lånereskontra och inställningar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Plus, Settings, Wallet, FileText, RefreshCw, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NextPayoutCard, PAYOUT_STATUS } from './NextPayoutCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { monthLabel } from '@/lib/consultantPay';
import { consultantInvoicePdfName, consultantSpecPdfName } from '@/lib/pdfNames';
import { openDocumentInNewTab } from '@/lib/openDocument';
import { invokeConsultantDrive, invokeConsultantPayout, fmtKr, DOC_TYPE_LABELS } from './consultantApi';
import { ConsultantPayoutWizard } from './ConsultantPayoutWizard';
import { AdvanceInvoiceDialog } from './AdvanceInvoiceDialog';
import { LoanLedgerSheet } from './LoanLedgerSheet';
import { ConsultantSettingsDialog } from './ConsultantSettingsDialog';
import { SendPayoutDialog } from './SendPayoutDialog';


interface Props { currentUser: string }

export function ConsultantPayView({ currentUser }: Props) {
  const [consultants, setConsultants] = useState<any[]>([]);
  const [consultantId, setConsultantId] = useState('');
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [logSheet, setLogSheet] = useState<{ id: string; name: string; webViewLink?: string } | null>(null);
  const [monthsLoaded, setMonthsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wizard, setWizard] = useState<{ open: boolean; payout?: any; folderId?: string }>({ open: false });
  const [preview, setPreview] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRefreshing, setPreviewRefreshing] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [settings, setSettings] = useState<{ open: boolean; consultant?: any }>({ open: false });
  const [detail, setDetail] = useState<any | null>(null);
  const [markPaid, setMarkPaid] = useState<any | null>(null);
  const [paidDate, setPaidDate] = useState('');
  const [undoPaid, setUndoPaid] = useState<any | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendPayout, setSendPayout] = useState<any | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const consultant = useMemo(() => consultants.find(c => c.id === consultantId) ?? null, [consultants, consultantId]);
  const loanBalance = useMemo(() => loans.reduce((s, l) => s + Number(l.amount), 0), [loans]);
  const unpaid = useMemo(() => payouts.filter(p => ['invoiced', 'sent'].includes(p.status)).reduce((s, p) => s + (Number(p.total_incl_vat) || 0), 0), [payouts]);
  const latest = useMemo(() => payouts.find(p => p.invoice_number), [payouts]);

  const loadConsultants = useCallback(async () => {
    const { data, error } = await supabase.from('consultants').select('*').eq('is_active', true).order('name');
    if (error) { toast.error(error.message); return; }
    setConsultants(data ?? []);
    setConsultantId(prev => prev || data?.[0]?.id || '');
  }, []);

  const loadData = useCallback(async (cid: string) => {
    if (!cid) { setPayouts([]); setLoans([]); setLoading(false); return; }
    setLoading(true);
    const [p, l] = await Promise.all([
      supabase.from('consultant_payouts').select('*').eq('consultant_id', cid)
        .order('payout_month', { ascending: false, nullsFirst: false })
        .order('invoice_number', { ascending: false, nullsFirst: false }),
      supabase.from('consultant_loans').select('*').eq('consultant_id', cid).order('date').order('created_at'),
    ]);
    if (p.error) toast.error(p.error.message); else setPayouts(p.data ?? []);
    if (l.error) toast.error(l.error.message); else setLoans(l.data ?? []);
    setLoading(false);
  }, []);

  const loadMonths = useCallback(async (cid: string) => {
    if (!cid) return;
    setMonthsLoaded(false);
    try {
      const data = await invokeConsultantDrive<{ log_sheet: any }>({ action: 'months', consultant_id: cid });
      setLogSheet(data.log_sheet ?? null);
    } catch {
      setLogSheet(null);
    }
    setMonthsLoaded(true);
  }, []);

  const loadPreview = useCallback(async (cid: string, force = false) => {
    if (!cid) { setPreview(null); return; }
    if (force) setPreviewRefreshing(true); else { setPreviewLoading(true); setPreview(null); }
    try {
      const data = await invokeConsultantDrive<{ preview: any }>({ action: 'preview', consultant_id: cid, force });
      setPreview(data.preview ?? null);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setPreviewLoading(false); setPreviewRefreshing(false);
  }, []);

  useEffect(() => { void loadConsultants(); }, [loadConsultants]);
  useEffect(() => { void loadPreview(consultantId); }, [consultantId, loadPreview]);
  useEffect(() => { void loadData(consultantId); void loadMonths(consultantId); }, [consultantId, loadData, loadMonths]);

  const refresh = () => { void loadData(consultantId); void loadConsultants(); void loadPreview(consultantId); };

  const openPdf = (path: string | null, name: string) => {
    if (!path) { toast.error('PDF:en saknas'); return; }
    void openDocumentInNewTab(async () => {
      const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(path, 600, { download: name });
      if (error) throw error;
      return data?.signedUrl ?? null;
    });
  };

  const doMarkPaid = async () => {
    if (!markPaid || !paidDate) return;
    setBusy(true);
    try {
      const data = await invokeConsultantPayout<{ log_error?: string }>({ action: 'mark_paid', payout_id: markPaid.id, paid_at: paidDate });
      toast.success(`Faktura ${markPaid.invoice_number} markerad som betald`);
      if (data.log_error) toast.warning(`Loggningen misslyckades: ${data.log_error}`);
      setMarkPaid(null);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const doUndoPaid = async () => {
    if (!undoPaid) return;
    setBusy(true);
    try {
      await invokeConsultantPayout({ action: 'undo_paid', payout_id: undoPaid.id });
      toast.success('Betalningen ångrades');
      setUndoPaid(null);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const doDeleteDraft = async () => {
    if (!deleteDraft) return;
    setBusy(true);
    try {
      const { error: lErr } = await supabase.from('consultant_payout_lines').delete().eq('payout_id', deleteDraft.id);
      if (lErr) throw lErr;
      const { error } = await supabase.from('consultant_payouts').delete().eq('id', deleteDraft.id).eq('status', 'draft');
      if (error) throw error;
      toast.success('Utkastet raderades');
      setDeleteDraft(null);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const openSendFor = async (payoutId: string) => {
    const { data } = await supabase.from('consultant_payouts').select('*').eq('id', payoutId).maybeSingle();
    if (data) setSendPayout(data);
  };

  const doArchive = async (p: any) => {
    setArchiving(p.id);
    try {
      const r = await invokeConsultantPayout<{ archive_error?: string; log_error?: string }>({ action: 'archive', payout_id: p.id });
      if (r.archive_error) toast.warning(`Arkiveringen misslyckades: ${r.archive_error}`);
      else toast.success(`Faktura ${p.invoice_number} arkiverad i Drive`);
      if (r.log_error) toast.warning(`Loggningen misslyckades: ${r.log_error}`);
      refresh();
      if (detail?.id === p.id) void supabase.from('consultant_payouts').select('*').eq('id', p.id).maybeSingle().then(({ data }) => data && setDetail(data));
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setArchiving(null);
  };

  const doBackfill = async () => {
    if (!consultant) return;
    setBackfilling(true);
    try {
      const r = await invokeConsultantPayout<{ skipped?: boolean; rows?: number }>({ action: 'log_backfill', consultant_id: consultant.id });
      toast.success(r.skipped ? 'Loggen var redan fylld' : `Loggen fylld med ${r.rows ?? 0} rader`);
      void loadConsultants();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBackfilling(false);
  };

  const fmtLoan = (loan: number) => (loan ? (loan < 0 ? `−${fmtKr(Math.abs(loan))}` : `+${fmtKr(loan)}`) : '—');
  const existingPayout = preview?.existing_payout_id ? payouts.find(p => p.id === preview.existing_payout_id) ?? null : null;

  const rowActions = (p: any) => {
    const items: Array<{ label: string; onClick: () => void; danger?: boolean }> = [
      { label: 'Öppna', onClick: () => (p.status === 'draft' ? setWizard({ open: true, payout: p }) : setDetail(p)) },
    ];
    if (p.invoice_pdf_path) items.push({ label: 'Faktura', onClick: () => openPdf(p.invoice_pdf_path, consultantInvoicePdfName(consultant ?? {}, p.invoice_number, p.invoice_date)) });
    if (p.spec_pdf_path) items.push({ label: 'Specifikation', onClick: () => openPdf(p.spec_pdf_path, consultantSpecPdfName(consultant ?? {}, p.invoice_number, p.payout_month)) });
    if (p.invoice_pdf_path && ['invoiced', 'sent', 'paid'].includes(p.status)) items.push({ label: p.sent_at ? 'Skicka igen' : 'Skicka', onClick: () => setSendPayout(p) });
    if (p.status !== 'paid' && p.invoice_number) items.push({ label: 'Markera betald', onClick: () => { setMarkPaid(p); setPaidDate(new Date().toISOString().slice(0, 10)); } });
    if (p.status === 'paid') items.push({ label: 'Ångra betald', onClick: () => setUndoPaid(p) });
    if (p.status === 'draft') items.push({ label: 'Radera utkast', onClick: () => setDeleteDraft(p), danger: true });
    return items;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={consultantId} onValueChange={setConsultantId}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Välj konsult" /></SelectTrigger>
          <SelectContent>
            {consultants.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.company_name})</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Button onClick={() => setWizard({ open: true })} disabled={!consultant}><Plus className="h-4 w-4 mr-1" />Ny lönekörning</Button>
          <Button variant="outline" onClick={() => setAdvanceOpen(true)} disabled={!consultant}><Wallet className="h-4 w-4 mr-1" />Förskottsfaktura</Button>
          <Button variant="outline" onClick={() => setLedgerOpen(true)} disabled={!consultant}>Lånereskontra</Button>
          <Button variant="outline" size="icon" aria-label="Inställningar" onClick={() => setSettings({ open: true, consultant })} disabled={!consultant}><Settings className="h-4 w-4" /></Button>
          {logSheet?.webViewLink && (
            <Button variant="ghost" asChild>
              <a href={logSheet.webViewLink} target="_blank" rel="noreferrer">Öppna loggen <ExternalLink className="h-3.5 w-3.5 ml-1" /></a>
            </Button>
          )}
        </div>
      </div>

      {monthsLoaded && logSheet && consultant && !consultant.log_backfilled_at && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border-l-2 border-gold pl-3">
          <span>Loggarket är hittat men saknar historiken.</span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => void doBackfill()} disabled={backfilling}>
            {backfilling && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Fyll loggen med historiken
          </Button>
        </div>
      )}

      {monthsLoaded && !logSheet && consultant && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border-l-2 border-gold pl-3">
          <span>Loggarket saknas: skapa ett tomt Google Sheet med namnet 'Konsultlöner – logg' i Löner-mappen och dela det med servicekontot som Redigerare.</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => void loadMonths(consultantId)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Sök igen</Button>
        </div>
      )}

      {consultant && (
        <NextPayoutCard
          preview={preview}
          loading={previewLoading}
          refreshing={previewRefreshing}
          onRefresh={() => void loadPreview(consultantId, true)}
          onStart={fid => setWizard({ open: true, folderId: fid })}
          existingPayout={existingPayout}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Lånesaldo</div><div className="text-lg font-semibold tabular-nums">{fmtKr(loanBalance)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Obetalt</div><div className="text-lg font-semibold tabular-nums">{fmtKr(unpaid)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Senaste körning</div><div className="text-lg font-semibold">{latest ? `${latest.payout_month ? monthLabel(latest.payout_month) : '—'} · Faktura ${latest.invoice_number}` : '—'}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Nästa fakturanummer</div><div className="text-lg font-semibold tabular-nums">{consultant?.next_invoice_number ?? '—'}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Utbetalningar</CardTitle></CardHeader>
        <CardContent className="p-0 md:p-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-6"><Loader2 className="h-4 w-4 animate-spin" />Laddar …</div>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Inga lönekörningar ännu.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utb-månad</TableHead>
                    <TableHead className="hidden md:table-cell">Period</TableHead>
                    <TableHead className="text-right">TB</TableHead>
                    <TableHead className="text-right hidden md:table-cell">%</TableHead>
                    <TableHead className="text-right md:hidden">Beräkning</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Provision</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Avdrag</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Lån</TableHead>
                    <TableHead className="text-right">Netto ex moms</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Moms</TableHead>
                    <TableHead className="text-right">Totalt</TableHead>
                    <TableHead>Faktura</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead><span className="sr-only">Åtgärder</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map(p => {
                    const st = PAYOUT_STATUS[p.status] ?? PAYOUT_STATUS.draft;
                    const loan = Number(p.loan_change) || 0;
                    const actions = rowActions(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap font-semibold">{p.payout_month ? monthLabel(p.payout_month) : '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground hidden md:table-cell">{p.period_start && p.period_end ? `${p.period_start} – ${p.period_end}` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.kind === 'advance' ? '—' : fmtKr(p.tb_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">{p.tier_pct != null ? `${p.tier_pct} %` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs md:hidden whitespace-nowrap">
                          <div>Provision {fmtKr(p.commission_gross)}</div>
                          <div className="text-muted-foreground">− Avdrag {fmtKr(p.deductions_total)}</div>
                          <div className="text-muted-foreground">Lån {fmtLoan(loan)}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">{fmtKr(p.commission_gross)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">{fmtKr(p.deductions_total)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">{fmtLoan(loan)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKr(p.net_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">{fmtKr(p.vat_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtKr(p.total_incl_vat)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums">{p.invoice_number ? `nr ${p.invoice_number} · ${p.invoice_date ?? ''}` : '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Chip tone={st.tone}>{st.label}</Chip>
                            {p.source === 'imported' && <Chip tone="neutral">Importerad</Chip>}
                            {p.kind === 'advance' && <Chip tone="warning">Förskott</Chip>}
                            {p.archive_error && <Chip tone="warning">Ej arkiverad</Chip>}
                          </div>
                          {p.archive_error && (
                            <Button size="sm" variant="ghost" className="h-8 px-2 mt-1 text-xs" onClick={() => void doArchive(p)} disabled={archiving === p.id}>
                              {archiving === p.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Arkivera igen
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="hidden lg:flex flex-wrap gap-1">
                            {actions.map(a => (
                              <Button key={a.label} size="sm" variant={a.label === 'Öppna' ? 'outline' : 'ghost'} className={a.danger ? 'text-destructive' : undefined} onClick={a.onClick}>
                                {a.label === 'Faktura' && <FileText className="h-3.5 w-3.5 mr-1" />}{a.label}
                              </Button>
                            ))}
                          </div>
                          <div className="lg:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline"><MoreHorizontal className="h-4 w-4 mr-1" />Åtgärder</Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {actions.map(a => (
                                  <DropdownMenuItem key={a.label} className={a.danger ? 'text-destructive' : undefined} onClick={a.onClick}>{a.label}</DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConsultantPayoutWizard
        open={wizard.open}
        onOpenChange={v => setWizard(w => ({ ...w, open: v }))}
        consultant={consultant}
        currentUser={currentUser}
        initialPayout={wizard.payout ?? null}
        initialFolderId={wizard.folderId ?? null}
        onDone={refresh}
        onCreated={id => void openSendFor(id)}
      />
      <AdvanceInvoiceDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        consultant={consultant}
        loanBalance={loanBalance}
        currentUser={currentUser}
        onDone={refresh}
        onCreated={id => void openSendFor(id)}
      />
      <LoanLedgerSheet open={ledgerOpen} onOpenChange={setLedgerOpen} consultant={consultant} loans={loans} currentUser={currentUser} onChanged={refresh} />
      <ConsultantSettingsDialog
        open={settings.open}
        onOpenChange={v => setSettings(s => ({ ...s, open: v }))}
        consultant={settings.consultant ?? null}
        onSaved={() => { void loadConsultants(); }}
      />

      <PayoutDetailSheet
        payout={detail}
        onClose={() => setDetail(null)}
        onSend={p => setSendPayout(p)}
        onArchive={p => void doArchive(p)}
        archiving={archiving}
      />
      <SendPayoutDialog
        payout={sendPayout}
        consultant={consultant}
        onClose={() => setSendPayout(null)}
        onSent={() => {
          refresh();
          if (detail?.id && detail.id === sendPayout?.id) void supabase.from('consultant_payouts').select('*').eq('id', detail.id).maybeSingle().then(({ data }) => data && setDetail(data));
        }}
      />

      <Dialog open={!!markPaid} onOpenChange={v => !v && setMarkPaid(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Markera faktura {markPaid?.invoice_number} som betald</DialogTitle>
            <DialogDescription>Ange betalningsdatum. Statusen blir Betald.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Betalningsdatum</Label>
            <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaid(null)}>Avbryt</Button>
            <Button onClick={() => void doMarkPaid()} disabled={busy || !paidDate}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Markera betald</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!undoPaid} onOpenChange={v => !v && setUndoPaid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ångra betald?</AlertDialogTitle>
            <AlertDialogDescription>Faktura {undoPaid?.invoice_number} får tillbaka sin tidigare status.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doUndoPaid()}>Ångra betald</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDraft} onOpenChange={v => !v && setDeleteDraft(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera utkastet?</AlertDialogTitle>
            <AlertDialogDescription>Utkastet och dess rader raderas. Det går inte att ångra.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDeleteDraft()}>Radera utkast</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PayoutDetailSheet({ payout, onClose, onSend, onArchive, archiving }: { payout: any | null; onClose: () => void; onSend: (p: any) => void; onArchive: (p: any) => void; archiving: string | null }) {
  const [lines, setLines] = useState<any[]>([]);
  useEffect(() => {
    if (!payout) { setLines([]); return; }
    void supabase.from('consultant_payout_lines').select('*').eq('payout_id', payout.id).order('sort').then(({ data }) => setLines(data ?? []));
  }, [payout]);
  if (!payout) return null;
  const tbRows = Array.isArray(payout.tb_rows) ? payout.tb_rows : [];
  const corrections = Array.isArray(payout.tb_corrections) ? payout.tb_corrections : [];
  return (
    <Sheet open={!!payout} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{payout.kind === 'advance' ? 'Förskottsfaktura' : `Lönekörning ${payout.payout_month ? monthLabel(payout.payout_month) : ''}`}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-4 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Status</span><span>{PAYOUT_STATUS[payout.status]?.label ?? payout.status}</span>
            <span className="text-muted-foreground">Faktura</span><span>{payout.invoice_number ? `nr ${payout.invoice_number} · ${payout.invoice_date ?? ''}` : '—'}</span>
            <span className="text-muted-foreground">Period</span><span>{payout.period_start && payout.period_end ? `${payout.period_start} – ${payout.period_end}` : '—'}</span>
            <span className="text-muted-foreground">Utbetalningsdatum (Mockfjärds)</span><span>{payout.provision_payout_date ?? '—'}</span>
          </div>

          {tbRows.length > 0 && (
            <section>
              <h3 className="font-medium mb-1">TB-rader</h3>
              <ul className="space-y-0.5">
                {tbRows.map((r: any, i: number) => (
                  <li key={i} className="flex justify-between gap-2 text-xs">
                    <span>{r.order_number ?? ''} · {r.customer_name ?? ''} {r.signing_date ? `(${r.signing_date})` : ''}</span>
                    <span className="tabular-nums">{fmtKr(r.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-xs font-medium mt-1"><span>Summa Utb.ÅF</span><span className="tabular-nums">{fmtKr(payout.tb_sum_rows)}</span></div>
            </section>
          )}

          {corrections.length > 0 && (
            <section>
              <h3 className="font-medium mb-1">Korrigeringar</h3>
              <ul className="space-y-0.5">
                {corrections.map((r: any, i: number) => (
                  <li key={i} className="flex justify-between gap-2 text-xs">
                    <span>{r.text ?? r.customer_name ?? r.order_number ?? ''}</span>
                    <span className="tabular-nums">{fmtKr(r.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-xs font-medium mt-1"><span>Summa Korrigering</span><span className="tabular-nums">{fmtKr(payout.tb_sum_corrections)}</span></div>
            </section>
          )}

          <section>
            <h3 className="font-medium mb-1">Avdrag</h3>
            {lines.length === 0 ? <p className="text-xs text-muted-foreground">Inga avdragsrader.</p> : (
              <ul className="space-y-1">
                {lines.map(l => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {!l.included && <Badge variant="outline" className="shrink-0">Ej draget</Badge>}
                      <span className="truncate">{DOC_TYPE_LABELS[l.doc_type ?? ''] ?? l.kind} · {l.label}</span>
                      {l.drive_web_link && <a href={l.drive_web_link} target="_blank" rel="noreferrer" className="text-primary shrink-0"><ExternalLink className="h-3 w-3" /></a>}
                    </span>
                    <span className="tabular-nums shrink-0">{fmtKr(l.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="font-medium mb-1">Lån</h3>
            <p className="text-xs">{Number(payout.loan_change) < 0 ? `Amortering ${fmtKr(Math.abs(Number(payout.loan_change)))}` : Number(payout.loan_change) > 0 ? `Förskott ${fmtKr(payout.loan_change)}` : 'Ingen lånerörelse'}</p>
          </section>

          <section className="rounded-md border p-3 space-y-1">
            <div className="flex justify-between text-xs"><span>TB</span><span className="tabular-nums">{fmtKr(payout.tb_amount)}</span></div>
            <div className="flex justify-between text-xs"><span>Provision {payout.tier_pct != null ? `(${payout.tier_pct} %)` : ''}</span><span className="tabular-nums">{fmtKr(payout.commission_gross)}</span></div>
            <div className="flex justify-between text-xs"><span>Avdrag</span><span className="tabular-nums">−{fmtKr(payout.deductions_total)}</span></div>
            <div className="flex justify-between text-xs"><span>Lån</span><span className="tabular-nums">{Number(payout.loan_change) < 0 ? `−${fmtKr(Math.abs(Number(payout.loan_change)))}` : fmtKr(payout.loan_change)}</span></div>
            <div className="flex justify-between text-xs font-medium"><span>Netto ex moms</span><span className="tabular-nums">{fmtKr(payout.net_amount)}</span></div>
            <div className="flex justify-between text-xs"><span>Moms {payout.vat_rate} %</span><span className="tabular-nums">{fmtKr(payout.vat_amount)}</span></div>
            <div className="flex justify-between font-semibold"><span>Totalt</span><span className="tabular-nums">{fmtKr(payout.total_incl_vat)}</span></div>
          </section>

          {payout.notes && (
            <section>
              <h3 className="font-medium mb-1">Anteckningar</h3>
              <p className="text-xs whitespace-pre-wrap">{payout.notes}</p>
            </section>
          )}

          {payout.invoice_pdf_path && ['invoiced', 'sent', 'paid'].includes(payout.status) && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">Utskick</h3>
                <Button size="sm" variant="outline" onClick={() => onSend(payout)}>{payout.sent_at ? 'Skicka igen' : 'Skicka'}</Button>
              </div>
              {Array.isArray(payout.sent_log) && payout.sent_log.length > 0 ? (
                <ul className="space-y-1.5">
                  {payout.sent_log.map((e: any, i: number) => (
                    <li key={i} className="text-xs rounded-md border p-2">
                      <div className="font-medium">{e.at ? new Date(e.at).toLocaleString('sv-SE') : '—'}{e.by ? ` · av ${e.by}` : ''}</div>
                      <div className="text-muted-foreground break-all">{Array.isArray(e.to) ? e.to.join(', ') : String(e.to ?? '')}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">Inte skickad ännu.</p>}
            </section>
          )}

          {payout.invoice_pdf_path && (
            <section className="space-y-1.5">
              <h3 className="font-medium">Drive</h3>
              {payout.invoice_drive_payer_link
                ? <a href={payout.invoice_drive_payer_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary">Betalarens bokföring{payout.invoice_drive_payer_folder ? ` (${payout.invoice_drive_payer_folder})` : ''} <ExternalLink className="h-3 w-3" /></a>
                : <p className="text-xs text-muted-foreground">Inte arkiverad i betalarens bokföring.</p>}
              {payout.invoice_drive_link
                ? <a href={payout.invoice_drive_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary">Löner-mappen <ExternalLink className="h-3 w-3" /></a>
                : <p className="text-xs text-muted-foreground">Inte arkiverad i Löner-mappen.</p>}
              {payout.archive_error && (
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="warning">Ej arkiverad</Chip>
                  <span className="text-xs text-muted-foreground">{payout.archive_error}</span>
                  <Button size="sm" variant="outline" onClick={() => onArchive(payout)} disabled={archiving === payout.id}>
                    {archiving === payout.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Arkivera igen
                  </Button>
                </div>
              )}
            </section>
          )}

          <section>
            <h3 className="font-medium mb-1">Tidpunkter</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Skapad</span><span>{payout.created_at ? new Date(payout.created_at).toLocaleString('sv-SE') : '—'}</span>
              <span className="text-muted-foreground">Uppdaterad</span><span>{payout.updated_at ? new Date(payout.updated_at).toLocaleString('sv-SE') : '—'}</span>
              <span className="text-muted-foreground">Skickad</span><span>{payout.sent_at ? new Date(payout.sent_at).toLocaleString('sv-SE') : '—'}</span>
              <span className="text-muted-foreground">Betald</span><span>{payout.paid_at ?? '—'}{payout.paid_by ? ` av ${payout.paid_by}` : ''}</span>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
