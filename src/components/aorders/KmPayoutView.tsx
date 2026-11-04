import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Loader2, AlertTriangle, Check, Search, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCases, type CaseRow } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMontorTeams } from '@/hooks/useMontorTeams';
import { createAndSendDebitInvoice } from '@/lib/debitInvoice';
import { logActivity } from '@/lib/activityLog';
import { HOUR_RATE } from '@/lib/constants';
import { rankCases, matchesSearch, type MatchTarget } from '@/lib/caseMatching';
import { Checkbox } from '@/components/ui/checkbox';
import { validateMockfjards, sumLines } from '@/lib/mockfjardsInvoice';
import { groupPayoutLines, payoutRowTotal as rowTotal, payoutRowWithHour as rowTotalWithHour, selectedPayoutRows, planPayoutInvoices, type PayoutLineItem } from '@/lib/payoutGroups';

interface Props { currentUser: string }

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const fmt = (n: number) => Math.round(n || 0).toLocaleString('sv-SE') + ' kr';

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// ---- Ärendematchning: gemensam modul (src/lib/caseMatching.ts) -------------
type Candidate = { case: CaseRow; score: number; reason: string; level: string };

function rankForPayout(allCases: CaseRow[], target: MatchTarget, limit = 5): Candidate[] {
  return rankCases(allCases as any[], target, { limit }).map(r => ({ case: r.case as unknown as CaseRow, score: r.score, reason: r.label, level: r.level }));
}

type LineItem = PayoutLineItem;

type CaseChoice = { kind: 'case'; case: CaseRow } | { kind: 'unlinked' } | null;

type KmRow = {
  kind: 'km' | 'extra';
  included: boolean;
  key: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  /** Avvikelser i fakturan (fakturanr, datum, total). Sparas som granskningsflagga för Drive-synken. */
  warnings: string[];
  file_path: string;
  file_name: string;
  order_number: string;
  customer_name: string;
  kmQty: number | null;
  bilRate: number;
  restidRate: number;
  grundavgift: number;
  enheterQty: number;
  enheterRate: number;
  lines: LineItem[];
  caseChoice: CaseChoice;
  teamId: string | null;
};

const txt = (li: LineItem) => `${li.name ?? ''} ${li.note ?? ''}`.toLowerCase();
const isBil = (li: LineItem) => txt(li).includes('bilers');
const isRestid = (li: LineItem) => txt(li).includes('restid');
const isGrund = (li: LineItem) => txt(li).includes('grund');

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function KmPayoutView({ currentUser }: Props) {
  const qc = useQueryClient();
  const { teams } = useMontorTeams();
  const { data: cases = [] } = useQuery({ queryKey: ['cases-all'], queryFn: fetchAllCases });

  const [stage, setStage] = useState<'upload' | 'review' | 'result'>('upload');
  const [progress, setProgress] = useState<string | null>(null);
  const [rows, setRows] = useState<KmRow[]>([]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveAnyway, setSaveAnyway] = useState(false);
  const [result, setResult] = useState<null | {
    booked: number; unlinked: number;
    invoices: { team: string; invoice_number: string; total: number }[];
  }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [distCalc, setDistCalc] = useState<Record<string, { status: 'loading' | 'done' | 'error'; km?: number; label?: string; suspicious?: boolean; error?: string }>>({});

  const reset = () => {
    setStage('upload'); setRows([]); setProgress(null); setResult(null); setSearch({});
    setDistCalc({}); setSaveAnyway(false);
  };

  const runDistance = async (row: KmRow) => {
    const team = teams.find((t) => t.id === row.teamId);
    const caseAddr = row.caseChoice?.kind === 'case' ? (row.caseChoice.case.address as string | null) : null;
    if (!team?.address || !caseAddr) return;
    setDistCalc((s) => ({ ...s, [row.key]: { status: 'loading' } }));
    try {
      const { data, error } = await supabase.functions.invoke('calc-distance', { body: { from: team.address, to: caseAddr } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDistCalc((s) => ({ ...s, [row.key]: { status: 'done', km: (data as any).km_one_way, suspicious: (data as any).suspicious === true, label: `${(data as any).from_resolved} → ${(data as any).to_resolved}` } }));
    } catch (e: any) {
      setDistCalc((s) => ({ ...s, [row.key]: { status: 'error', error: e?.message || 'Kunde inte beräkna' } }));
    }
  };

  // Auto-beräkna körsträcka för rader på schablon 100 km — en rad i taget (geokodarens takt).
  useEffect(() => {
    if (stage !== 'review') return;
    const next = rows.find((r) =>
      r.kind === 'km' && r.kmQty === 100 &&
      r.caseChoice?.kind === 'case' &&
      r.teamId &&
      teams.find((t) => t.id === r.teamId)?.address &&
      !distCalc[r.key]
    );
    if (next) runDistance(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, rows, distCalc, teams]);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (list.length === 0) { toast.error('Välj minst en PDF'); return; }
    setBusy(true);
    const collected: KmRow[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        setProgress(`Läser fil ${i + 1} av ${list.length}`);

        const safe = sanitizeFileName(f.name);
        const path = `unlinked/payouts/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from('case-documents')
          .upload(path, f, { upsert: false, contentType: f.type || 'application/pdf' });
        if (upErr) throw upErr;

        const base64 = await fileToBase64(f);
        const { data, error } = await supabase.functions.invoke('extract-payout', {
          body: { file_base64: base64, mime_type: f.type || 'application/pdf', file_name: f.name },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const items: LineItem[] = Array.isArray(data.line_items) ? data.line_items : [];
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const fileWarnings = validateMockfjards({ fileName: f.name, invoiceNumber: data.invoice_number, invoiceDate: data.invoice_date, dueDate: data.due_date, total: data.total_amount ?? null, lineSum: sumLines(items), hasLines: items.length > 0, today });
        if (data.source !== 'text') fileWarnings.unshift('PDF:en saknar textlager – uppgifterna är tolkade av AI och måste kontrolleras.');
        for (const { kind, included, order_number: on, lines: group } of groupPayoutLines(items)) {
          const bil = group.find(isBil) ?? null;
          const restid = group.find(isRestid) ?? null;
          const grund = group.filter(isGrund).reduce((s, l) => s + (Number(l.amount) || 0), 0);
          const others = group.filter(l => !isBil(l) && !isRestid(l) && !isGrund(l));
          const enheterQty = others.reduce((s, l) => s + (Number(l.qty) || 0), 0);
          const enheterRate = others.length ? (Number(others[0].unit_price) || 0) : 0;
          const customer_name = group.find(l => l.customer_name)?.customer_name ?? data.customer_name ?? '';

          const kmQty = bil?.qty != null ? Number(bil.qty) : (restid?.qty != null ? Number(restid.qty) : null);
          const jobAddress = (group.find(l => (l as any).job_address) as any)?.job_address ?? null;
          const auto = rankForPayout(cases as CaseRow[], { name: customer_name || null, mockfjardsOrderNumber: on, address: jobAddress }, 5);
          // Endast nivå auto väljs automatiskt; förslag visas och kräver ett tryck.
          const strong = auto[0]?.level === 'auto' ? auto[0].case : null;

          collected.push({
            key: `${path}|${kind}|${on}`,
            kind,
            included,
            invoice_number: data.invoice_number ?? '',
            invoice_date: data.invoice_date ?? null,
            due_date: data.due_date ?? null,
            warnings: fileWarnings,
            file_path: path,
            file_name: f.name,
            order_number: on,
            customer_name: customer_name || '',
            kmQty,
            bilRate: Number(bil?.unit_price) || 0,
            restidRate: Number(restid?.unit_price) || 0,
            grundavgift: grund,
            enheterQty,
            enheterRate,
            lines: group,
            caseChoice: strong ? { kind: 'case', case: strong } : null,
            teamId: null,
          });
        }
      }

      if (collected.length === 0) {
        toast.error('Inga utbetalningsrader hittades i filerna');
        setBusy(false); setProgress(null);
        return;
      }
      setRows(collected);
      setStage('review');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte läsa filerna');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const patch = (key: string, p: Partial<KmRow>) =>
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...p } : r)));

  const selectedRows = useMemo(() => selectedPayoutRows(rows), [rows]);
  const skipped = rows.filter(r => r.kind === 'extra' && !r.included).reduce((sum, r) => sum + r.lines.length, 0);
  const missing = selectedRows.filter(r => !r.caseChoice || !r.teamId).length;
  const warningFiles = useMemo(() => {
    const byFile = new Map<string, { file_name: string; warnings: string[] }>();
    for (const r of selectedRows) if (r.warnings.length) byFile.set(r.file_path, { file_name: r.file_name, warnings: r.warnings });
    return [...byFile.values()];
  }, [selectedRows]);
  const blockedByWarnings = warningFiles.length > 0 && !saveAnyway;
  const grandTotal = useMemo(() => selectedRows.reduce((sum, r) => sum + rowTotalWithHour(r), 0), [selectedRows]);

  async function book() {
    if (busy || missing > 0 || selectedRows.length === 0 || blockedByWarnings) return;
    setBusy(true);
    try {
      let unlinked = 0;
      for (const r of selectedRows) {
        const adjusted = r.lines.map(li => {
          if (r.kind === 'km' && (isBil(li) || isRestid(li))) {
            const qty = r.kmQty ?? 0;
            const price = Number(li.unit_price) || 0;
            return { ...li, qty, amount: Math.round(qty * price) };
          }
          return li;
        });
        const caseId = r.caseChoice?.kind === 'case' ? r.caseChoice.case.id : null;
        if (!caseId) unlinked++;

        const { error } = await (supabase as any).from('case_documents').insert({
          case_id: caseId,
          doc_type: 'mockfjards_payout',
          payout_kind: r.kind === 'km' ? 'km' : 'extra',
          file_path: r.file_path,
          file_name: r.file_name,
          order_number: r.order_number === '—' ? null : r.order_number,
          invoice_number: r.invoice_number,
          customer_name: r.customer_name || null,
          invoice_date: r.invoice_date,
          due_date: r.due_date,
          drive_review_reason: r.warnings.length ? r.warnings.join(' ') : null,
          total_amount: rowTotal(r),
          currency: 'SEK',
          line_items: adjusted,
          uploaded_by: currentUser,
        });
        if (error) throw error;
      }

      // En gemensam självfaktura per team för KM och aktivt valda extrajobb.
      const plans = planPayoutInvoices(selectedRows);

      const today = new Date();
      const invoices: { team: string; invoice_number: string; total: number }[] = [];
      for (const plan of plans) {
        const team = teams.find(t => t.id === plan.teamId);
        if (!team) continue;
        const res = await createAndSendDebitInvoice({
          team,
          title: plan.title,
          description: plan.description,
          lines: plan.lines,
          detailedLines: plan.detailedLines,
          vatMode: 'omvand',
          date: isoDate(today),
          dueDate: isoDate(addDays(today, 10)),
          createdBy: currentUser,
          kind: 'self_billing',
        });
        invoices.push({ team: (team as any).company_name || team.name, invoice_number: res.invoice_number, total: res.total });
      }

      logActivity({
        action: 'km_payout_booked',
        category: 'data',
        description: `Bokförde ${selectedRows.filter(r => r.kind === 'km').length} KM-grupper och ${selectedRows.filter(r => r.kind === 'extra').length} extrajobbsgrupper och skapade ${invoices.length} montörsfakturor`,
      });

      setResult({ booked: selectedRows.length, unlinked, invoices });
      setStage('result');
      qc.invalidateQueries({ queryKey: ['unlinked-case-documents'] });
      qc.invalidateQueries({ queryKey: ['payout-docs-map'] });
      qc.invalidateQueries({ queryKey: ['montor_debit_invoices'] });
      toast.success('Utbetalningarna är bokförda');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte bokföra');
    } finally {
      setBusy(false);
    }
  }

  // ---------- UPPLADDNING ----------
  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
          className="rounded-lg border-2 border-dashed p-10 text-center bg-muted/30"
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Dra hit Mockfjärds utbetalningar för KM och extrajobb (PDF)</p>
          <p className="text-xs text-muted-foreground mb-4">Flera filer kan laddas upp samtidigt.</p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Välj filer
          </Button>
          {progress && <p className="text-xs text-muted-foreground mt-3">{progress}</p>}
        </div>
      </div>
    );
  }

  // ---------- RESULTAT ----------
  if (stage === 'result' && result) {
    return (
      <div className="space-y-4">
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>
            {result.booked} kundrader bokförda (varav {result.unlinked} utan koppling — se Okopplade dokument) ·{' '}
            {result.invoices.length} montörsfakturor skapade och skickade · totalt {fmt(result.invoices.reduce((sum, invoice) => sum + invoice.total, 0))}
          </AlertDescription>
        </Alert>
        <div className="rounded-md border divide-y text-sm">
          {result.invoices.map(inv => (
            <div key={inv.invoice_number} className="px-3 py-2 flex justify-between">
              <span>{inv.invoice_number} → {inv.team}</span>
              <span className="font-medium">{fmt(inv.total)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Fakturorna hittas under fliken Montörsfakturor. Mail har skickats till respektive teams fakturaadress.
        </p>
        <Button variant="outline" onClick={reset}>Ny import</Button>
      </div>
    );
  }

  // ---------- GRANSKNING ----------
  return (
    <div className="space-y-4">
      {skipped > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {skipped} obockade rader hoppas över — använd Importera fakturor för dem.
          </AlertDescription>
        </Alert>
      )}

      {warningFiles.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium">Kontrollera fakturorna innan du bokför</div>
            <ul className="list-disc pl-5 space-y-1 mt-1 text-sm">
              {warningFiles.map(f => <li key={f.file_name}><span className="font-medium">{f.file_name}:</span> {f.warnings.join(' ')}</li>)}
            </ul>
            <p className="mt-2 text-xs">Bokför du ändå hålls dokumenten kvar för granskning och arkiveras inte i Drive förrän någon har kontrollerat dem.</p>
            <Button type="button" variant={saveAnyway ? 'default' : 'outline'} className="mt-2 min-h-12" aria-pressed={saveAnyway} onClick={() => setSaveAnyway(v => !v)}>
              {saveAnyway && <Check className="h-4 w-4 mr-2" />}Spara ändå
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {selectedRows.length} valda kundgrupper · totalt <span className="font-medium text-foreground">{fmt(grandTotal)}</span>
        </div>
        <div className="flex items-center flex-wrap gap-3">
          {missing > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{missing} kundrader saknar ärendeval eller montör.</span>
          )}
          <Button variant="ghost" onClick={reset} disabled={busy}>Avbryt</Button>
          <Button onClick={book} disabled={busy || missing > 0 || selectedRows.length === 0 || blockedByWarnings} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Bokför &amp; skapa montörsfakturor
          </Button>
        </div>
      </div>

      {(['km', 'extra'] as const).map(kind => (
      <section key={kind} className="space-y-3">
        <h2 className="text-lg font-semibold">{kind === 'km' ? 'Kontrollmätningar' : 'Extra jobb'}</h2>
        {rows.filter(r => r.kind === kind).map(r => {
          const candidates = r.caseChoice ? [] : rankForPayout(cases as CaseRow[], { name: r.customer_name || null, mockfjardsOrderNumber: r.order_number }, 5);
          const q = (search[r.key] ?? '').trim();
          const searchHits = q
            ? (cases as CaseRow[]).filter(c => matchesSearch([c.customer_name, c.address, (c as any).city], q)).slice(0, 6)
            : [];
          const chosenCase = r.caseChoice?.kind === 'case' ? r.caseChoice.case : null;
          const kmTeamHint = (chosenCase as any)?.km_team as string | undefined;
          const schablon = r.kind === 'km' && r.kmQty === 100;
          const editable = r.bilRate > 0 || r.restidRate > 0;

          return (
            <div key={r.key} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  {r.kind === 'extra' && (
                    <label className="flex items-center gap-2 min-h-11 text-sm cursor-pointer">
                      <Checkbox checked={r.included} disabled={busy} onCheckedChange={checked => patch(r.key, { included: checked === true })} />
                      Ta med
                    </label>
                  )}
                  <div className="font-medium">{r.customer_name || 'Okänd kund'}</div>
                  <div className="text-xs text-muted-foreground">
                    Faktura {r.invoice_number || '—'} · Fsg.order {r.order_number}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Radsumma</div>
                  <div className="font-semibold">{fmt(rowTotalWithHour(r))}</div>
                  {r.kind === 'km' && <div className="text-[11px] text-muted-foreground mt-0.5">
                    + Arbetstid KM: 1 tim × {fmt(HOUR_RATE)}
                  </div>}
                </div>
              </div>

              {(r.kind === 'km' || r.included) && <>
              {r.kind === 'extra' && (
                <div className="space-y-2">
                  {r.lines.map((line, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 items-center text-sm">
                      <div className="min-w-0 break-words">{line.name || line.note || 'Extra arbete'}{line.name && line.note && <div className="text-xs text-muted-foreground">{line.note}</div>}</div>
                      <Input type="number" step="any" aria-label={`Belopp för ${line.name || line.note || 'Extra arbete'}`} value={line.amount ?? ''} disabled={busy} onChange={e => patch(r.key, { lines: r.lines.map((item, i) => i === index ? { ...item, amount: e.target.value === '' ? null : Number(e.target.value) } : item) })} />
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {r.kind === 'km' && <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Km</div>
                  {editable ? (
                    <div className={`rounded-md ${schablon ? 'bg-yellow-100 dark:bg-yellow-900/40 dark:bg-yellow-900/30' : ''}`}>
                      <Input
                        type="number"
                        className="h-8"
                        value={r.kmQty ?? ''}
                        onChange={e => patch(r.key, { kmQty: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </div>
                  ) : (
                    <div className="h-8 flex items-center text-muted-foreground">—</div>
                  )}
                  {schablon && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Schablon 100 km? Verifiera verklig körsträcka.
                    </div>
                  )}
                  {schablon && (() => {
                    const team = teams.find(t => t.id === r.teamId);
                    const hasCase = r.caseChoice?.kind === 'case';
                    const dc = distCalc[r.key];
                    if (!r.teamId || !hasCase) return null;
                    if (!team?.address) {
                      return (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                          Teamet saknar utgångsadress — lägg in den under Montörsteam.
                        </div>
                      );
                    }
                    if (dc?.status === 'loading') {
                      return (
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Beräknar körsträcka...
                        </div>
                      );
                    }
                    if (dc?.status === 'done' && dc.km != null) {
                      if (dc.suspicious) {
                        return (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 space-y-1">
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Orimligt långt ({dc.km} km) — ärendets adress saknar troligen ort. Komplettera adressen på ärendet och tryck Försök igen.
                            </div>
                            <div className="text-muted-foreground">{dc.label}</div>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => runDistance(r)}>Försök igen</Button>
                          </div>
                        );
                      }
                      return (
                        <div className="text-[11px] mt-1 space-y-1">
                          <div className="text-green-700 dark:text-green-300 dark:text-green-400">Beräknat: {dc.km} km enkel väg — {dc.label}</div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => patch(r.key, { kmQty: dc.km })}>
                              Använd {dc.km}
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => patch(r.key, { kmQty: (dc.km ?? 0) * 2 })}>
                              Använd {dc.km * 2} t/r
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    if (dc?.status === 'error') {
                      return (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 space-y-1">
                          <div>{dc.error} — ange km manuellt.</div>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => runDistance(r)}>Försök igen</Button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Grundavgift</div>
                  <div className="h-8 flex items-center">{fmt(r.grundavgift)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Enheter</div>
                  <div className="h-8 flex items-center">{r.enheterQty} × {fmt(r.enheterRate)}</div>
                </div>
                </>}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Montör *</div>
                  <Select value={r.teamId ?? ''} onValueChange={v => patch(r.key, { teamId: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Välj montör..." /></SelectTrigger>
                    <SelectContent>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {r.kind === 'km' && kmTeamHint && (
                    <div className="text-[11px] text-muted-foreground mt-1">KM-team enligt ärendet: {kmTeamHint}</div>
                  )}
                </div>
              </div>

              {/* Ärendeval */}
              <div className="border-t pt-2">
                {r.caseChoice?.kind === 'case' ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-green-700 dark:text-green-300 dark:text-green-400 flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      {r.caseChoice.case.customer_name} — {r.caseChoice.case.address}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => patch(r.key, { caseChoice: null })}>Ändra val</Button>
                  </div>
                ) : r.caseChoice?.kind === 'unlinked' ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Badge variant="secondary">Importeras utan koppling</Badge>
                    <Button size="sm" variant="ghost" onClick={() => patch(r.key, { caseChoice: null })}>Ändra val</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {candidates.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {candidates.map(c => (
                          <Button variant="outline"
                            key={c.case.id}
                            onClick={() => patch(r.key, { caseChoice: { kind: 'case', case: c.case } })}
                            className="h-auto min-h-11 whitespace-normal text-left text-xs rounded-md px-2 py-1 flex-wrap justify-start"
                          >
                            {c.case.customer_name} — {c.case.address}
                            <span className="text-muted-foreground"> · {c.reason}</span>
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="h-8 pl-7"
                        placeholder="Sök ärende (kund eller adress)..."
                        value={search[r.key] ?? ''}
                        onChange={e => setSearch(s => ({ ...s, [r.key]: e.target.value }))}
                      />
                    </div>
                    {searchHits.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {searchHits.map(c => (
                          <Button variant="outline"
                            key={c.id}
                            onClick={() => patch(r.key, { caseChoice: { kind: 'case', case: c } })}
                            className="h-auto min-h-11 whitespace-normal text-left text-xs rounded-md px-2 py-1 flex-wrap justify-start"
                          >
                            {c.customer_name} — {c.address}
                          </Button>
                        ))}
                      </div>
                    )}
                    <Button size="sm" variant="outline" onClick={() => patch(r.key, { caseChoice: { kind: 'unlinked' } })}>
                      Importera utan koppling
                    </Button>
                  </div>
                )}
              </div>
              </>}
            </div>
          );
        })}
      </section>
      ))}
    </div>
  );
}
