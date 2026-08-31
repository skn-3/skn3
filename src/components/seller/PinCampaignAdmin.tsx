import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
import { Copy, KeyRound, UserPlus } from 'lucide-react';
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
  const { role } = useRole();
  const isAdmin = !!role?.isAdmin;
  const [testEmail, setTestEmail] = useState('johannes@malke.se');
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingReal, setSendingReal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // PIN-reset state
  const [resetTarget, setResetTarget] = useState<Row | null>(null);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [pinShownFor, setPinShownFor] = useState<string | null>(null);

  // Skapa-användare state
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState('');
  
  const [cRole, setCRole] = useState<'montor' | 'seller' | 'coordinator'>('montor');
  const [cAdmin, setCAdmin] = useState(false);
  const [cTeam, setCTeam] = useState('');
  const [activeTeams, setActiveTeams] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const name = cRole === 'montor' ? cTeam : cName.trim();
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { name, role: cRole, is_admin: cAdmin },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return { name, pin: (data as any).pin as string };
    },
    onSuccess: ({ name, pin }) => {
      setCreateOpen(false);
      setNewPin(pin);
      setPinShownFor(name);
      setCName(''); setCTeam(''); setCAdmin(false);
      toast.success(`Användare ${name} skapad`);
      load();
    },
    onError: (e: any) => toast.error(e?.message || 'Kunde inte skapa användare'),
  });

  const resetMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.functions.invoke('reset-user-pin', {
        body: { target_user_id: targetUserId },
      });
      if (error) {
        let detail = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) detail = `${body.error}${body.step ? ' (' + body.step + ')' : ''}`;
        } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      return data as { pin: string };
    },
    onSuccess: (data, targetUserId) => {
      setNewPin(data.pin);
      setPinShownFor(targetUserId);
      setResetTarget(null);
      const name = rows.find(r => r.id === targetUserId)?.name ?? '';
      toast.success(`Ny tillfällig PIN för ${name}: ${data.pin} — användaren tvingas byta vid inloggning.`);
      load();
    },
    onError: (err: Error) => {
      toast.error(`Kunde inte återställa PIN: ${err.message}`);
      setResetTarget(null);
    },
  });

  const copyPin = async () => {
    if (!newPin) return;
    try {
      await navigator.clipboard.writeText(newPin);
      toast.success('PIN kopierad');
    } catch {
      toast.error('Kunde inte kopiera');
    }
  };

  const closePinDialog = () => {
    setNewPin(null);
    setPinShownFor(null);
  };


  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: teams }] = await Promise.all([
      supabase.from('profiles').select('id, name, must_change_pin, pin_change_requested_at').order('name'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('montor_teams').select('name').eq('is_active', true).order('name'),
    ]);
    const roleById = Object.fromEntries((roles || []).map((r: any) => [r.user_id, r.role]));
    setRows((profiles || []).map((p: any) => ({ ...p, role: roleById[p.id] })));
    setActiveTeams((teams || []).map((t: any) => t.name as string));
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">PIN-byte (6-siffrig PIN)</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Skicka informationsmejl och aktivera tvångsbyte vid nästa inloggning. Automatiska
            påminnelser dag 2, 4, 6, 8 och 10. Sammanfattning till Daniel dag 11.
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" />
            Ny användare
          </Button>
        )}
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
                <div className="flex items-center gap-2">
                  {!r.must_change_pin ? (
                    <Badge className="bg-primary text-primary-foreground">Bytt ✓</Badge>
                  ) : d === null ? (
                    <Badge variant="outline">Ej utskickad</Badge>
                  ) : (
                    <Badge variant="secondary">Väntar · dag {Math.min(d, 10)} av 10</Badge>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResetTarget(r)}
                      disabled={resetMutation.isPending}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Återställ PIN
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Återställ PIN för {resetTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Den gamla koden slutar gälla direkt. En ny 6-siffrig PIN genereras och visas
              en gång — kopiera och skicka den till användaren. Användaren tvingas välja en
              egen PIN vid nästa inloggning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetTarget && resetMutation.mutate(resetTarget.id)}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? 'Återställer…' : 'Återställ PIN'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!newPin} onOpenChange={(o) => !o && closePinDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny PIN-kod</DialogTitle>
            <DialogDescription>
              Den här koden visas bara en gång. Kopiera och skicka den till användaren nu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-4">
            <code className="font-mono text-2xl tracking-[0.4em]">{newPin}</code>
            <Button variant="outline" size="sm" onClick={copyPin}>
              <Copy className="h-3.5 w-3.5" />
              Kopiera
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Användaren {rows.find(r => r.id === pinShownFor)?.name ?? pinShownFor ?? ''} tvingas
            byta till en egen PIN vid nästa inloggning.
          </p>
          <DialogFooter>
            <Button onClick={closePinDialog}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny användare</DialogTitle>
            <DialogDescription>
              Skapa ett konto med tillfällig 6-siffrig PIN. Användaren tvingas byta vid
              första inloggning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Roll</Label>
              <Select value={cRole} onValueChange={(v) => setCRole(v as typeof cRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="montor">Montör</SelectItem>
                  <SelectItem value="seller">Säljare</SelectItem>
                  <SelectItem value="coordinator">Koordinator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cRole === 'montor' ? (
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select value={cTeam} onValueChange={setCTeam}>
                  <SelectTrigger><SelectValue placeholder="Välj montörsteam" /></SelectTrigger>
                  <SelectContent>
                    {activeTeams.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Montörens användarnamn blir teamets namn; det är så ärenden kopplas till
                  montören. Saknas teamet, skapa det först under Montörsteam.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="create-name">Namn</Label>
                  <Input
                    id="create-name"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-admin"
                    checked={cAdmin}
                    onCheckedChange={(v) => setCAdmin(v === true)}
                  />
                  <Label htmlFor="create-admin" className="font-normal">Administratör</Label>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Inloggning sker med namn + PIN. Kontaktuppgifter (e-post, telefon) anges på montörsteamet.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                (cRole === 'montor' ? !cTeam : !cName.trim())
              }
            >
              {createMutation.isPending ? 'Skapar…' : 'Skapa användare'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
