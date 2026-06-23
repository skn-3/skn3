import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { useRole } from '@/hooks/useRole';
import { Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface Row {
  id: string;
  name: string;
  must_change_pin: boolean;
  pin_change_requested_at: string | null;
  role?: string;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function PinCampaignAdmin() {
  const [testEmail, setTestEmail] = useState('johannes@malke.se');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingReal, setSendingReal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from('profiles').select('id, name, must_change_pin, pin_change_requested_at').order('name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    const roleById = Object.fromEntries((roles || []).map((r: any) => [r.user_id, r.role]));
    setRows((profiles || []).map((p: any) => ({ ...p, role: roleById[p.id] })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendTest = async () => {
    if (!testEmail) return;
    setSendingTest(true);
    const { data, error } = await supabase.functions.invoke('send-pin-change-request', {
      body: { test_mode: true, test_email: testEmail },
    });
    setSendingTest(false);
    if (error) { toast.error(error.message); return; }
    if (data?.error) { toast.error(data.error); return; }
    toast.success(`Testmejl skickat till ${testEmail}`);
  };

  const sendReal = async () => {
    setSendingReal(true);
    const { data, error } = await supabase.functions.invoke('send-pin-change-request', {
      body: { test_mode: false },
    });
    setSendingReal(false);
    setConfirmOpen(false);
    if (error) { toast.error(error.message); return; }
    if (data?.error) { toast.error(data.error); return; }
    const sent = (data?.sent || []).length;
    const missing = (data?.missing || []).length;
    toast.success(`Skickat till ${sent} användare${missing ? ` · saknar/fel: ${missing}` : ''}`);
    await load();
  };

  return (
    <Card className="p-6 space-y-6 mt-6">
      <div>
        <h2 className="text-lg font-semibold">PIN-byte (6-siffrig PIN)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Skicka informationsmejl och aktivera tvångsbyte vid nästa inloggning. Automatiska
          påminnelser dag 2, 4, 6, 8 och 10. Sammanfattning till Daniel dag 11.
        </p>
      </div>

      <div className="space-y-3 border-b pb-6">
        <Label htmlFor="test-email">Test-e-post</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="test-email"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={sendTest} disabled={sendingTest || !testEmail}>
            {sendingTest ? 'Skickar…' : 'Skicka testmejl'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Skickar ett exempelmejl utan att ändra något i databasen.
        </p>
      </div>

      <div className="space-y-2 border-b pb-6">
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={sendingReal}
        >
          {sendingReal ? 'Skickar…' : 'Skicka skarpt till alla'}
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Status per användare</h3>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            {loading ? 'Läser…' : 'Uppdatera'}
          </Button>
        </div>
        <div className="space-y-1">
          {rows.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">Inga användare hittades.</p>
          )}
          {rows.map(r => {
            const d = r.pin_change_requested_at ? daysSince(r.pin_change_requested_at) : null;
            return (
              <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.role || '—'}</div>
                </div>
                <div>
                  {!r.must_change_pin ? (
                    <Badge className="bg-primary text-primary-foreground">Bytt ✓</Badge>
                  ) : d === null ? (
                    <Badge variant="outline">Ej utskickad</Badge>
                  ) : (
                    <Badge variant="secondary">Väntar · dag {Math.min(d, 10)} av 10</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka PIN-bytesmejl till alla?</AlertDialogTitle>
            <AlertDialogDescription>
              Alla användare får ett mejl och tvingas välja en ny 6-siffrig PIN-kod nästa
              gång de loggar in. Den som inte byter får automatiska påminnelser dag 2, 4, 6,
              8 och 10. Dag 11 skickas en sammanställning till Daniel. Detta går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={sendReal}>Skicka skarpt</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
