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

// ---- Namnmatchning (samma modell som utbetalningsimporten) -----------------
const normalizeName = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s@.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (s: string) => normalizeName(s).split(' ').filter(t => t.length >= 2);

type Candidate = { case: CaseRow; score: number; reason: string };

function scoreCaseAgainst(c: CaseRow, payoutName: string | null): Candidate | null {
  const caseName = (c.customer_name ?? '') as string;
  const pTokens = tokens(payoutName ?? '');
  if (pTokens.length === 0) return null;
  const cTokens = new Set(tokens(caseName));
  let overlap = 0;
  for (const t of pTokens) if (cTokens.has(t)) overlap++;

  const nNorm = normalizeName(payoutName ?? '');
  const cNorm = normalizeName(caseName);
  const exact = nNorm && cNorm && nNorm === cNorm;
  const reversed = nNorm && cNorm && nNorm.split(' ').slice().reverse().join(' ') === cNorm;
  const containsFull = nNorm && cNorm && (nNorm.includes(cNorm) || cNorm.includes(nNorm));

  let score = 0;
  const reasons: string[] = [];
  if (exact) { score += 100; reasons.push('exakt namn'); }
  else if (reversed) { score += 90; reasons.push('omvänd ordning'); }
  else if (containsFull && cNorm.length >= 3) { score += 70; reasons.push('delsträng'); }
  if (overlap > 0) { score += overlap * 25; reasons.push(`${overlap} ord matchar`); }
  if (score <= 0) return null;
  return { case: c, score, reason: reasons.join(' · ') };
}

function findNameMatches(allCases: CaseRow[], name: string | null, limit = 5): Candidate[] {
  if (!name) return [];
  const out: Candidate[] = [];
  for (const c of allCases) {
    const cand = scoreCaseAgainst(c, name);
    if (cand) out.push(cand);
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

type LineItem = {
  order_number: string | null;
  customer_name?: string | null;
  name: string | null;
  note: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

type CaseChoice = { kind: 'case'; case: CaseRow } | { kind: 'unlinked' } | null;

type KmRow = {
  key: string;
  invoice_number: string;
  invoice_date: string | null;
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

const isKm = (li: LineItem) =>
  `${li.name ?? ''} ${li.note ?? ''}`.toLowerCase().includes('kontrollmätning');
const txt = (li: LineItem) => `${li.name ?? ''} ${li.note ?? ''}`.toLowerCase();
const isBil = (li: LineItem) => txt(li).includes('bilers');
const isRestid = (li: LineItem) => txt(li).includes('restid');
const isGrund = (li: LineItem) => txt(li).includes('grund');

function rowTotal(r: KmRow) {
  return Math.round((r.kmQty ?? 0) * (r.bilRate + r.restidRate) + r.grundavgift + r.enheterQty * r.enheterRate);
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function KmPayoutView({ currentUser }: Props) {
  const qc = useQueryClient();
  const { teams } = useMontorTeams();
  const { data: cases = [] } = useQuery({ queryKey: ['cases-all'], queryFn: fetchAllCases });

  const [stage, setStage] = useState<'upload' | 'review' | 'result'>('upload');
  const [progress, setProgress] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [rows, setRows] = useState<KmRow[]>([]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    booked: number; unlinked: number;
    invoices: { team: string; invoice_number: string; total: number }[];
  }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [distCalc, setDistCalc] = useState<Record<string, { status: 'loading' | 'done' | 'error'; km?: number; label?: string; suspicious?: boolean; error?: string }>>({});

  const reset = () => {
    setStage('upload'); setRows([]); setSkipped(0); setProgress(null); setResult(null); setSearch({});
    setDistCalc({});
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
      r.kmQty === 100 &&
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
    let skippedCount = 0;
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
        const kmItems = items.filter(isKm);
        skippedCount += items.length - kmItems.length;

        const byOrder = new Map<string, LineItem[]>();
        for (const li of kmItems) {
          const on = (li.order_number ?? '').trim() || '—';
          const arr = byOrder.get(on) ?? [];
          arr.push(li);
          byOrder.set(on, arr);
        }

        for (const [on, group] of byOrder) {
          const bil = group.find(isBil) ?? null;
          const restid = group.find(isRestid) ?? null;
          const grund = group.filter(isGrund).reduce((s, l) => s + (Number(l.amount) || 0), 0);
          const others = group.filter(l => !isBil(l) && !isRestid(l) && !isGrund(l));
          const enheterQty = others.reduce((s, l) => s + (Number(l.qty) || 0), 0);
          const enheterRate = others.length ? (Number(others[0].unit_price) || 0) : 0;
          const customer_name = group.find(l => l.customer_name)?.customer_name ?? data.customer_name ?? '';

          const kmQty = bil?.qty != null ? Number(bil.qty) : (restid?.qty != null ? Number(restid.qty) : null);
          const auto = findNameMatches(cases as CaseRow[], customer_name || null, 5);
          const strong = auto[0] && auto[0].score >= 90 && /exakt namn/i.test(auto[0].reason) ? auto[0].case : null;

          collected.push({
            key: `${path}|${on}`,
            invoice_number: data.invoice_number ?? '',
            invoice_date: data.invoice_date ?? null,
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
        toast.error('Inga kontrollmätningsrader hittades i filerna');
        setBusy(false); setProgress(null);
        return;
      }
      setRows(collected);
      setSkipped(skippedCount);
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

  const missing = rows.filter(r => !r.caseChoice || !r.teamId).length;
  const grandTotal = useMemo(() => rows.reduce((s, r) => s + rowTotal(r), 0), [rows]);

  async function book() {
    setBusy(true);
    try {
      let unlinked = 0;
      for (const r of rows) {
        const adjusted = r.lines.map(li => {
          if (isBil(li) || isRestid(li)) {
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
          file_path: r.file_path,
          file_name: r.file_name,
          order_number: r.order_number === '—' ? null : r.order_number,
          invoice_number: r.invoice_number,
          customer_name: r.customer_name || null,
          invoice_date: r.invoice_date,
          total_amount: rowTotal(r),
          currency: 'SEK',
          line_items: adjusted,
          uploaded_by: currentUser,
        });
        if (error) throw error;
      }

      // Montörsfakturor per team
      const byTeam = new Map<string, KmRow[]>();
      for (const r of rows) {
        if (!r.teamId) continue;
        const arr = byTeam.get(r.teamId) ?? [];
        arr.push(r);
        byTeam.set(r.teamId, arr);
      }

      const today = new Date();
      const invoices: { team: string; invoice_number: string; total: number }[] = [];
      for (const [teamId, teamRows] of byTeam) {
        const team = teams.find(t => t.id === teamId);
        if (!team) continue;
        const nums = Array.from(new Set(teamRows.map(r => r.invoice_number).filter(Boolean)));
        const res = await createAndSendDebitInvoice({
          team,
          title: 'Kontrollmätningar',
          description: `Avser Mockfjärds faktura ${nums.join(', ')}`,
          lines: teamRows.map(r => ({
            name: `Kontrollmätning — ${r.customer_name || 'Okänd kund'} (${r.kmQty ?? '—'} km, ${r.enheterQty} enh)`,
            amount: rowTotal(r),
          })),
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
        description: `Bokförde ${rows.length} KM-rader och skapade ${invoices.length} montörsfakturor`,
      });

      setResult({ booked: rows.length, unlinked, invoices });
      setStage('result');
      qc.invalidateQueries({ queryKey: ['unlinked-case-documents'] });
      qc.invalidateQueries({ queryKey: ['payout-docs-map'] });
      qc.invalidateQueries({ queryKey: ['montor_debit_invoices'] });
      toast.success('KM-utbetalningen är bokförd');
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
          <p className="text-sm font-medium">Dra hit Mockfjärds KM-fakturor (PDF)</p>
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
            {result.invoices.length} montörsfakturor skapade och skickade
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
            {skipped} rader är inte kontrollmätning och hoppas över — använd Importera fakturor för dem.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {rows.length} kundrader · totalt <span className="font-medium text-foreground">{fmt(grandTotal)}</span>
        </div>
        <div className="flex items-center gap-3">
          {missing > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{missing} kundrader saknar ärendeval eller montör.</span>
          )}
          <Button variant="ghost" onClick={reset} disabled={busy}>Avbryt</Button>
          <Button onClick={book} disabled={busy || missing > 0} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Bokför &amp; skapa montörsfakturor
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map(r => {
          const candidates = r.caseChoice ? [] : findNameMatches(cases as CaseRow[], r.customer_name || null, 5);
          const q = (search[r.key] ?? '').trim().toLowerCase();
          const searchHits = q
            ? (cases as CaseRow[]).filter(c =>
                (c.customer_name || '').toLowerCase().includes(q) ||
                (c.address || '').toLowerCase().includes(q)
              ).slice(0, 6)
            : [];
          const chosenCase = r.caseChoice?.kind === 'case' ? r.caseChoice.case : null;
          const kmTeamHint = (chosenCase as any)?.km_team as string | undefined;
          const schablon = r.kmQty === 100;
          const editable = r.bilRate > 0 || r.restidRate > 0;

          return (
            <div key={r.key} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium">{r.customer_name || 'Okänd kund'}</div>
                  <div className="text-xs text-muted-foreground">
                    Faktura {r.invoice_number || '—'} · Fsg.order {r.order_number}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Radsumma</div>
                  <div className="font-semibold">{fmt(rowTotal(r))}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => patch(r.key, { kmQty: dc.km! * 2 })}>
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
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Montör *</div>
                  <Select value={r.teamId ?? ''} onValueChange={v => patch(r.key, { teamId: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Välj montör..." /></SelectTrigger>
                    <SelectContent>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {kmTeamHint && (
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
                          <button
                            key={c.case.id}
                            onClick={() => patch(r.key, { caseChoice: { kind: 'case', case: c.case } })}
                            className="text-xs border rounded-md px-2 py-1 hover:bg-muted"
                          >
                            {c.case.customer_name} — {c.case.address}
                            <span className="text-muted-foreground"> · {c.reason}</span>
                          </button>
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
                          <button
                            key={c.id}
                            onClick={() => patch(r.key, { caseChoice: { kind: 'case', case: c } })}
                            className="text-xs border rounded-md px-2 py-1 hover:bg-muted"
                          >
                            {c.customer_name} — {c.address}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button size="sm" variant="outline" onClick={() => patch(r.key, { caseChoice: { kind: 'unlinked' } })}>
                      Importera utan koppling
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
