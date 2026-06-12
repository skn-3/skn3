import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildAOrderPdf, loadAOrderLogo } from '@/lib/aOrderPdf';

type Line = { id?: string; name: string; unit_price: number; qty: number; amount: number };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any | null;
  currentUser: string;
}

function fmt(n: number) { return Math.round(n).toLocaleString('sv-SE') + ' kr'; }
function newId() { return 'l_' + Math.random().toString(36).slice(2, 9); }

export function InvoiceAOrderDialog({ open, onOpenChange, order, currentUser }: Props) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    const src: any[] = Array.isArray(order.line_items) ? order.line_items : [];
    setLines(src.map(l => ({
      id: l.id || newId(),
      name: String(l.name || ''),
      unit_price: Number(l.unit_price) || 0,
      qty: Number(l.qty) || 0,
      amount: Math.round((Number(l.unit_price) || 0) * (Number(l.qty) || 0)),
    })));
  }, [open, order]);

  const team = order?.montor_teams || null;
  const recipient = team?.invoice_email || team?.email || '';
  const prefix = team?.invoice_prefix || team?.name || 'INV';
  const nextNo = Math.max(1, Number(team?.next_invoice_number) || 1);
  const invoiceNumber = `${prefix}-${String(nextNo).padStart(3, '0')}`;
  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);

  function upd(id: string, patch: Partial<Line>) {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const m = { ...l, ...patch };
      m.amount = Math.round((Number(m.unit_price) || 0) * (Number(m.qty) || 0));
      return m;
    }));
  }
  function add() { setLines(prev => [...prev, { id: newId(), name: '', unit_price: 0, qty: 1, amount: 0 }]); }
  function del(id: string) { setLines(prev => prev.filter(l => l.id !== id)); }

  async function go() {
    if (!order || !team) return;
    if (!recipient) { toast.error('Montörsteamet saknar e-post / faktura-e-post'); return; }
    if (lines.length === 0) { toast.error('Minst en faktura-rad krävs'); return; }
    setBusy(true);
    try {
      // Build PDF (FAKTURA variant)
      const logo = await loadAOrderLogo();
      const pdfLines = lines.map(l => ({ name: l.name, unit_price: l.unit_price, qty: l.qty, amount: l.amount }));
      const doc = buildAOrderPdf({
        date: new Date().toISOString().slice(0, 10),
        orderNumber: invoiceNumber,
        customerAddress: order.customer_address || '',
        customerName: order.customer_name,
        lines: pdfLines,
        description: order.description,
        team,
        logoDataUrl: logo,
        variant: 'invoice',
      });
      const pdf_base64 = doc.output('datauristring').split(',')[1] || '';

      // Send via edge function (uploads PDF too)
      const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-a-order-invoice', {
        body: { a_order_id: order.id, pdf_base64, kind: 'invoice', invoice_number: invoiceNumber, storage_subpath: 'faktura' },
      });
      if (sendErr) throw sendErr;

      // Update order
      const now = new Date().toISOString();
      const { error: updErr } = await (supabase as any).from('a_orders').update({
        status: 'invoiced',
        invoice_number: invoiceNumber,
        invoice_sent_at: now,
        line_items: pdfLines,
        total_amount: total,
        pdf_path: (sendData as any)?.pdf_path || `a-orders/${order.id}-faktura.pdf`,
      }).eq('id', order.id);
      if (updErr) throw updErr;

      // Increase team counter
      await (supabase as any).from('montor_teams').update({ next_invoice_number: nextNo + 1 }).eq('id', team.id);

      // Case status + event
      if (order.case_id) {
        await (supabase as any).from('cases').update({ status: 'fakturerad' }).eq('id', order.case_id);
        await (supabase as any).from('case_events').insert({
          case_id: order.case_id,
          event_type: 'status_change',
          description: 'Fakturerad automatiskt (faktura skickad från A-ORDER)',
          created_by: 'System',
        });
      }

      toast.success('Faktura skickad');
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
      qc.invalidateQueries({ queryKey: ['montor_teams'] });
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte fakturera');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fakturera A-order #{order?.order_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-muted-foreground">Mottagare:</span> <strong>{recipient || '— saknas —'}</strong></div>
            <div><span className="text-muted-foreground">Fakturanummer:</span> <strong className="text-green-700">{invoiceNumber}</strong></div>
            <div><span className="text-muted-foreground">Kund:</span> <strong>{order?.customer_name || '—'}</strong></div>
            <div><span className="text-muted-foreground">Adress:</span> <strong>{order?.customer_address}</strong></div>
          </div>

          <div className="border rounded-md">
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
              <span className="font-medium">Fakturarader</span>
              <Button size="sm" variant="ghost" onClick={add} className="gap-1 h-7"><Plus className="h-3 w-3" /> Lägg till rad</Button>
            </div>
            <div className="divide-y">
              {lines.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2">
                  <Input className="col-span-6 h-8" value={l.name} onChange={e => upd(l.id!, { name: e.target.value })} placeholder="Benämning" />
                  <Input className="col-span-2 h-8" type="number" step="0.01" value={l.unit_price} onChange={e => upd(l.id!, { unit_price: Number(e.target.value) || 0 })} />
                  <Input className="col-span-2 h-8" type="number" step="0.01" value={l.qty} onChange={e => upd(l.id!, { qty: Number(e.target.value) || 0 })} />
                  <div className="col-span-1 text-right text-sm font-medium">{fmt(l.amount)}</div>
                  <button className="col-span-1 justify-self-end text-muted-foreground hover:text-destructive" onClick={() => del(l.id!)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t flex items-center justify-between bg-muted/30">
              <span className="text-sm text-muted-foreground">Totalt</span>
              <span className="text-base font-semibold text-green-700">{fmt(total)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button onClick={go} disabled={busy || !recipient} className="bg-green-600 hover:bg-green-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generera & skicka faktura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
