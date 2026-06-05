import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
}

export function ChangePinDialog({ open, onOpenChange, userName }: Props) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setPin(''); setConfirm(''); setError(null); };

  const handleSave = async () => {
    setError(null);
    if (pin.length !== 6) { setError('PIN måste vara exakt 6 siffror'); return; }
    if (pin !== confirm) { setError('PIN-koderna matchar inte'); return; }
    setSaving(true);
    const { error: updErr } = await supabase.auth.updateUser({ password: pin });
    if (updErr) {
      setSaving(false);
      setError(updErr.message);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id) {
      await supabase.from('profiles').update({ must_change_pin: false }).eq('id', userData.user.id);
    }
    logActivity({
      action: 'pin_changed',
      category: 'auth',
      description: `${userName} bytte PIN-kod`,
    });
    setSaving(false);
    toast.success('PIN-kod uppdaterad');
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Byt PIN-kod</DialogTitle>
          <DialogDescription>Välj en ny PIN-kod på exakt 6 siffror.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="new-pin">Ny PIN (6 siffror)</Label>
            <Input
              id="new-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-[0.5em]"
            />
          </div>
          <div>
            <Label htmlFor="confirm-pin">Bekräfta PIN</Label>
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-[0.5em]"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Avbryt</Button>
          <Button onClick={handleSave} disabled={saving || pin.length !== 6 || confirm.length !== 6}>
            {saving ? 'Sparar…' : 'Spara'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
