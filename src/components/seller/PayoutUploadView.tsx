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
import { toast } from 'sonner';
import { Upload, FileText, Search, Check, Loader2, AlertTriangle, Sparkles, Trash2, Plus } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';

interface PayoutUploadViewProps {
  currentUser: string;
}

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

type LineItem = {
  order_number: string | null;
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

export function PayoutUploadView({ currentUser }: PayoutUploadViewProps) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');
  const [chosenCase, setChosenCase] = useState<CaseRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);

  const { data: cases = [] } = useQuery({ queryKey: ['cases-all'], queryFn: fetchAllCases });

  // Auto-match by order_number
  const orderMatch = useMemo(() => {
    const q = orderNumber.trim();
    if (!q) return null;
    return (cases as any[]).find(c => (c.order_number || '').trim() === q) || null;
  }, [orderNumber, cases]);

  const effectiveCase = chosenCase || orderMatch;

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

  const lineSum = useMemo(
    () => lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0),
    [lineItems],
  );
  const totalNum = Number(totalAmount) || 0;
  const sumMismatch = lineItems.length > 0 && totalNum > 0 && Math.abs(lineSum - totalNum) > 0.5;

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

      // Prefill — never silently overwrite if user already entered values; replace if empty.
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
    if (f) {
      runExtract(f);
    }
  };

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLineItems(items => items.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };
  const removeLine = (idx: number) => setLineItems(items => items.filter((_, i) => i !== idx));
  const addLine = () => setLineItems(items => [
    ...items,
    { order_number: orderNumber || null, name: '', note: null, qty: null, unit_price: null, amount: null },
  ]);

  const handleSubmit = async () => {
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
        doc_type: 'mockfjards_payout',
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

      // Fyll ärendets order_number om saknas
      if (!((effectiveCase as any).order_number || '').trim()) {
        try {
          await updateCase(caseId, { order_number: orderNumber.trim() } as any);
        } catch (e) {
          console.warn('Could not set case.order_number:', e);
        }
      }

      await createCaseEvent({
        case_id: caseId,
        event_type: 'note',
        description: `Mockfjärds-utbetalning kopplad: faktura ${invoiceNumber.trim()}, belopp ${amountNum.toLocaleString('sv-SE')} kr`,
        created_by: currentUser,
      });

      logActivity({
        action: 'payout_uploaded',
        category: 'case',
        description: `Laddade upp utbetalning (faktura ${invoiceNumber.trim()}) för ${effectiveCase.address}`,
        case_id: caseId,
        metadata: { invoice_number: invoiceNumber.trim(), total_amount: amountNum, order_number: orderNumber.trim() },
      });

      qc.invalidateQueries({ queryKey: ['case-documents', caseId] });
      qc.invalidateQueries({ queryKey: ['cases-all'] });
      toast.success('Utbetalning kopplad till ärendet');
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(`Misslyckades: ${e?.message ?? 'okänt fel'}`);
    } finally {
      setSubmitting(false);
    }
  };

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Ordernummer *</Label>
              <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="t.ex. 12345" />
            </div>
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
              <Label>Totalbelopp (SEK) *</Label>
              <Input type="number" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          {(lineItems.length > 0 || extracted) && (
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

          {/* Match */}
          {orderNumber.trim() && !chosenCase && (
            orderMatch ? (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertTitle>Matchat ärende</AlertTitle>
                <AlertDescription>
                  <div className="text-sm">
                    <div><b>{orderMatch.address}</b></div>
                    <div className="text-muted-foreground">{orderMatch.customer_name}</div>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Inget ärende med ordernummer {orderNumber}</AlertTitle>
                <AlertDescription>Sök och välj ärende manuellt nedan.</AlertDescription>
              </Alert>
            )
          )}

          {(!orderMatch || chosenCase) && (
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

          {chosenCase && (
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
            <Button onClick={handleSubmit} disabled={submitting || !file || !effectiveCase || extracting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Bekräfta & koppla
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
