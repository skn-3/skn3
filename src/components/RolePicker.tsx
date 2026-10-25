import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getISOWeek } from 'date-fns';
import { Home, Wrench, CalendarDays, Check, Delete, ArrowRight, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SELLERS, MONTORS, COORDINATORS, loginEmailFor, padPinForAuth, type RoleType } from '@/lib/constants';
import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/integrations/supabase/client';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { LogoWithHat } from '@/components/winter/LogoWithHat';
import { useIsMobile } from '@/hooks/use-mobile';

const ROLE_OPTIONS: { type: RoleType; label: string; icon: LucideIcon }[] = [
  { type: 'seller', label: 'Säljare', icon: Home },
  { type: 'montor', label: 'Montör', icon: Wrench },
  { type: 'coordinator', label: 'Koordinator', icon: CalendarDays },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export function RolePicker() {
  const { data: directory } = useQuery({
    queryKey: ['login-directory'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('login_directory');
      if (error) throw error;
      return (data ?? []) as { name: string; role: string }[];
    },
    staleTime: 60 * 1000,
  });
  const [roleType, setRoleType] = useState<RoleType | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);
  const isMobile = useIsMobile();

  // Tick every second while locked so countdown updates.
  useEffect(() => {
    if (!lockUntil) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 500);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [lockUntil]);

  const lockedRemaining = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0;
  const isLocked = lockedRemaining > 0;

  const fallback =
    roleType === 'seller' ? SELLERS :
    roleType === 'montor' ? MONTORS :
    roleType === 'coordinator' ? COORDINATORS : [];
  const fromDb = (directory ?? []).filter((d) => d.role === roleType).map((d) => d.name);
  const people: readonly string[] = fromDb.length > 0 ? fromDb : fallback;

  const handleLogin = async () => {
    if (isLocked || !name || pin.length < 4 || pin.length > 6 || loading) return;
    setLoading(true);
    setPinError(null);

    const email = loginEmailFor(name);
    const password = padPinForAuth(pin);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      console.warn('Inloggning misslyckades:', email, error.message, error);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      logActivity({
        action: 'login_failed',
        category: 'auth',
        description: `Misslyckat inloggningsförsök som ${roleType} (${name})`,
        actor: { name, role: roleType ?? 'unknown' },
        metadata: { error_message: error.message, email },
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

  const pickRole = (t: RoleType) => { setRoleType(t); setName(''); setPin(''); setPinError(null); };
  const pickName = (p: string) => { setName(p); setPin(''); setPinError(null); };
  const pinValid = pin.length >= 4 && pin.length <= 6;
  const pinDisabled = isLocked || loading;
  const pressKey = (d: string) => { if (pinDisabled) return; setPin((p) => (p + d).replace(/\D/g, '').slice(0, 6)); setPinError(null); };
  const eraseKey = () => { if (pinDisabled) return; setPin((p) => p.slice(0, -1)); setPinError(null); };
  const clearKeys = () => { if (pinDisabled) return; setPin(''); setPinError(null); };

  const today = new Date();
  const todayLabel = `${today.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })} · v${getISOWeek(today)}`;
  const legend = 'text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground';

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="relative overflow-hidden bg-ink-deep text-white px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-6 md:flex-[1_1_420px] md:min-h-screen md:px-14 md:py-12 md:flex md:flex-col md:justify-between">
        <img
          src="/brand/logo-stamp-guld.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-6 w-44 opacity-[0.14] -rotate-12 md:-right-36 md:-bottom-32 md:top-auto md:w-[560px]"
        />
        <div className="relative flex items-center gap-3">
          <LogoWithHat src="/brand/logo-stamp-vit-n3.png" alt="SmartKlimat N3prenad" className="h-10 w-10 md:h-12 md:w-12 object-contain" />
          <span className="flex flex-col leading-none">
            <span className="font-display font-bold text-xl md:text-2xl">SmartKlimat</span>
            <span className="text-[10.5px] md:text-[11px] tracking-[0.14em] uppercase text-ink-muted">N3prenad</span>
          </span>
        </div>
        <div className="relative mt-5 md:mt-0 max-w-md">
          <h2 className="font-display font-semibold text-2xl leading-tight md:text-[40px] md:leading-[1.08]">Tänk smart, vi har ett gemensamt klimat.</h2>
          <p className="hidden md:block mt-4 max-w-sm text-base text-ink-muted">
            Varje fönster som monteras blir ett träd som planteras. Här sköter vi vägen dit: från första besöket till sista fakturan.
          </p>
        </div>
        <div className="relative hidden md:flex items-center gap-3 text-[13px] text-ink-muted">
          <span className="font-mono capitalize">{todayLabel}</span>
          <span className="h-1 w-1 rounded-full bg-gold" aria-hidden="true" />
          <span>I samarbete med Mockfjärds Fönster</span>
        </div>
      </aside>

      <main className="flex flex-1 items-start justify-center px-4 py-5 md:items-center md:px-8 md:py-12">
        <form
          className="w-full max-w-[440px] space-y-5 md:space-y-6"
          onSubmit={(e) => { e.preventDefault(); if (pinValid && !isLocked && !loading) handleLogin(); }}
        >
          <div>
            <h1 className="font-display font-bold text-[26px] leading-tight md:text-[32px]">Välkommen tillbaka</h1>
            <p className="mt-1 text-muted-foreground">Välj vem du är och skriv din PIN-kod.</p>
          </div>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={`${legend} mb-2.5`}>Roll</legend>
            <div role="radiogroup" aria-label="Roll" className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted p-1">
              {ROLE_OPTIONS.map((r) => {
                const on = roleType === r.type;
                const Icon = r.icon;
                return (
                  <button
                    key={r.type}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickRole(r.type)}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] text-sm font-semibold transition-colors md:min-h-12 ${on ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Icon className="hidden h-4 w-4 sm:block" />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {roleType && (
            <fieldset className="m-0 min-w-0 border-0 p-0 animate-fade-up">
              <legend className={`${legend} mb-2.5`}>Vem är du?</legend>
              <div role="radiogroup" aria-label="Namn" className="grid grid-cols-2 gap-2">
                {people.map((p) => {
                  const on = name === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickName(p)}
                      className={`flex min-h-[52px] items-center gap-3 rounded-xl bg-card px-3 text-left text-[15px] font-semibold transition-colors md:min-h-[60px] md:px-3.5 ${on ? 'border-2 border-primary' : 'border border-border hover:border-border-strong'}`}
                    >
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold md:h-9 md:w-9 ${on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                        {initialsOf(p)}
                      </span>
                      <span className="truncate">{p}</span>
                      {on && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {name && (
            <div className="space-y-3 animate-fade-up">
              <div className="flex items-center justify-between">
                <label htmlFor="pin" className={legend}>PIN-kod</label>
                <span className="text-[13px] text-muted-foreground">4–6 siffror</span>
              </div>

              {isMobile ? (
                <div className="space-y-3">
                  <div className="flex justify-center gap-3" aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-primary' : 'border-2 border-border-strong'}`} />
                    ))}
                  </div>
                  <input id="pin" type="password" inputMode="numeric" value={pin} readOnly aria-label="PIN-kod" className="sr-only" tabIndex={-1} />
                  <div className="grid grid-cols-3 gap-2" aria-label="Knappsats">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                      <button key={d} type="button" onClick={() => pressKey(d)} disabled={pinDisabled} className="min-h-[54px] rounded-xl border border-border bg-card font-mono text-[22px] text-foreground transition-colors active:bg-accent disabled:opacity-50">
                        {d}
                      </button>
                    ))}
                    <button type="button" onClick={clearKeys} disabled={pinDisabled} className="min-h-[54px] rounded-xl text-[13px] font-semibold text-muted-foreground disabled:opacity-50">Rensa</button>
                    <button type="button" onClick={() => pressKey('0')} disabled={pinDisabled} className="min-h-[54px] rounded-xl border border-border bg-card font-mono text-[22px] text-foreground transition-colors active:bg-accent disabled:opacity-50">0</button>
                    <button type="button" onClick={eraseKey} disabled={pinDisabled} aria-label="Radera" className="inline-flex min-h-[54px] items-center justify-center rounded-xl text-muted-foreground disabled:opacity-50">
                      <Delete className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              ) : (
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && pinValid && !isLocked) handleLogin(); }}
                  className="h-12 text-center text-lg tracking-[0.5em]"
                  disabled={pinDisabled}
                  autoFocus
                />
              )}

              {pinError && <p className="text-sm font-medium text-destructive" role="alert">{pinError}</p>}
              {isLocked && <p className="text-sm text-muted-foreground">Inloggning låst i {lockedRemaining} sekunder</p>}

              <Button type="submit" size="xl" className="w-full" disabled={!pinValid || isLocked || loading}>
                {loading ? 'Loggar in…' : 'Logga in'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1 text-[13px] text-muted-foreground">
            <span>Glömt PIN? Be koordinatorn återställa.</span>
            <ThemeToggle />
          </div>
        </form>
      </main>
    </div>
  );
}
