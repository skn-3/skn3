import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activityLog';

interface Props {
  userId: string;
  userName: string;
  onCompleted: () => void;
}

/**
 * Tvingande PIN-byte: ej stängbar, ingen åtkomst förrän ny 6-siffrig PIN sparats.
 */
export function ForcePinChangeGate({ userId, userName, onCompleted }: Props) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (pin.length !== 6) { setError('PIN måste vara exakt 6 siffror'); return; }
    if (pin !== confirm) { setError('PIN-koderna matchar inte'); return; }
    if (/^(\d)\1+$/.test(pin) || pin === '123456' || pin === '654321') {
      setError('Välj en mindre uppenbar kod');
      return;
    }
    setSaving(true);
    const { error: updErr } = await supabase.auth.updateUser({ password: pin });
    if (updErr) {
      setSaving(false);
      setError(updErr.message);
      return;
    }
    await supabase.from('profiles').update({ must_change_pin: false }).eq('id', userId);
    logActivity({
      action: 'pin_changed',
      category: 'auth',
      description: `${userName} bytte PIN-kod (tvingande)`,
    });
    setSaving(false);
    toast.success('PIN-kod uppdaterad');
    onCompleted();
  };

  // Block escape/outside close: Dialog without onOpenChange that closes.
  return (
    <Dialog open onOpenChange={() => { /* no-op: not dismissible */ }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Välj ny PIN-kod</DialogTitle>
          <DialogDescription>
            Hej {userName}! Vi höjer säkerheten i N3prenad. Välj en personlig 6-siffrig PIN-kod
            innan du kan fortsätta. Undvik 123456, födelsedatum eller en kod du använder någon
            annanstans.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="force-new-pin">Ny PIN (6 siffror)</Label>
            <Input
              id="force-new-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-[0.5em]"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="force-confirm-pin">Bekräfta PIN</Label>
            <Input
              id="force-confirm-pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-[0.5em]"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving || pin.length !== 6 || confirm.length !== 6}
          >
            {saving ? 'Sparar…' : 'Spara ny PIN'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
