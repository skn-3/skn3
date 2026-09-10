import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROMO_MAX_VISITS = 5;
const promoKey = (user: string) => `dark-promo-v1:${user || 'anon'}`;

// Räknar besök (en gång per session) och avgör om kampanjen ska visas.
export function useDarkModePromo(userKey: string) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    try {
      const key = promoKey(userKey);
      const raw = JSON.parse(localStorage.getItem(key) || '{"visits":0,"done":false}');
      if (raw.done) return;
      const sessionMark = `dark-promo-session:${userKey}`;
      if (!sessionStorage.getItem(sessionMark)) {
        raw.visits = (raw.visits || 0) + 1;
        sessionStorage.setItem(sessionMark, '1');
        localStorage.setItem(key, JSON.stringify(raw));
      }
      setActive(raw.visits <= PROMO_MAX_VISITS);
    } catch {}
  }, [userKey]);
  const dismiss = () => {
    try {
      const key = promoKey(userKey);
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...raw, done: true }));
    } catch {}
    setActive(false);
  };
  return { active, dismiss };
}

export function ThemeToggle({ userKey = '', withPromo = false, className = '' }: { userKey?: string; withPromo?: boolean; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { active, dismiss } = useDarkModePromo(withPromo ? userKey : '__off__');
  const showPromo = withPromo && active;
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (!showPromo) return;
    const t1 = setTimeout(() => setTipOpen(true), 1200);
    const t2 = setTimeout(() => setTipOpen(false), 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showPromo]);

  const toggle = () => {
    setTheme(isDark ? 'light' : 'dark');
    if (showPromo) dismiss(); // hittad = kampanjen klar
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Button variant="ghost" size="icon" onClick={toggle} title="Byt tema" aria-label="Byt tema">
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      {showPromo && tipOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border bg-card p-3 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-card-foreground">Nyhet: Mörkt läge</p>
              <p className="text-xs text-muted-foreground mt-1">Klicka på månen för att byta. Ditt val sparas.</p>
            </div>
            <button onClick={() => { setTipOpen(false); dismiss(); }} aria-label="Stäng" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
