import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCases, createCaseEvent, updateCase, type CaseRow } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Upload, FileText, Search, Check, Loader2, AlertTriangle, Sparkles, Trash2, Plus, ChevronDown, Layers } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';

interface PayoutUploadViewProps {
  currentUser: string;
}

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

type LineItem = {
  order_number: string | null;
  customer_name?: string | null;
  name: string | null;
  note: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

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

const norm = (s: string | null | undefined) => (s ?? '').trim();

// ---- Namnmatchning ----------------------------------------------------------
const normalizeName = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^\p{L}\p{N}\s@.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (s: string) =>
  normalizeName(s).split(' ').filter(t => t.length >= 2);

const emailLocal = (e: string | null | undefined) =>
  (e ?? '').split('@')[0]?.toLowerCase() ?? '';

const phoneDigits = (p: string | null | undefined) =>
  (p ?? '').replace(/\D+/g, '');

type Candidate = { case: CaseRow; score: number; reason: string };

function scoreCaseAgainst(
  c: CaseRow,
  payoutName: string | null,
  payoutPhone?: string | null,
): Candidate | null {
  const caseName = (c.customer_name ?? '') as string;
  const caseEmail = (c as any).customer_email as string | null | undefined;
  const casePhone = (c as any).customer_phone as string | null | undefined;

  const pTokens = tokens(payoutName ?? '');
  if (pTokens.length === 0 && !payoutPhone) return null;

  const cTokens = tokens(caseName);
  const cEmailLocalTokens = tokens(emailLocal(caseEmail));
  const allCaseTokens = new Set([...cTokens, ...cEmailLocalTokens]);

  let overlap = 0;
  for (const t of pTokens) if (allCaseTokens.has(t)) overlap++;

  const nNorm = normalizeName(payoutName ?? '');
  const cNorm = normalizeName(caseName);
  const exact = nNorm && cNorm && nNorm === cNorm;
  const reversed = nNorm && cNorm &&
    nNorm.split(' ').slice().reverse().join(' ') === cNorm;
  const containsFull = nNorm && cNorm && (nNorm.includes(cNorm) || cNorm.includes(nNorm));

  let score = 0;
  const reasons: string[] = [];
  if (exact) { score += 100; reasons.push('exakt namn'); }
  else if (reversed) { score += 90; reasons.push('omvänd ordning'); }
  else if (containsFull && cNorm.length >= 3) { score += 70; reasons.push('delsträng'); }

  if (overlap > 0) {
    score += overlap * 25;
    reasons.push(`${overlap} ord matchar`);
  }

  // Phone signal
  const pPhone = phoneDigits(payoutPhone);
  const cPhone = phoneDigits(casePhone);
  if (pPhone && cPhone && (pPhone.endsWith(cPhone.slice(-7)) || cPhone.endsWith(pPhone.slice(-7)))) {
    score += 50;
    reasons.push('telefon');
  }

  if (score <= 0) return null;
  return { case: c, score, reason: reasons.join(' · ') };
}

function findNameMatches(
  allCases: CaseRow[],
  payoutName: string | null,
  payoutPhone?: string | null,
  limit = 5,
): Candidate[] {
  if (!payoutName && !payoutPhone) return [];
  const out: Candidate[] = [];
  for (const c of allCases) {
    const cand = scoreCaseAgainst(c, payoutName ?? null, payoutPhone ?? null);
    if (cand) out.push(cand);
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}


type DocType = 'mockfjards_payout' | 'a_order';

export function PayoutUploadView({ currentUser }: PayoutUploadViewProps) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState<DocType>('mockfjards_payout');
  const [file, setFile] = useState<File | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');
  const [chosenCase, setChosenCase] = useState<CaseRow | null>(null);
  // Multi-mode: per-order-number manually chosen case override
  const [groupChoices, setGroupChoices] = useState<Record<string, CaseRow | null>>({});
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const isCost = docType === 'a_order';
  const typeLabel = isCost ? 'Egen faktura / A-order (utgift)' : 'Mockfjärds-utbetalning (intäkt)';
  const shortLabel = isCost ? 'Faktura/A-order' : 'Utbetalning';

  const { data: cases = [] } = useQuery({ queryKey: ['cases-all'], queryFn: fetchAllCases });

  // Distinct order numbers from line items
  const distinctOrderNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const li of lineItems) {
      const o = norm(li.order_number);
      if (o) set.add(o);
    }
    return Array.from(set);
  }, [lineItems]);

  const isMulti = distinctOrderNumbers.length > 1;

  // Single-mode auto-match by order_number
  const orderMatch = useMemo(() => {
    const q = orderNumber.trim();
    if (!q) return null;
    return (cases as any[]).find(c => norm(c.order_number) === q) || null;
  }, [orderNumber, cases]);

  // Namnkandidater (fallback i single-läge)
  const nameCandidates = useMemo<Candidate[]>(() => {
    if (orderMatch) return [];
    return findNameMatches(cases as CaseRow[], customerName, null, 5);
  }, [orderMatch, cases, customerName]);

  // Auto-välj toppkandidat om den är tydlig (exakt namn / omvänd ordning)
  const strongNameMatch = nameCandidates[0] && nameCandidates[0].score >= 90 ? nameCandidates[0].case : null;

  const effectiveCase = chosenCase || orderMatch || strongNameMatch;

  // Multi-mode groups
  type Group = {
    order_number: string;
    lines: LineItem[];
    subtotal: number;
    groupCustomerName: string | null;
    autoCase: CaseRow | null;
    nameCandidates: Candidate[];
    effectiveCase: CaseRow | null;
    matchSource: 'order' | 'name' | 'manual' | null;
  };
  const groups: Group[] = useMemo(() => {
    return distinctOrderNumbers.map(on => {
      const lines = lineItems.filter(li => norm(li.order_number) === on);
      const subtotal = lines.reduce((s, li) => s + (Number(li.amount) || 0), 0);
      const groupCustomerName = lines.find(l => norm(l.customer_name))?.customer_name ?? null;
      const orderC = (cases as any[]).find(c => norm(c.order_number) === on) || null;
      const candidates = orderC ? [] : findNameMatches(cases as CaseRow[], groupCustomerName, null, 5);
      const strong = candidates[0] && candidates[0].score >= 90 ? candidates[0].case : null;
      const autoCase = orderC || strong;
      const override = groupChoices[on] ?? null;
      const effective = override || autoCase;
      const matchSource: Group['matchSource'] =
        override ? 'manual' : orderC ? 'order' : strong ? 'name' : null;
      return {
        order_number: on,
        lines,
        subtotal,
        groupCustomerName,
        autoCase,
        nameCandidates: candidates,
        effectiveCase: effective,
        matchSource,
      };
    });
  }, [distinctOrderNumbers, lineItems, cases, groupChoices]);

  const unassignedLines = useMemo(
    () => lineItems.filter(li => !norm(li.order_number)),
    [lineItems],
  );

  const groupedSubtotalSum = useMemo(
    () => groups.reduce((s, g) => s + g.subtotal, 0),
    [groups],
  );

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (cases as CaseRow[])
      .filter(c =>
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.offer_number || '').toLowerCase().includes(q) ||
        ((c as any).order_number || '').toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [search, cases]);

  const filteredCasesForGroup = (on: string) => {
    const q = (groupSearch[on] ?? '').trim().toLowerCase();
    if (!q) return [];
    return (cases as CaseRow[])
      .filter(c =>
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.offer_number || '').toLowerCase().includes(q) ||
        ((c as any).order_number || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  };

  const lineSum = useMemo(
    () => lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0),
    [lineItems],
  );
  const totalNum = Number(totalAmount) || 0;
  const sumMismatch = lineItems.length > 0 && totalNum > 0 && Math.abs(lineSum - totalNum) > 0.5;
  const multiSumMismatch = isMulti && totalNum > 0 && Math.abs(groupedSubtotalSum - totalNum) > 0.5;

  const reset = () => {
    setFile(null);
    setOrderNumber('');
    setInvoiceNumber('');
    setCustomerName('');
    setInvoiceDate('');
    setTotalAmount('');
    setLineItems([]);
    setSearch('');
    setChosenCase(null);
    setGroupChoices({});
    setGroupSearch({});
    setExtracted(false);
    setExtractError(null);
  };

  const runExtract = async (f: File) => {
    setExtracting(true);
    setExtractError(null);
    setExtracted(false);
    try {
      const base64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke('extract-payout', {
        body: { file_base64: base64, mime_type: f.type || 'application/pdf', file_name: f.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const items: LineItem[] = Array.isArray(data.line_items) ? data.line_items : [];
      const orderNumbers: string[] = Array.isArray(data.order_numbers) ? data.order_numbers : [];
      const firstOrder = orderNumbers[0] || (items[0]?.order_number ?? '');

      setOrderNumber(prev => prev || (firstOrder ?? ''));
      setInvoiceNumber(prev => prev || (data.invoice_number ?? ''));
      setCustomerName(prev => prev || (data.customer_name ?? ''));
      setInvoiceDate(prev => prev || (data.invoice_date ?? ''));
      setTotalAmount(prev => prev || (data.total_amount != null ? String(data.total_amount) : ''));
      setLineItems(items);
      setExtracted(true);
      toast.success('AI förfyllde fälten — granska och bekräfta');
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? 'Okänt fel';
      setExtractError(msg);
      toast.error(`AI-avläsning misslyckades: ${msg}. Fyll i manuellt.`);
    } finally {
      setExtracting(false);
    }
  };

  const onFileChange = (f: File | null) => {
    setFile(f);
    setExtracted(false);
    setExtractError(null);
    if (f) runExtract(f);
  };

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLineItems(items => items.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };
  const removeLine = (idx: number) => setLineItems(items => items.filter((_, i) => i !== idx));
  const addLine = () => setLineItems(items => [
    ...items,
    { order_number: orderNumber || null, name: '', note: null, qty: null, unit_price: null, amount: null },
  ]);

  // Assign an unassigned line (by its index in lineItems) to a given order_number
  const assignLineToOrder = (lineIdx: number, on: string) => {
    setLineItems(items => items.map((li, i) => (i === lineIdx ? { ...li, order_number: on || null } : li)));
  };

  const handleSubmitSingle = async () => {
    if (!file) { toast.error('Välj en PDF'); return; }
    if (!orderNumber.trim()) { toast.error('Ange ordernummer'); return; }
    if (!invoiceNumber.trim()) { toast.error('Ange fakturanummer'); return; }
    if (!totalAmount.trim() || isNaN(Number(totalAmount))) { toast.error('Ange totalbelopp'); return; }
    if (!effectiveCase) { toast.error('Välj ett ärende att koppla till'); return; }

    setSubmitting(true);
    try {
      const caseId = effectiveCase.id;
      const safe = sanitizeFileName(file.name);
      const path = `${caseId}/payouts/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from('case-documents')
        .upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;

      const amountNum = Number(totalAmount);
      const { error: insErr } = await (supabase as any).from('case_documents').insert({
        case_id: caseId,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
        order_number: orderNumber.trim(),
        invoice_number: invoiceNumber.trim(),
        customer_name: customerName.trim() || null,
        invoice_date: invoiceDate || null,
        total_amount: amountNum,
        currency: 'SEK',
        line_items: lineItems.length > 0 ? lineItems : null,
        uploaded_by: currentUser,
      });
      if (insErr) throw insErr;

      if (!norm((effectiveCase as any).order_number)) {
        try { await updateCase(caseId, { order_number: orderNumber.trim() } as any); } catch (e) { console.warn(e); }
      }

      const eventDesc = isCost
        ? `Egen faktura/A-order kopplad: faktura ${invoiceNumber.trim()}, kostnad ${amountNum.toLocaleString('sv-SE')} kr`
        : `Mockfjärds-utbetalning kopplad: faktura ${invoiceNumber.trim()}, belopp ${amountNum.toLocaleString('sv-SE')} kr`;
      await createCaseEvent({
        case_id: caseId,
        event_type: 'note',
        description: eventDesc,
        created_by: currentUser,
      });

      logActivity({
        action: isCost ? 'cost_doc_uploaded' : 'payout_uploaded',
        category: 'case',
        description: `Laddade upp ${shortLabel.toLowerCase()} (faktura ${invoiceNumber.trim()}) för ${effectiveCase.address}`,
        case_id: caseId,
        metadata: { doc_type: docType, invoice_number: invoiceNumber.trim(), total_amount: amountNum, order_number: orderNumber.trim() },
      });

      qc.invalidateQueries({ queryKey: ['case-documents', caseId] });
      qc.invalidateQueries({ queryKey: ['cases-all'] });
      toast.success(isCost ? 'Faktura/A-order kopplad till ärendet' : 'Utbetalning kopplad till ärendet');
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(`Misslyckades: ${e?.message ?? 'okänt fel'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitMulti = async () => {
    if (!file) { toast.error('Välj en PDF'); return; }
    if (!invoiceNumber.trim()) { toast.error('Ange fakturanummer'); return; }
    if (unassignedLines.length > 0) {
      toast.error('Tilldela alla rader till ett ordernummer först'); return;
    }
    const missing = groups.filter(g => !g.effectiveCase);
    if (missing.length > 0) {
      toast.error(`Koppla ärende för ordernummer: ${missing.map(g => g.order_number).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      // Upload file ONCE; reuse same path for all rows
      const safe = sanitizeFileName(file.name);
      const path = `shared-payouts/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from('case-documents')
        .upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;

      const inv = invoiceNumber.trim();

      for (const g of groups) {
        const c = g.effectiveCase!;
        const caseId = c.id;
        const { error: insErr } = await (supabase as any).from('case_documents').insert({
          case_id: caseId,
          doc_type: docType,
          file_path: path,
          file_name: file.name,
          order_number: g.order_number,
          invoice_number: inv,
          customer_name: customerName.trim() || null,
          invoice_date: invoiceDate || null,
          total_amount: g.subtotal,
          currency: 'SEK',
          line_items: g.lines,
          uploaded_by: currentUser,
        });
        if (insErr) throw insErr;

        if (!norm((c as any).order_number)) {
          try { await updateCase(caseId, { order_number: g.order_number } as any); } catch (e) { console.warn(e); }
        }

        const eventDesc = isCost
          ? `Egen faktura/A-order kopplad (del av faktura ${inv}): kostnad ${g.subtotal.toLocaleString('sv-SE')} kr`
          : `Mockfjärds-utbetalning kopplad (del av faktura ${inv}): belopp ${g.subtotal.toLocaleString('sv-SE')} kr`;
        await createCaseEvent({
          case_id: caseId,
          event_type: 'note',
          description: eventDesc,
          created_by: currentUser,
        });

        logActivity({
          action: isCost ? 'cost_doc_uploaded' : 'payout_uploaded',
          category: 'case',
          description: `Laddade upp ${shortLabel.toLowerCase()} (del av faktura ${inv}) för ${c.address}`,
          case_id: caseId,
          metadata: { doc_type: docType, invoice_number: inv, total_amount: g.subtotal, order_number: g.order_number, multi: true, groups: groups.length },
        });

        qc.invalidateQueries({ queryKey: ['case-documents', caseId] });
      }

      qc.invalidateQueries({ queryKey: ['cases-all'] });
      toast.success(`Faktura kopplad till ${groups.length} ärenden`);
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(`Misslyckades: ${e?.message ?? 'okänt fel'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => (isMulti ? handleSubmitMulti() : handleSubmitSingle());

  const submitDisabled =
    submitting ||
    !file ||
    extracting ||
    (isMulti
      ? unassignedLines.length > 0 || groups.some(g => !g.effectiveCase)
      : !effectiveCase);

  return (
    <div className="px-3 md:px-0 max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Ladda upp Mockfjärds-utbetalning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>PDF-fil</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              disabled={extracting}
            />
            {file && (
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <FileText className="h-3 w-3" /> {file.name}
              </div>
            )}
            {extracting && (
              <div className="text-sm text-muted-foreground mt-2 inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> AI läser PDF:en…
              </div>
            )}
            {extracted && !extracting && (
              <div className="text-sm text-primary mt-2 inline-flex items-center gap-1">
                <Sparkles className="h-4 w-4" /> AI har förfyllt fälten — granska innan du bekräftar
              </div>
            )}
            {extractError && (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>AI-avläsning misslyckades</AlertTitle>
                <AlertDescription>
                  {extractError}. Fyll i fälten manuellt.
                  {file && (
                    <Button variant="outline" size="sm" className="ml-2" onClick={() => runExtract(file)}>
                      Försök igen
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Faktura-fält (ordernummer döljs i multi-läge) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!isMulti && (
              <div>
                <Label>Ordernummer *</Label>
                <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="t.ex. 12345" />
              </div>
            )}
            <div>
              <Label>Fakturanummer *</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <Label>Kundnamn</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <Label>Fakturadatum</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label>Totalbelopp (SEK) {isMulti ? '' : '*'}</Label>
              <Input type="number" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </div>
          </div>

          {/* MULTI-LÄGE */}
          {isMulti && (
            <div className="space-y-3">
              <Alert>
                <Layers className="h-4 w-4" />
                <AlertTitle>Den här fakturan täcker {groups.length} ärenden</AlertTitle>
                <AlertDescription>
                  Kontrollera kopplingarna nedan. Varje grupp sparas som en egen utbetalning per ärende, med samma faktura ({invoiceNumber || '—'}).
                </AlertDescription>
              </Alert>

              {multiSumMismatch && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Delsummorna stämmer inte med fakturans total</AlertTitle>
                  <AlertDescription>
                    Summan av delsummorna är {groupedSubtotalSum.toLocaleString('sv-SE')} kr men totalbelopp är {totalNum.toLocaleString('sv-SE')} kr. Kontrollera.
                  </AlertDescription>
                </Alert>
              )}

              {groups.map(g => {
                const override = groupChoices[g.order_number] ?? null;
                const showSearch = !g.autoCase || !!override;
                const results = filteredCasesForGroup(g.order_number);
                return (
                  <Card key={g.order_number} className="border-l-4 border-l-primary/40">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          Order {g.order_number}
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            ({g.lines.length} rad{g.lines.length === 1 ? '' : 'er'} · {g.subtotal.toLocaleString('sv-SE')} kr)
                          </span>
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {g.groupCustomerName && (
                        <div className="text-xs text-muted-foreground">
                          Slutkund: <span className="text-foreground font-medium">{g.groupCustomerName}</span>
                        </div>
                      )}
                      {g.effectiveCase ? (
                        <Alert>
                          <Check className="h-4 w-4" />
                          <AlertTitle className="flex items-center gap-2">
                            {g.matchSource === 'manual' && 'Valt ärende'}
                            {g.matchSource === 'order' && 'Matchat ärende (ordernummer)'}
                            {g.matchSource === 'name' && 'Föreslaget ärende'}
                            {g.matchSource === 'manual' && <Badge variant="outline">manuellt</Badge>}
                            {g.matchSource === 'name' && <Badge variant="outline">namn</Badge>}
                          </AlertTitle>
                          <AlertDescription>
                            <div className="text-sm">
                              <div><b>{g.effectiveCase.address}</b></div>
                              <div className="text-muted-foreground">
                                {g.effectiveCase.customer_name}
                                {g.matchSource === 'name' && g.nameCandidates[0]?.reason
                                  ? ` · ${g.nameCandidates[0].reason}`
                                  : ''}
                              </div>
                            </div>
                            {g.matchSource === 'name' && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Ordernumret {g.order_number} hittades inte i systemet. Bekräfta att detta är rätt ärende.
                              </p>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2"
                              onClick={() => setGroupChoices(prev => ({ ...prev, [g.order_number]: null }))}
                            >
                              Ändra val
                            </Button>
                          </AlertDescription>
                        </Alert>
                      ) : g.nameCandidates.length > 0 ? (
                        <Alert>
                          <Search className="h-4 w-4" />
                          <AlertTitle>Förslag baserat på kundnamn</AlertTitle>
                          <AlertDescription>
                            <p className="text-xs text-muted-foreground mb-2">
                              Ordernumret {g.order_number} hittades inte. Möjliga ärenden för "{g.groupCustomerName || '—'}":
                            </p>
                            <div className="border rounded-md divide-y">
                              {g.nameCandidates.map(cand => (
                                <button
                                  key={cand.case.id}
                                  type="button"
                                  onClick={() => setGroupChoices(prev => ({ ...prev, [g.order_number]: cand.case }))}
                                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                                >
                                  <div className="font-medium">{cand.case.address}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {cand.case.customer_name} · {cand.reason}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>Inget ärende kunde matchas</AlertTitle>
                          <AlertDescription>
                            Varken ordernummer {g.order_number} eller kundnamn{g.groupCustomerName ? ` "${g.groupCustomerName}"` : ''} matchade. Sök manuellt nedan.
                          </AlertDescription>
                        </Alert>
                      )}

                      {showSearch && (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1 text-xs">
                            <Search className="h-3 w-3" /> Sök ärende manuellt
                          </Label>
                          <Input
                            placeholder="Sök adress, kund, offert- eller ordernummer…"
                            value={groupSearch[g.order_number] ?? ''}
                            onChange={(e) => setGroupSearch(prev => ({ ...prev, [g.order_number]: e.target.value }))}
                          />
                          {results.length > 0 && (
                            <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                              {results.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setGroupChoices(prev => ({ ...prev, [g.order_number]: c }));
                                    setGroupSearch(prev => ({ ...prev, [g.order_number]: '' }));
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                                >
                                  <div className="font-medium">{c.address}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {c.customer_name}
                                    {(c as any).order_number ? ` · order ${(c as any).order_number}` : ''}
                                    {c.offer_number ? ` · offert ${c.offer_number}` : ''}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <Collapsible>
                        <CollapsibleTrigger className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
                          <ChevronDown className="h-3 w-3" /> Visa rader ({g.lines.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border rounded-md divide-y mt-2">
                            {g.lines.map((li, i) => (
                              <div key={i} className="p-2 text-xs flex justify-between gap-2">
                                <div className="flex-1">
                                  <div className="font-medium">{li.name || '—'}</div>
                                  {li.note && <div className="text-muted-foreground">{li.note}</div>}
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  {li.qty != null && <span className="text-muted-foreground">{li.qty} st · </span>}
                                  {(Number(li.amount) || 0).toLocaleString('sv-SE')} kr
                                </div>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                );
              })}

              {unassignedLines.length > 0 && (
                <Card className="border-l-4 border-l-destructive/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-destructive">
                      Rader utan ordernummer ({unassignedLines.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">
                      Tilldela varje rad ett ordernummer (eller skriv ett nytt) för att inkludera den.
                    </p>
                    <div className="border rounded-md divide-y">
                      {unassignedLines.map(li => {
                        const idx = lineItems.indexOf(li);
                        return (
                          <div key={idx} className="p-2 flex flex-wrap items-center gap-2 text-sm">
                            <div className="flex-1 min-w-[180px]">
                              <div className="font-medium">{li.name || '—'}</div>
                              {li.note && <div className="text-xs text-muted-foreground">{li.note}</div>}
                            </div>
                            <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                              {(Number(li.amount) || 0).toLocaleString('sv-SE')} kr
                            </div>
                            <Input
                              className="w-32"
                              placeholder="Ordernr"
                              value={li.order_number ?? ''}
                              onChange={(e) => assignLineToOrder(idx, e.target.value)}
                            />
                            {distinctOrderNumbers.length > 0 && (
                              <select
                                className="h-9 rounded-md border bg-background px-2 text-xs"
                                value=""
                                onChange={(e) => { if (e.target.value) assignLineToOrder(idx, e.target.value); }}
                              >
                                <option value="">Tilldela grupp…</option>
                                {distinctOrderNumbers.map(on => (
                                  <option key={on} value={on}>{on}</option>
                                ))}
                              </select>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="text-xs text-muted-foreground text-right">
                Summa delsummor: <span className="font-medium text-foreground">{groupedSubtotalSum.toLocaleString('sv-SE')} kr</span>
                {totalNum > 0 && <> av {totalNum.toLocaleString('sv-SE')} kr</>}
              </div>
            </div>
          )}

          {/* SINGLE-LÄGE: rader + match */}
          {!isMulti && (lineItems.length > 0 || extracted) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Rader ({lineItems.length})</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Lägg till rad
                </Button>
              </div>
              {sumMismatch && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Radsumman stämmer inte med totalen</AlertTitle>
                  <AlertDescription>
                    Summan av raderna är {lineSum.toLocaleString('sv-SE')} kr men totalbelopp är {totalNum.toLocaleString('sv-SE')} kr. Kontrollera.
                  </AlertDescription>
                </Alert>
              )}
              {lineItems.length > 0 && (
                <div className="border rounded-md divide-y">
                  {lineItems.map((li, idx) => (
                    <div key={idx} className="p-2 space-y-2">
                      <div className="grid grid-cols-12 gap-2">
                        <Input
                          className="col-span-3"
                          placeholder="Ordernr"
                          value={li.order_number ?? ''}
                          onChange={(e) => updateLine(idx, { order_number: e.target.value || null })}
                        />
                        <Input
                          className="col-span-5"
                          placeholder="Benämning"
                          value={li.name ?? ''}
                          onChange={(e) => updateLine(idx, { name: e.target.value || null })}
                        />
                        <Input
                          className="col-span-1"
                          placeholder="Antal"
                          type="number"
                          value={li.qty ?? ''}
                          onChange={(e) => updateLine(idx, { qty: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                        <Input
                          className="col-span-2"
                          placeholder="Belopp"
                          type="number"
                          value={li.amount ?? ''}
                          onChange={(e) => updateLine(idx, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="col-span-1"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                      {(li.note || li.unit_price != null) && (
                        <div className="text-xs text-muted-foreground pl-1">
                          {li.unit_price != null && <>à {Number(li.unit_price).toLocaleString('sv-SE')} kr · </>}
                          {li.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {lineItems.length > 0 && (
                <div className="text-xs text-muted-foreground text-right">
                  Radsumma: <span className="font-medium text-foreground">{lineSum.toLocaleString('sv-SE')} kr</span>
                </div>
              )}
            </div>
          )}

          {!isMulti && (orderNumber.trim() || extracted) && !chosenCase && (
            orderMatch ? (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertTitle>Matchat ärende (ordernummer)</AlertTitle>
                <AlertDescription>
                  <div className="text-sm">
                    <div><b>{orderMatch.address}</b></div>
                    <div className="text-muted-foreground">{orderMatch.customer_name}</div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : strongNameMatch ? (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  Föreslaget ärende <Badge variant="outline">namn</Badge>
                </AlertTitle>
                <AlertDescription>
                  <div className="text-sm">
                    <div><b>{strongNameMatch.address}</b></div>
                    <div className="text-muted-foreground">
                      {strongNameMatch.customer_name}
                      {nameCandidates[0]?.reason ? ` · ${nameCandidates[0].reason}` : ''}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ordernumret {orderNumber} hittades inte. Bekräfta att detta är rätt ärende, eller välj ett annat nedan.
                  </p>
                </AlertDescription>
              </Alert>
            ) : nameCandidates.length > 0 ? (
              <Alert>
                <Search className="h-4 w-4" />
                <AlertTitle>Förslag baserat på kundnamn</AlertTitle>
                <AlertDescription>
                  <p className="text-xs text-muted-foreground mb-2">
                    Ordernumret {orderNumber} hittades inte. Möjliga ärenden för "{customerName || '—'}":
                  </p>
                  <div className="border rounded-md divide-y">
                    {nameCandidates.map(cand => (
                      <button
                        key={cand.case.id}
                        type="button"
                        onClick={() => setChosenCase(cand.case)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      >
                        <div className="font-medium">{cand.case.address}</div>
                        <div className="text-xs text-muted-foreground">
                          {cand.case.customer_name} · {cand.reason}
                        </div>
                      </button>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {orderNumber.trim()
                    ? `Inget ärende med ordernummer ${orderNumber}`
                    : 'Inget ärende kunde matchas automatiskt'}
                </AlertTitle>
                <AlertDescription>Sök och välj ärende manuellt nedan.</AlertDescription>
              </Alert>
            )
          )}

          {!isMulti && (!orderMatch || chosenCase) && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Search className="h-3.5 w-3.5" /> Sök ärende manuellt</Label>
              <Input
                placeholder="Sök adress, kund, offert- eller ordernummer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {filteredCases.length > 0 && (
                <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                  {filteredCases.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setChosenCase(c); setSearch(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                    >
                      <div className="font-medium">{c.address}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.customer_name}
                        {(c as any).order_number ? ` · order ${(c as any).order_number}` : ''}
                        {c.offer_number ? ` · offert ${c.offer_number}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isMulti && chosenCase && (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                Valt ärende
                <Badge variant="outline">manuellt</Badge>
              </AlertTitle>
              <AlertDescription>
                <div className="text-sm">
                  <div><b>{chosenCase.address}</b></div>
                  <div className="text-muted-foreground">{chosenCase.customer_name}</div>
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setChosenCase(null)}>
                  Ändra val
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={reset} disabled={submitting}>Rensa</Button>
            <Button onClick={handleSubmit} disabled={submitDisabled}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {isMulti ? `Bekräfta & koppla till ${groups.length} ärenden` : 'Bekräfta & koppla'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
