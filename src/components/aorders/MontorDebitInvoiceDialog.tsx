import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CaseCombobox } from '@/components/shared/CaseCombobox';
import { buildMontorDebitPdf } from '@/lib/montorDebitPdf';
import { loadAOrderLogo } from '@/lib/aOrderPdf';

type Line = { id: string; description: string; qty: number; unit: string; unit_price: number; amount: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUser: string;
}

function newId() { return 'l_' + Math.random().toString(36).slice(2, 9); }
function fmt(n: number) { return Math.round(n || 0).toLocaleString('sv-SE') + ' kr'; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export function MontorDebitInvoiceDialog({ open, onOpenChange, currentUser }: Props) {
  const qc = useQueryClient();
  const [teamId, setTeamId] = useState('');
  const [date, setDate] = useState(isoDate(new Date()));
  const [dueDate, setDueDate] = useState(isoDate(addDays(new Date(), 10)));
  const [vatMode, setVatMode] = useState<'omvand' | 'vanlig'>('omvand');
  const [caseId, setCaseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([{ id: newId(), description: '', qty: 1, unit: 'st', unit_price: 0, amount: 0 }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTeamId(''); setDate(isoDate(new Date())); setDueDate(isoDate(addDays(new Date(), 10)));
      setVatMode('omvand'); setCaseId(''); setTitle(''); setDescription('');
      setLines([{ id: newId(), description: '', qty: 1, unit: 'st', unit_price: 0, amount: 0 }]);
    }
  }, [open]);

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
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('cases').select('id, address, customer_name').order('address');
      if (error) throw error;
      return data as any[];
    },
  });

  const team = useMemo(() => teams.find(t => t.id === teamId) || null, [teams, teamId]);
  const recipient = team?.invoice_email || team?.email || '';

  const subtotal = useMemo(() => lines.reduce((s, l) => s + Number(l.amount || 0), 0), [lines]);
  const vatAmount = vatMode === 'vanlig' ? Math.round(subtotal * 0.25) : 0;
  const total = subtotal + vatAmount;

  function upd(id: string, patch: Partial<Line>) {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      if (!('amount' in patch)) {
        next.amount = Math.round((Number(next.qty) || 0) * (Number(next.unit_price) || 0));
      }
      return next;
    }));
  }
  function add() { setLines(prev => [...prev, { id: newId(), description: '', qty: 1, unit: 'st', unit_price: 0, amount: 0 }]); }
  function del(id: string) { setLines(prev => prev.filter(l => l.id !== id)); }

  async function go() {
    if (!team) { toast.error('Välj montör'); return; }
    if (!recipient) { toast.error('Montörsteamet saknar e-post'); return; }
    if (lines.length === 0 || lines.every(l => !l.description.trim())) {
      toast.error('Minst en faktura-rad krävs'); return;
    }
    setBusy(true);
    try {
      const pdfLines = lines.map(l => ({
        description: l.description, qty: l.qty, unit: l.unit, unit_price: l.unit_price, amount: l.amount,
      }));
      const { data: { user } } = await supabase.auth.getUser();
      const insertPayload = {
        created_by: user?.id ?? null,
        date, due_date: dueDate || null,
        team_id: team.id,
        case_id: caseId || null,
        title: title || null,
        description: description || null,
        line_items: pdfLines,
        vat_mode: vatMode,
        subtotal, vat_amount: vatAmount, total,
        status: 'sent',
      };
      const { data: inserted, error: insErr } = await (supabase as any)
        .from('montor_debit_invoices').insert(insertPayload).select('*').maybeSingle();
      if (insErr) throw insErr;
      if (!inserted) throw new Error('Kunde inte skapa faktura');

      const logo = await loadAOrderLogo();
      const doc = buildMontorDebitPdf({
        invoiceNumber: inserted.invoice_number,
        date, dueDate: dueDate || null,
        team, title, description,
        lines: pdfLines, vatMode, subtotal, vatAmount, total,
        logoDataUrl: logo,
      });
      const pdf_base64 = doc.output('datauristring').split(',')[1] || '';

      const { error: sendErr } = await supabase.functions.invoke('send-montor-debit-invoice', {
        body: { debit_invoice_id: inserted.id, pdf_base64 },
      });
      if (sendErr) throw sendErr;

      if (caseId) {
        await (supabase as any).from('case_events').insert({
          case_id: caseId,
          event_type: 'note',
          description: `Debetfaktura ${inserted.invoice_number} skickad till ${team.company_name || team.name} (${fmt(total)})`,
          created_by: currentUser || 'System',
        });
      }

      toast.success(`Faktura ${inserted.invoice_number} skickad`);
      qc.invalidateQueries({ queryKey: ['montor_debit_invoices'] });
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte skapa faktura');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fakturera montör</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Montör (kund) *</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue placeholder="Välj montör..." /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.company_name || t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {team && !recipient && <div className="text-[11px] text-red-600 mt-1">Teamet saknar e-post.</div>}
            </div>
            <div>
              <Label className="text-xs">Ärendekoppling (valfritt)</Label>
              <CaseCombobox cases={cases} value={caseId} onChange={setCaseId} />
            </div>
            <div>
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Förfallodatum</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Momsläge</Label>
            <RadioGroup value={vatMode} onValueChange={(v) => setVatMode(v as 'omvand' | 'vanlig')} className="flex gap-6 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="omvand" id="vat-om" />
                <Label htmlFor="vat-om" className="cursor-pointer text-sm font-normal">Omvänd betalningsskyldighet (0%)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="vanlig" id="vat-va" />
                <Label htmlFor="vat-va" className="cursor-pointer text-sm font-normal">Vanlig moms (25%)</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs">Titel</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Reklamationskostnad – skada vid montage" />
          </div>
          <div>
            <Label className="text-xs">Beskrivning</Label>
            <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="border rounded-md">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
              <span className="font-medium">Fakturarader</span>
              <Button size="sm" variant="ghost" onClick={add} className="gap-1 h-7"><Plus className="h-3 w-3" /> Lägg till rad</Button>
            </div>
            <div className="divide-y">
              <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] uppercase text-muted-foreground">
                <div className="col-span-5">Benämning</div>
                <div className="col-span-1 text-right">Antal</div>
                <div className="col-span-1">Enhet</div>
                <div className="col-span-2 text-right">Á-pris</div>
                <div className="col-span-2 text-right">Summa</div>
                <div className="col-span-1"></div>
              </div>
              {lines.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                  <Input className="col-span-5 h-8" value={l.description} onChange={e => upd(l.id, { description: e.target.value })} placeholder="Benämning" />
                  <Input className="col-span-1 h-8 text-right" type="number" step="any" value={l.qty} onChange={e => upd(l.id, { qty: Number(e.target.value) || 0 })} />
                  <Input className="col-span-1 h-8" value={l.unit} onChange={e => upd(l.id, { unit: e.target.value })} />
                  <Input className="col-span-2 h-8 text-right" type="number" step="any" value={l.unit_price} onChange={e => upd(l.id, { unit_price: Number(e.target.value) || 0 })} />
                  <Input className="col-span-2 h-8 text-right font-medium" type="number" step="any" value={l.amount} onChange={e => upd(l.id, { amount: Number(e.target.value) || 0 })} />
                  <button className="col-span-1 justify-self-end text-muted-foreground hover:text-destructive" onClick={() => del(l.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t bg-muted/30 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Summa ex moms</span>
                <span className="font-medium">{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Moms {vatMode === 'vanlig' ? '(25%)' : '(omvänd)'}</span>
                <span className="font-medium">{fmt(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold pt-1 border-t">
                <span>Att betala</span>
                <span>{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button onClick={go} disabled={busy || !team || !recipient} className="bg-green-600 hover:bg-green-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Skapa & skicka faktura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
