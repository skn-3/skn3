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
  job_address?: string | null;
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


type DocType = 'mockfjards_payout' | 'a_order' | 'sheet_metal_invoice' | 'montor_invoice';

// ---- Adressmatchning (för plåtfakturor) -----------------------------------
const stripDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const addrNorm = (s: any) => stripDiacritics(String(s ?? '').toLowerCase().trim());

type ParsedAddr = { street: string; number: string; city: string };
function parseAddress(raw: any): ParsedAddr {
  const s = addrNorm(raw);
  if (!s) return { street: '', number: '', city: '' };
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const head = parts[0] || '';
  let city = '';
  if (parts.length > 1) {
    city = parts.slice(1).join(' ').replace(/\b\d{3}\s?\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  } else {
    const m = s.match(/^(.*?)(\d{3}\s?\d{2})\s+(.+)$/);
    if (m) city = m[3].trim();
  }
  const numMatch = head.match(/(\d+)\s*([a-z])?\b/);
  const number = numMatch ? (numMatch[1] + (numMatch[2] || '')) : '';
  const street = (numMatch ? head.slice(0, numMatch.index).trim() : head)
    .replace(/[^a-z0-9åäö\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { street, number, city };
}
function streetNameMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}
type AddrCandidate = { case: CaseRow; score: number; reason: string };
function addressCandidates(allCases: CaseRow[], rawAddr: string | null): AddrCandidate[] {
  const a = parseAddress(rawAddr);
  if (!a.street || !a.number) return [];
  const out: AddrCandidate[] = [];
  for (const c of allCases) {
    const b = parseAddress(c.address);
    if (!b.street || !b.number) continue;
    if (a.number !== b.number) continue;
    if (!streetNameMatch(a.street, b.street)) continue;
    const sameCity = !!(a.city && b.city && (a.city === b.city || a.city.includes(b.city) || b.city.includes(a.city)));
    out.push({
      case: c,
      score: 100 + (sameCity ? 10 : 0),
      reason: sameCity ? 'gata + nr + ort' : 'gata + nr',
    });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, 5);
}

export function PayoutUploadView({ currentUser }: PayoutUploadViewProps) {
  const qc = useQueryClient();
  const [docType, setDocType] = useState<DocType>('mockfjards_payout');
  const [file, setFile] = useState<File | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [totalAmountIncl, setTotalAmountIncl] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');
  const [chosenCase, setChosenCase] = useState<CaseRow | null>(null);
  // Multi-mode: per-order-number manually chosen case override
  const [groupChoices, setGroupChoices] = useState<Record<string, CaseRow | null>>({});
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  // For montor_invoice: per-line manual case assignment (when address can't auto-match)
  const [lineCaseChoices, setLineCaseChoices] = useState<Record<number, CaseRow | null>>({});
  const [lineSearch, setLineSearch] = useState<Record<number, string>>({});
  // For montor_invoice: addresses (group keys) the user has explicitly skipped
  const [skippedGroups, setSkippedGroups] = useState<Set<string>>(new Set());
  const isSkipped = (key: string) => skippedGroups.has(key);
  const toggleSkip = (key: string, next: boolean) => {
    setSkippedGroups(prev => {
      const s = new Set(prev);
      if (next) s.add(key); else s.delete(key);
      return s;
    });
  };
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const isSheet = docType === 'sheet_metal_invoice';
  const isMontorInvoice = docType === 'montor_invoice';
  const isCost = docType === 'a_order' || isSheet || isMontorInvoice;
  const typeLabel =
    isMontorInvoice ? 'Montörsfaktura (utgift, extra)'
    : docType === 'sheet_metal_invoice' ? 'Plåtfaktura (utgift)'
    : docType === 'a_order' ? 'Egen faktura / A-order (utgift)'
    : 'Mockfjärds-utbetalning (intäkt)';
  const shortLabel = isMontorInvoice ? 'Montörsfaktura'
    : isSheet ? 'Plåtfaktura'
    : (docType === 'a_order' ? 'Faktura/A-order' : 'Utbetalning');

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

  const isMulti = isMontorInvoice || (!isSheet && distinctOrderNumbers.length > 1);

  // Single-mode auto-match by order_number (not used for sheet metal)
  const orderMatch = useMemo(() => {
    if (isSheet) return null;
    const q = orderNumber.trim();
    if (!q) return null;
    return (cases as any[]).find(c => norm(c.order_number) === q) || null;
  }, [orderNumber, cases, isSheet]);

  // Namnkandidater (fallback i single-läge)
  const nameCandidates = useMemo<Candidate[]>(() => {
    if (isSheet || orderMatch) return [];
    return findNameMatches(cases as CaseRow[], customerName, null, 5);
  }, [orderMatch, cases, customerName, isSheet]);

  const strongNameMatch = nameCandidates[0] && nameCandidates[0].score >= 90 ? nameCandidates[0].case : null;

  // Adress-kandidater (plåtfaktura)
  const addressMatches = useMemo<AddrCandidate[]>(() => {
    if (!isSheet) return [];
    return addressCandidates(cases as CaseRow[], jobAddress || null);
  }, [isSheet, jobAddress, cases]);
  const strongAddrMatch = addressMatches[0]?.case || null;

  const effectiveCase = chosenCase || orderMatch || strongNameMatch || strongAddrMatch;

  // Multi-mode groups
  type Group = {
    order_number: string; // for montor_invoice: display address; for others: order number
    keyKind: 'order' | 'address' | 'manual';
    lines: LineItem[];
    lineIndices: number[]; // indices into lineItems (used in montor_invoice unassigned flow)
    subtotal: number;
    groupCustomerName: string | null;
    groupAddress: string | null; // displayed address (montor_invoice)
    autoCase: CaseRow | null;
    nameCandidates: Candidate[];
    addrCandidates: AddrCandidate[];
    effectiveCase: CaseRow | null;
    matchSource: 'order' | 'name' | 'address' | 'manual' | null;
  };

  // Helper: address key for a montor_invoice line (empty => unassigned)
  const lineAddrKey = (li: LineItem): string => {
    const p = parseAddress(li.job_address);
    if (!p.street || !p.number) return '';
    return `${p.street}#${p.number}`;
  };

  const groups: Group[] = useMemo(() => {
    if (isMontorInvoice) {
      // Address-keyed groups
      const keyMap = new Map<string, { addr: string; indices: number[]; lines: LineItem[] }>();
      lineItems.forEach((li, idx) => {
        const key = lineAddrKey(li);
        if (!key) return; // unassigned -> handled separately
        const existing = keyMap.get(key);
        if (existing) {
          existing.indices.push(idx);
          existing.lines.push(li);
        } else {
          keyMap.set(key, { addr: (li.job_address || '').trim(), indices: [idx], lines: [li] });
        }
      });
      const addrGroups: Group[] = Array.from(keyMap.entries()).map(([key, v]) => {
        const subtotal = v.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const candidates = addressCandidates(cases as CaseRow[], v.addr);
        const auto = candidates[0]?.case || null;
        const override = groupChoices[key] ?? null;
        const effective = override || auto;
        const matchSource: Group['matchSource'] = override ? 'manual' : (auto ? 'address' : null);
        return {
          order_number: v.addr || key,
          keyKind: 'address',
          lines: v.lines,
          lineIndices: v.indices,
          subtotal,
          groupCustomerName: null,
          groupAddress: v.addr || null,
          autoCase: auto,
          nameCandidates: [],
          addrCandidates: candidates,
          effectiveCase: effective,
          matchSource,
        };
      });

      // Synthetic manual groups from unassigned lines that user mapped to a case
      const manualMap = new Map<string, { case: CaseRow; indices: number[]; lines: LineItem[] }>();
      lineItems.forEach((li, idx) => {
        if (lineAddrKey(li)) return; // not unassigned
        const c = lineCaseChoices[idx];
        if (!c) return;
        const k = `manual:${c.id}`;
        const ex = manualMap.get(k);
        if (ex) { ex.indices.push(idx); ex.lines.push(li); }
        else manualMap.set(k, { case: c, indices: [idx], lines: [li] });
      });
      const manualGroups: Group[] = Array.from(manualMap.entries()).map(([k, v]) => ({
        order_number: v.case.address || k,
        keyKind: 'manual',
        lines: v.lines,
        lineIndices: v.indices,
        subtotal: v.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
        groupCustomerName: v.case.customer_name || null,
        groupAddress: v.case.address || null,
        autoCase: v.case,
        nameCandidates: [],
        addrCandidates: [],
        effectiveCase: v.case,
        matchSource: 'manual',
      }));
      return [...addrGroups, ...manualGroups];
    }

    return distinctOrderNumbers.map(on => {
      const lines = lineItems.filter(li => norm(li.order_number) === on);
      const lineIndices = lineItems.map((li, i) => norm(li.order_number) === on ? i : -1).filter(i => i >= 0);
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
        keyKind: 'order',
        lines,
        lineIndices,
        subtotal,
        groupCustomerName,
        groupAddress: null,
        autoCase,
        nameCandidates: candidates,
        addrCandidates: [],
        effectiveCase: effective,
        matchSource,
      };
    });
  }, [isMontorInvoice, distinctOrderNumbers, lineItems, cases, groupChoices, lineCaseChoices]);

  const unassignedLines = useMemo(
    () => {
      if (isMontorInvoice) {
        return lineItems.filter((li, idx) => {
          const k = lineAddrKey(li);
          if (k) {
            // line belongs to an address group — skipped groups are NOT unassigned
            return isSkipped(k) ? false : false; // address-keyed lines never "unassigned" (group handles it)
          }
          return !lineCaseChoices[idx];
        });
      }
      return lineItems.filter(li => !norm(li.order_number));
    },
    [lineItems, isMontorInvoice, lineCaseChoices, skippedGroups],
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
    setJobAddress('');
    setInvoiceDate('');
    setTotalAmount('');
    setTotalAmountIncl('');
    setLineItems([]);
    setSearch('');
    setChosenCase(null);
    setGroupChoices({});
    setGroupSearch({});
    setLineCaseChoices({});
    setLineSearch({});
    setSkippedGroups(new Set());
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

      const excl = data.total_amount_excl_vat;
      const incl = data.total_amount_incl_vat;
      const preferred = isSheet
        ? (excl ?? data.total_amount ?? null)
        : (data.total_amount ?? excl ?? null);

      setOrderNumber(prev => prev || (firstOrder ?? ''));
      setInvoiceNumber(prev => prev || (data.invoice_number ?? ''));
      setCustomerName(prev => prev || (data.customer_name ?? ''));
      setJobAddress(prev => prev || (data.job_address ?? ''));
      setInvoiceDate(prev => prev || (data.invoice_date ?? ''));
      setTotalAmount(prev => prev || (preferred != null ? String(preferred) : ''));
      setTotalAmountIncl(prev => prev || (incl != null ? String(incl) : ''));
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
    if (!isSheet && !orderNumber.trim()) { toast.error('Ange ordernummer'); return; }
    if (!invoiceNumber.trim()) { toast.error('Ange fakturanummer'); return; }
    if (!totalAmount.trim() || isNaN(Number(totalAmount))) { toast.error('Ange totalbelopp'); return; }
    if (!effectiveCase) { toast.error('Välj ett ärende att koppla till'); return; }

    setSubmitting(true);
    try {
      const caseId = effectiveCase.id;
      const safe = sanitizeFileName(file.name);
      const folder = isSheet ? 'sheet-invoices' : 'payouts';
      const path = `${caseId}/${folder}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from('case-documents')
        .upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;

      const amountNum = Number(totalAmount);
      const inclNum = totalAmountIncl.trim() && !isNaN(Number(totalAmountIncl)) ? Number(totalAmountIncl) : null;
      const sheetLine = isSheet
        ? [{ order_number: null, customer_name: null, name: 'Plåt (ex moms)', note: inclNum != null ? `Total inkl moms: ${inclNum} kr` : (jobAddress ? `Jobbadress: ${jobAddress}` : null), qty: null, unit_price: null, amount: amountNum }]
        : null;
      const { error: insErr } = await (supabase as any).from('case_documents').insert({
        case_id: caseId,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
        order_number: isSheet ? (jobAddress || null) : orderNumber.trim(),
        invoice_number: invoiceNumber.trim(),
        customer_name: customerName.trim() || null,
        invoice_date: invoiceDate || null,
        total_amount: amountNum,
        currency: 'SEK',
        line_items: lineItems.length > 0 ? lineItems : sheetLine,
        uploaded_by: currentUser,
      });
      if (insErr) throw insErr;

      if (!isSheet && !norm((effectiveCase as any).order_number)) {
        try { await updateCase(caseId, { order_number: orderNumber.trim() } as any); } catch (e) { console.warn(e); }
      }

      const eventDesc = isSheet
        ? `Plåtfaktura kopplad: faktura ${invoiceNumber.trim()}, kostnad (ex moms) ${amountNum.toLocaleString('sv-SE')} kr`
        : isCost
        ? `Egen faktura/A-order kopplad: faktura ${invoiceNumber.trim()}, kostnad ${amountNum.toLocaleString('sv-SE')} kr`
        : `Mockfjärds-utbetalning kopplad: faktura ${invoiceNumber.trim()}, belopp ${amountNum.toLocaleString('sv-SE')} kr`;
      await createCaseEvent({
        case_id: caseId,
        event_type: 'note',
        description: eventDesc,
        created_by: currentUser,
      });

      logActivity({
        action: isSheet ? 'sheet_invoice_uploaded' : (isCost ? 'cost_doc_uploaded' : 'payout_uploaded'),
        category: 'case',
        description: `Laddade upp ${shortLabel.toLowerCase()} (faktura ${invoiceNumber.trim()}) för ${effectiveCase.address}`,
        case_id: caseId,
        metadata: { doc_type: docType, invoice_number: invoiceNumber.trim(), total_amount: amountNum, order_number: isSheet ? null : orderNumber.trim(), job_address: isSheet ? jobAddress || null : null },
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
      toast.error(isMontorInvoice
        ? 'Koppla alla rader utan automatisk adressmatch till ett ärende'
        : 'Tilldela alla rader till ett ordernummer först');
      return;
    }
    if (isMontorInvoice) {
      const activeUnmatched = groups.filter(g => !g.effectiveCase && !isSkipped(g.order_number));
      if (activeUnmatched.length > 0) {
        toast.error(`Koppla eller hoppa över: ${activeUnmatched.map(g => g.order_number).join(', ')}`);
        return;
      }
    } else {
      const missing = groups.filter(g => !g.effectiveCase);
      if (missing.length > 0) {
        toast.error(`Koppla ärende för: ${missing.map(g => g.order_number).join(', ')}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Upload file ONCE; reuse same path for all rows
      const safe = sanitizeFileName(file.name);
      const folder = isMontorInvoice ? 'montor-invoices' : 'shared-payouts';
      const path = `${folder}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from('case-documents')
        .upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
      if (upErr) throw upErr;

      const inv = invoiceNumber.trim();

      const groupsToInsert = isMontorInvoice
        ? groups.filter(g => g.effectiveCase && !isSkipped(g.order_number))
        : groups;
      const skippedList = isMontorInvoice
        ? groups.filter(g => isSkipped(g.order_number))
        : [];

      for (const g of groupsToInsert) {
        const c = g.effectiveCase!;
        const caseId = c.id;
        const { error: insErr } = await (supabase as any).from('case_documents').insert({
          case_id: caseId,
          doc_type: docType,
          file_path: path,
          file_name: file.name,
          order_number: g.order_number,
          invoice_number: inv,
          customer_name: isMontorInvoice ? null : (customerName.trim() || null),
          invoice_date: invoiceDate || null,
          total_amount: g.subtotal,
          currency: 'SEK',
          line_items: g.lines,
          uploaded_by: currentUser,
        });
        if (insErr) throw insErr;

        // Only update case.order_number for n3prenad-orders (not montor_invoice/sheet — those are addresses)
        if (!isMontorInvoice && !norm((c as any).order_number)) {
          try { await updateCase(caseId, { order_number: g.order_number } as any); } catch (e) { console.warn(e); }
        }

        const eventDesc = isMontorInvoice
          ? `Laddade upp montörsfaktura (del av faktura ${inv}) för ${g.order_number}, kostnad ${g.subtotal.toLocaleString('sv-SE')} kr ex moms`
          : isCost
          ? `Egen faktura/A-order kopplad (del av faktura ${inv}): kostnad ${g.subtotal.toLocaleString('sv-SE')} kr`
          : `Mockfjärds-utbetalning kopplad (del av faktura ${inv}): belopp ${g.subtotal.toLocaleString('sv-SE')} kr`;
        await createCaseEvent({
          case_id: caseId,
          event_type: 'note',
          description: eventDesc,
          created_by: currentUser,
        });

        logActivity({
          action: isMontorInvoice ? 'montor_invoice_uploaded' : (isCost ? 'cost_doc_uploaded' : 'payout_uploaded'),
          category: 'case',
          description: isMontorInvoice
            ? `Laddade upp montörsfaktura (del av faktura ${inv}) för ${g.order_number}, kostnad ${g.subtotal.toLocaleString('sv-SE')} kr ex moms`
            : `Laddade upp ${shortLabel.toLowerCase()} (del av faktura ${inv}) för ${c.address}`,
          case_id: caseId,
          metadata: { doc_type: docType, invoice_number: inv, total_amount: g.subtotal, address: g.order_number, multi: true, groups: groups.length },
        });

        qc.invalidateQueries({ queryKey: ['case-documents', caseId] });
      }

      qc.invalidateQueries({ queryKey: ['cases-all'] });
      if (isMontorInvoice && skippedList.length > 0) {
        try {
          await logActivity({
            action: 'montor_invoice_partial_skip',
            category: 'case',
            description: `Montörsfaktura ${inv}: ${skippedList.length} adress${skippedList.length === 1 ? '' : 'er'} hoppades över (${skippedList.map(g => g.order_number).join(', ')})`,
            metadata: { invoice_number: inv, skipped_addresses: skippedList.map(g => g.order_number), skipped_total: skippedList.reduce((s, g) => s + g.subtotal, 0) },
          });
        } catch (e) { console.warn(e); }
        toast.success(`Faktura kopplad till ${groupsToInsert.length} ärenden (${skippedList.length} hoppades över)`);
      } else {
        toast.success(`Faktura kopplad till ${groupsToInsert.length} ärenden`);
      }
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(`Misslyckades: ${e?.message ?? 'okänt fel'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => (isMulti ? handleSubmitMulti() : handleSubmitSingle());

  const matchedActiveGroups = isMontorInvoice
    ? groups.filter(g => g.effectiveCase && !isSkipped(g.order_number))
    : groups.filter(g => g.effectiveCase);
  const unresolvedGroups = isMontorInvoice
    ? groups.filter(g => !g.effectiveCase && !isSkipped(g.order_number))
    : groups.filter(g => !g.effectiveCase);

  const submitDisabled =
    submitting ||
    !file ||
    extracting ||
    (isMulti
      ? (isMontorInvoice
          ? groups.length === 0 || unassignedLines.length > 0 || matchedActiveGroups.length === 0 || unresolvedGroups.length > 0
          : groups.length === 0 || unassignedLines.length > 0 || groups.some(g => !g.effectiveCase))
      : !effectiveCase);

  return (
    <div className="px-3 md:px-0 max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Ladda upp faktura/utbetalning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Dokumenttyp</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-1">
              {([
                { v: 'mockfjards_payout' as DocType, label: 'Mockfjärds-utbetalning', sub: 'intäkt' },
                { v: 'a_order' as DocType, label: 'Egen faktura / A-order', sub: 'utgift' },
                { v: 'sheet_metal_invoice' as DocType, label: 'Plåtfaktura', sub: 'utgift (matchas på adress)' },
                { v: 'montor_invoice' as DocType, label: 'Montörsfaktura', sub: 'utgift, extra — matchas på adress per rad' },
              ]).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setDocType(opt.v)}
                  className={`text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                    docType === opt.v ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
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

          {/* Faktura-fält (ordernummer döljs i multi-läge och för plåtfaktura) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!isMulti && !isSheet && (
              <div>
                <Label>Ordernummer *</Label>
                <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="t.ex. 12345" />
              </div>
            )}
            {isSheet && (
              <div className="md:col-span-2">
                <Label>Jobbadress (från "Ert ordernummer") *</Label>
                <Input value={jobAddress} onChange={(e) => setJobAddress(e.target.value)} placeholder="t.ex. Norregölesvägen 40" />
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
              <Label>{isSheet ? 'Belopp ex moms (kostnad) *' : isMontorInvoice ? 'Totalbelopp ex moms (referens)' : `Totalbelopp (SEK) ${isMulti ? '' : '*'}`}</Label>
              <Input type="number" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </div>
            {isSheet && (
              <div>
                <Label>Total inkl moms (referens)</Label>
                <Input type="number" inputMode="decimal" value={totalAmountIncl} onChange={(e) => setTotalAmountIncl(e.target.value)} />
              </div>
            )}
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

              {multiSumMismatch && !isMontorInvoice && (
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
                          {g.keyKind === 'address' ? 'Adress' : g.keyKind === 'manual' ? 'Manuellt vald' : 'Order'} {g.order_number}
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
                            {g.matchSource === 'address' && 'Matchat ärende (adress)'}
                            {g.matchSource === 'manual' && <Badge variant="outline">manuellt</Badge>}
                            {g.matchSource === 'name' && <Badge variant="outline">namn</Badge>}
                            {g.matchSource === 'address' && <Badge variant="outline">{g.addrCandidates[0]?.reason || 'adress'}</Badge>}
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
                            {g.keyKind === 'address'
                              ? <>Adress "{g.order_number}" matchade inget ärende. Sök manuellt nedan.</>
                              : <>Varken ordernummer {g.order_number} eller kundnamn{g.groupCustomerName ? ` "${g.groupCustomerName}"` : ''} matchade. Sök manuellt nedan.</>}
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
                      {isMontorInvoice
                        ? `Rader utan matchat ärende (${unassignedLines.length})`
                        : `Rader utan ordernummer (${unassignedLines.length})`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">
                      {isMontorInvoice
                        ? 'Adressen kunde inte matchas automatiskt (saknar husnummer eller adress). Sök och välj ärende för varje rad.'
                        : 'Tilldela varje rad ett ordernummer (eller skriv ett nytt) för att inkludera den.'}
                    </p>
                    <div className="border rounded-md divide-y">
                      {unassignedLines.map(li => {
                        const idx = lineItems.indexOf(li);
                        if (isMontorInvoice) {
                          const q = (lineSearch[idx] ?? '').trim().toLowerCase();
                          const results = q
                            ? (cases as CaseRow[]).filter(c =>
                                (c.customer_name || '').toLowerCase().includes(q) ||
                                (c.address || '').toLowerCase().includes(q) ||
                                (c.offer_number || '').toLowerCase().includes(q) ||
                                ((c as any).order_number || '').toLowerCase().includes(q)
                              ).slice(0, 8)
                            : [];
                          return (
                            <div key={idx} className="p-2 space-y-2 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium">{li.name || '—'}</div>
                                  {(li.job_address || li.note) && (
                                    <div className="text-xs text-muted-foreground">
                                      {li.job_address && <>adress: {li.job_address} · </>}
                                      {li.note}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                                  {(Number(li.amount) || 0).toLocaleString('sv-SE')} kr
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}>
                                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </div>
                              <Input
                                placeholder="Sök adress, kund eller offert/ordernr…"
                                value={lineSearch[idx] ?? ''}
                                onChange={(e) => setLineSearch(prev => ({ ...prev, [idx]: e.target.value }))}
                              />
                              {results.length > 0 && (
                                <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                                  {results.map(c => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => {
                                        setLineCaseChoices(prev => ({ ...prev, [idx]: c }));
                                        setLineSearch(prev => ({ ...prev, [idx]: '' }));
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                                    >
                                      <div className="font-medium">{c.address}</div>
                                      <div className="text-xs text-muted-foreground">{c.customer_name}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
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

          {isSheet && (jobAddress.trim() || extracted) && !chosenCase && (
            strongAddrMatch ? (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  Matchat ärende <Badge variant="outline">adress</Badge>
                </AlertTitle>
                <AlertDescription>
                  <div className="text-sm">
                    <div><b>{strongAddrMatch.address}</b></div>
                    <div className="text-muted-foreground">
                      {strongAddrMatch.customer_name}
                      {addressMatches[0]?.reason ? ` · ${addressMatches[0].reason}` : ''}
                    </div>
                  </div>
                  {addressMatches.length > 1 && (
                    <div className="text-xs text-muted-foreground mt-2">
                      {addressMatches.length - 1} fler adressmatchning(ar) — välj manuellt nedan om fel.
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Inget ärende med adress "{jobAddress || '—'}"</AlertTitle>
                <AlertDescription>Sök och välj ärende manuellt nedan.</AlertDescription>
              </Alert>
            )
          )}

          {!isMulti && !isSheet && (orderNumber.trim() || extracted) && !chosenCase && (
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
