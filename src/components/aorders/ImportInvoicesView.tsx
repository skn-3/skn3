import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, Check, X, AlertTriangle, Save, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CaseCombobox } from '@/components/shared/CaseCombobox';

type ParsedLine = { name: string; unit_price: number | null; quantity: number | null; sum: number | null };
type Parsed = {
  invoice_number: string | null;
  date: string | null;
  customer_address: string | null;
  recipient_company: string | null;
  recipient_org_nr: string | null;
  total_amount: number | null;
  moms: number | null;
  team_prefix: string | null;
  line_items: ParsedLine[];
};

type FileState = {
  id: string;
  file: File;
  status: 'parsing' | 'ready' | 'error' | 'duplicate' | 'saved';
  parsed?: Parsed;
  error?: string;
  team_id?: string;
  case_id?: string;
  caseMatchKind?: 'exact' | 'street' | 'none';
  duplicate?: boolean;
};

function newId() { return 'f_' + Math.random().toString(36).slice(2, 9); }
function fmt(n: number | null | undefined) { return Math.round(Number(n) || 0).toLocaleString('sv-SE') + ' kr'; }

function streetOf(addr: string): string {
  return (addr || '').toLowerCase().replace(/\s+/g, ' ').trim().split(',')[0].replace(/\d+.*$/, '').trim();
}

export function ImportInvoicesView() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<FileState[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ['montor_teams_all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('montor_teams').select('*').order('name');
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases_for_invoice_match'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('cases').select('id, address, customer_name').order('address');
      if (error) throw error;
      return data as any[];
    },
  });

  async function fileToBase64(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        resolve(s.split(',')[1] || '');
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function handleFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter(f => f.type === 'application/pdf');
    for (const f of arr) {
      const id = newId();
      setFiles(prev => [...prev, { id, file: f, status: 'parsing' }]);
      try {
        const b64 = await fileToBase64(f);
        const { data, error } = await supabase.functions.invoke('parse-a-order-invoice', {
          body: { file_base64: b64, mime_type: 'application/pdf' },
        });
        if (error) throw error;
        const parsed = data as Parsed;
        // duplicate check
        let isDup = false;
        if (parsed?.invoice_number) {
          const { data: dup } = await (supabase as any).from('a_orders').select('id').eq('invoice_number', parsed.invoice_number).maybeSingle();
          if (dup) isDup = true;
        }
        // team match
        let team_id: string | undefined;
        if (parsed?.recipient_org_nr) {
          const t = teams.find((x: any) => x.org_nr && parsed.recipient_org_nr && x.org_nr.replace(/\D/g, '') === parsed.recipient_org_nr.replace(/\D/g, ''));
          if (t) team_id = t.id;
        }
        if (!team_id && parsed?.team_prefix) {
          const t = teams.find((x: any) => (x.invoice_prefix || '').toLowerCase() === parsed.team_prefix!.toLowerCase());
          if (t) team_id = t.id;
        }
        // case match
        let case_id: string | undefined;
        let caseMatchKind: 'exact' | 'street' | 'none' = 'none';
        if (parsed?.customer_address) {
          const addrLower = parsed.customer_address.toLowerCase().trim();
          const exact = cases.find((c: any) => (c.address || '').toLowerCase().trim() === addrLower);
          if (exact) { case_id = exact.id; caseMatchKind = 'exact'; }
          else {
            const street = streetOf(parsed.customer_address);
            if (street.length > 2) {
              const candidate = cases.find((c: any) => streetOf(c.address || '') === street);
              if (candidate) { case_id = candidate.id; caseMatchKind = 'street'; }
            }
          }
        }
        setFiles(prev => prev.map(x => x.id === id ? {
          ...x,
          status: isDup ? 'duplicate' : 'ready',
          parsed, team_id, case_id, caseMatchKind, duplicate: isDup,
        } : x));
      } catch (e: any) {
        console.error(e);
        setFiles(prev => prev.map(x => x.id === id ? { ...x, status: 'error', error: e?.message || 'Tolkning misslyckades' } : x));
      }
    }
  }

  function updateParsed(id: string, patch: Partial<Parsed>) {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, parsed: { ...(f.parsed as Parsed), ...patch } } : f));
  }
  function updateLine(id: string, idx: number, patch: Partial<ParsedLine>) {
    setFiles(prev => prev.map(f => {
      if (f.id !== id || !f.parsed) return f;
      const lines = f.parsed.line_items.map((l, i) => i === idx ? { ...l, ...patch } : l);
      return { ...f, parsed: { ...f.parsed, line_items: lines } };
    }));
  }

  async function save(f: FileState) {
    if (!f.parsed) return;
    if (!f.parsed.invoice_number) { toast.error('Fakturanummer saknas'); return; }
    if (!f.team_id) { toast.error('Välj montörsteam'); return; }
    if (f.duplicate) { toast.error('Fakturanumret finns redan'); return; }

    const lineItems = f.parsed.line_items.map((l, i) => ({
      id: `il_${i}`,
      name: l.name,
      unit_price: Number(l.unit_price) || 0,
      qty: Number(l.quantity) || 0,
      amount: Math.round(Number(l.sum) || (Number(l.unit_price) || 0) * (Number(l.quantity) || 0)),
    }));
    const total = f.parsed.total_amount != null ? Number(f.parsed.total_amount) : lineItems.reduce((s, l) => s + l.amount, 0);

    const payload: any = {
      date: f.parsed.date || new Date().toISOString().slice(0, 10),
      customer_address: f.parsed.customer_address || '(okänd)',
      customer_name: null,
      line_items: lineItems,
      total_amount: total,
      status: 'invoiced',
      invoice_number: f.parsed.invoice_number,
      invoice_sent_at: f.parsed.date ? new Date(f.parsed.date).toISOString() : new Date().toISOString(),
      team_id: f.team_id,
      case_id: f.case_id || null,
      description: 'Importerad faktura',
    };

    const { error } = await (supabase as any).from('a_orders').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(`Faktura ${f.parsed.invoice_number} sparad`);
    setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'saved' } : x));
    qc.invalidateQueries({ queryKey: ['a_orders_all'] });
  }

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed rounded-md p-6 text-center text-sm cursor-pointer border-muted-foreground/30 hover:border-muted-foreground/60"
      >
        <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        Klicka eller dra hit PDF-fakturor från montörer
        <input ref={fileInputRef} type="file" accept="application/pdf" multiple className="hidden"
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }} />
      </div>

      <div className="space-y-3">
        {files.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Inga filer ännu.</p>}
        {files.map(f => (
          <div key={f.id} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate">{f.file.name}</span>
                {f.status === 'parsing' && <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Tolkar</Badge>}
                {f.status === 'ready' && <Badge className="bg-green-600">Klar</Badge>}
                {f.status === 'duplicate' && <Badge className="bg-yellow-500 gap-1"><AlertTriangle className="h-3 w-3" /> Dubblett</Badge>}
                {f.status === 'error' && <Badge variant="destructive">Fel</Badge>}
                {f.status === 'saved' && <Badge className="bg-green-700 gap-1"><Check className="h-3 w-3" /> Sparad</Badge>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeFile(f.id)}><X className="h-4 w-4" /></Button>
            </div>

            {f.status === 'error' && <p className="text-xs text-destructive">{f.error}</p>}

            {f.parsed && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Fakturanr</Label>
                    <Input className="h-8" value={f.parsed.invoice_number || ''} onChange={e => updateParsed(f.id, { invoice_number: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Datum</Label>
                    <Input className="h-8" type="date" value={f.parsed.date || ''} onChange={e => updateParsed(f.id, { date: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Summa</Label>
                    <Input className="h-8" type="number" value={f.parsed.total_amount ?? ''} onChange={e => updateParsed(f.id, { total_amount: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Avsändare</Label>
                    <Input className="h-8" value={f.parsed.recipient_company || ''} onChange={e => updateParsed(f.id, { recipient_company: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Adress (kund)</Label>
                    <Input className="h-8" value={f.parsed.customer_address || ''} onChange={e => updateParsed(f.id, { customer_address: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Montörsteam</Label>
                    <Select value={f.team_id || ''} onValueChange={v => setFiles(prev => prev.map(x => x.id === f.id ? { ...x, team_id: v } : x))}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Välj..." /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Ärende ({f.caseMatchKind === 'exact' ? <span className="text-green-700">exakt</span> : f.caseMatchKind === 'street' ? <span className="text-yellow-700">gatunamn</span> : <span className="text-muted-foreground">manuell</span>})</Label>
                    <CaseCombobox
                      cases={cases as any[]}
                      value={f.case_id || ''}
                      onChange={(id) => setFiles(prev => prev.map(x => x.id === f.id ? { ...x, case_id: id, caseMatchKind: id ? 'exact' : 'none' } : x))}
                      placeholder="Välj ärende..."
                    />
                  </div>
                </div>

                <div className="border rounded-md">
                  <div className="px-3 py-1.5 border-b bg-muted/50 text-xs uppercase text-muted-foreground">Rader ({f.parsed.line_items.length})</div>
                  <div className="divide-y">
                    {f.parsed.line_items.map((l, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5">
                        <Input className="col-span-7 h-7 text-xs" value={l.name} onChange={e => updateLine(f.id, i, { name: e.target.value })} />
                        <Input className="col-span-2 h-7 text-xs" type="number" value={l.unit_price ?? ''} onChange={e => updateLine(f.id, i, { unit_price: Number(e.target.value) || 0 })} />
                        <Input className="col-span-1 h-7 text-xs" type="number" value={l.quantity ?? ''} onChange={e => updateLine(f.id, i, { quantity: Number(e.target.value) || 0 })} />
                        <div className="col-span-2 text-right text-xs font-medium">{fmt(l.sum ?? (Number(l.unit_price) || 0) * (Number(l.quantity) || 0))}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {f.duplicate && (
                  <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded p-2">
                    Fakturanumret <strong>{f.parsed.invoice_number}</strong> finns redan i systemet. Byt nummer eller hoppa över.
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button size="sm" disabled={f.status === 'saved' || f.duplicate || !f.team_id} onClick={() => save(f)} className="gap-1">
                    <Save className="h-3 w-3" /> Spara
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
