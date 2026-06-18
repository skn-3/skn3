import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildAOrderPdf, loadAOrderLogo } from '@/lib/aOrderPdf';
import { normalizeLines } from '@/lib/aOrderLines';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any | null;
  currentUser: string;
  onCredited?: (originalOrder: any) => void;
}

function fmt(n: number) {
  const s = Math.round(Math.abs(n)).toLocaleString('sv-SE');
  return (n < 0 ? '-' : '') + s + ' kr';
}

export function CreditAOrderDialog({ open, onOpenChange, order, currentUser, onCredited }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const team = order?.montor_teams || null;
  const recipient = team?.invoice_email || team?.email || '';
  const prefix = team?.invoice_prefix || team?.name || 'INV';
  const nextNo = Math.max(1, Number(team?.next_invoice_number) || 1);
  const creditNumber = `${prefix}-${String(nextNo).padStart(3, '0')}`;
  const origNo = order?.invoice_number || '';

  const negLines = useMemo(() => {
    const src = normalizeLines(order?.line_items);
    return src.map(l => ({
      id: l.id,
      name: l.name,
      unit_price: -Math.abs(l.unit_price),
      qty: l.qty,
      amount: -Math.abs(Math.round(l.unit_price * l.qty)),
    }));
  }, [order]);
  const total = negLines.reduce((s, l) => s + l.amount, 0);

  async function go() {
    if (!order || !team) return;
    setBusy(true);
    try {
      const subNote = `Kreditering av faktura ${origNo}`;
      const logo = await loadAOrderLogo();
      const doc = buildAOrderPdf({
        date: new Date().toISOString().slice(0, 10),
        orderNumber: creditNumber,
        customerAddress: order.customer_address || '',
        customerName: order.customer_name,
        lines: negLines,
        description: subNote,
        team,
        logoDataUrl: logo,
        variant: 'credit',
        subNote,
      });
      const pdf_base64 = doc.output('datauristring').split(',')[1] || '';

      // Create new credit a_order row first (so we have its id for storage path)
      const insertPayload: any = {
        date: new Date().toISOString().slice(0, 10),
        customer_name: order.customer_name,
        customer_address: order.customer_address,
        customer_phone: order.customer_phone,
        facade_type: order.facade_type,
        window_count: order.window_count,
        door_count: order.door_count,
        roof_window_count: order.roof_window_count,
        km_distance: order.km_distance,
        line_items: negLines,
        description: subNote,
        total_amount: total,
        status: 'credited',
        invoice_number: creditNumber,
        invoice_sent_at: new Date().toISOString(),
        credited_from_order_id: order.id,
        team_id: order.team_id,
        case_id: order.case_id,
      };
      const { data: newRow, error: insErr } = await (supabase as any).from('a_orders').insert(insertPayload).select('id').single();
      if (insErr) throw insErr;
      const newId = newRow.id;

      // Send via edge function (uses new row id for PDF storage)
      const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-a-order-invoice', {
        body: { a_order_id: newId, pdf_base64, kind: 'credit', invoice_number: creditNumber, sub_note: subNote, storage_subpath: 'kredit' },
      });
      if (sendErr) throw sendErr;
      await (supabase as any).from('a_orders').update({ pdf_path: (sendData as any)?.pdf_path || `a-orders/${newId}-kredit.pdf` }).eq('id', newId);

      // Increase team counter, mark original credited
      await (supabase as any).from('montor_teams').update({ next_invoice_number: nextNo + 1 }).eq('id', team.id);
      await (supabase as any).from('a_orders').update({ status: 'credited' }).eq('id', order.id);

      if (order.case_id) {
        await (supabase as any).from('cases').update({ status: 'montage_klart' }).eq('id', order.case_id);
        await (supabase as any).from('case_events').insert({
          case_id: order.case_id,
          event_type: 'status_change',
          description: 'Status återställd till Montage klart (faktura krediterad)',
          created_by: 'System',
        });
      }

      toast.success('Kreditfaktura skickad');
      qc.invalidateQueries({ queryKey: ['a_orders_all'] });
      qc.invalidateQueries({ queryKey: ['montor_teams'] });
      onOpenChange(false);
      onCredited?.(order);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte kreditera');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-red-600">Kreditera faktura {origNo}</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-3">
          <p className="text-muted-foreground">
            En kreditfaktura skapas med nummer <strong className="text-red-600">{creditNumber}</strong> och
            skickas till <strong>{recipient || '— saknas —'}</strong>. Originalfakturan markeras som krediterad.
          </p>
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-xs uppercase text-muted-foreground mb-2">Original</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Adress: <strong>{order?.customer_address}</strong></div>
              <div>Kund: <strong>{order?.customer_name || '—'}</strong></div>
              <div>Summa: <strong>{fmt(Number(order?.total_amount) || 0)}</strong></div>
              <div>Antal rader: <strong>{negLines.length}</strong></div>
            </div>
          </div>
          <div className="rounded-md border border-red-300 p-3 bg-red-50">
            <div className="text-xs uppercase text-red-700 mb-2">Kreditfaktura</div>
            <div className="text-2xl font-semibold text-red-600">{fmt(total)}</div>
          </div>
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {!team && (
            <div className="text-xs text-red-600 sm:mr-auto">Ordern saknar montörsteam — tilldela först.</div>
          )}
          {team && !recipient && (
            <div className="text-xs text-red-600 sm:mr-auto">Teamet saknar e-post (fyll i under Admin → Montörsteam).</div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button onClick={go} disabled={busy || !team || !recipient || negLines.length === 0} className="bg-red-600 hover:bg-red-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Bekräfta kreditering
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
