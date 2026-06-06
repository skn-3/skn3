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
import { Upload, FileText, Search, Check, Loader2, AlertTriangle } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';

interface PayoutUploadViewProps {
  currentUser: string;
}

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export function PayoutUploadView({ currentUser }: PayoutUploadViewProps) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [search, setSearch] = useState('');
  const [chosenCase, setChosenCase] = useState<CaseRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const reset = () => {
    setFile(null);
    setOrderNumber('');
    setInvoiceNumber('');
    setCustomerName('');
    setInvoiceDate('');
    setTotalAmount('');
    setSearch('');
    setChosenCase(null);
  };

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
    <div className="px-3 md:px-0 max-w-3xl mx-auto space-y-4">
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
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <FileText className="h-3 w-3" /> {file.name}
              </div>
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
            <Button onClick={handleSubmit} disabled={submitting || !file || !effectiveCase}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Bekräfta & koppla
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
