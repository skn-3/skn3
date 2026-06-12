import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SELLERS, MONTORS, COORDINATORS, loginEmailFor, padPinForAuth, type RoleType } from '@/lib/constants';
import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/integrations/supabase/client';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export function RolePicker() {
  const [roleType, setRoleType] = useState<RoleType | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  // Tick every second while locked so countdown updates.
  useEffect(() => {
    if (!lockUntil) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 500);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [lockUntil]);

  const lockedRemaining = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;
  const isLocked = lockedRemaining > 0;

  const people =
    roleType === 'seller' ? SELLERS :
    roleType === 'montor' ? MONTORS :
    roleType === 'coordinator' ? COORDINATORS : [];

  const handleLogin = async () => {
    if (isLocked || !name || pin.length < 4 || pin.length > 6 || loading) return;
    setLoading(true);
    setPinError(null);

    const email = loginEmailFor(name);
    const password = padPinForAuth(pin);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      logActivity({
        action: 'login_failed',
        category: 'auth',
        description: `Misslyckat inloggningsförsök som ${roleType} (${name})`,
        actor: { name, role: roleType ?? 'unknown' },
      });
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setAttempts(0);
        setPinError(`För många försök. Vänta ${LOCKOUT_SECONDS} sekunder.`);
      } else {
        setPinError(`Fel PIN-kod (${MAX_ATTEMPTS - nextAttempts} försök kvar)`);
      }
      setPin('');
      return;
    }

    // Login OK — onAuthStateChange i useRole tar över härifrån.
    setAttempts(0);
    setLockUntil(null);
  };

  // Clear lock when timer hits zero
  useEffect(() => {
    if (lockUntil && lockedRemaining === 0) {
      setLockUntil(null);
      setPinError(null);
    }
  }, [lockUntil, lockedRemaining]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="SmartKlimat" className="h-[120px] w-[120px] rounded-full object-contain" />
          <h1 className="text-2xl font-bold text-card-foreground">SmartKlimat N3prenad</h1>
          <p className="text-muted-foreground">Välj din roll för att komma igång</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant={roleType === 'seller' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('seller'); setName(''); setPin(''); setPinError(null); }}
            >
              Säljare
            </Button>
            <Button
              variant={roleType === 'montor' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('montor'); setName(''); setPin(''); setPinError(null); }}
            >
              Montör
            </Button>
            <Button
              variant={roleType === 'coordinator' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('coordinator'); setName(''); setPin(''); setPinError(null); }}
            >
              Koordinator
            </Button>
          </div>

          {roleType && (
            <Select value={name} onValueChange={(v) => { setName(v); setPin(''); setPinError(null); }}>
              <SelectTrigger>
                <SelectValue placeholder={`Välj ${roleType === 'seller' ? 'säljare' : roleType === 'montor' ? 'montör' : 'koordinator'}...`} />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {name && (
            <div className="space-y-3">
              <div>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Ange PIN-kod (4 siffror)"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 4 && !isLocked) handleLogin(); }}
                  className="h-12 text-center text-lg tracking-[0.5em]"
                  disabled={isLocked || loading}
                />
                {pinError && <p className="text-sm text-destructive mt-1">{pinError}</p>}
                {isLocked && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Inloggning låst i {lockedRemaining} sekunder
                  </p>
                )}
              </div>
              <Button
                className="w-full h-12"
                disabled={pin.length !== 4 || isLocked || loading}
                onClick={handleLogin}
              >
                {loading ? 'Loggar in…' : 'Logga in'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
