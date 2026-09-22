import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/lib/activityLog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uppdragId: string | null;
  uppdragNumber?: string | null;
  onDone?: () => void;
}

export function MarkPaidDialog({ open, onOpenChange, uppdragId, uppdragNumber, onDone }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDate(new Date().toISOString().slice(0, 10));
  }, [open]);

  const confirm = async () => {
    if (!uppdragId || !date) return;
    setBusy(true);
    try {
      const paidAt = new Date(`${date}T12:00:00`).toISOString();
      const { error } = await (supabase as any)
        .from('uppdrag')
        .update({ status: 'slutbetald', paid_at: paidAt })
        .eq('id', uppdragId);
      if (error) throw error;
      logActivity({
        action: 'uppdrag_slutbetald',
        category: 'order',
        description: `Faktura markerad som slutbetald, betaldatum ${new Date(paidAt).toLocaleDateString('sv-SE')}${uppdragNumber ? ` (${uppdragNumber})` : ''}`,
        metadata: { uppdrag_id: uppdragId, paid_at: paidAt },
      });
      toast.success('Markerad som slutbetald');
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Kunde inte markera som slutbetald');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Markera fakturan som slutbetald?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="paid-date">Betaldatum</Label>
          <Input id="paid-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Avbryt</Button>
          <Button type="button" onClick={confirm} disabled={busy || !date}>
            {busy ? 'Sparar…' : 'Bekräfta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
