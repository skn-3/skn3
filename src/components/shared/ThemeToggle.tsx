import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Temaväxlaren. Kampanjen "Nyhet: Mörkt läge" är avslutad – knappen talar för sig själv.
// Hooken finns kvar för WelcomeDashboard men är alltid inaktiv.
export function useDarkModePromo(_userKey: string) {
  return { active: false, dismiss: () => {} };
}

// userKey/withPromo behålls i signaturen så att befintliga anrop inte behöver ändras.
export function ThemeToggle({
  className = '',
  onDark = false,
}: { userKey?: string; withPromo?: boolean; className?: string; onDark?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant={onDark ? 'onDark' : 'ghost'}
      size="icon"
      className={className}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Ljust läge' : 'Mörkt läge'}
      aria-label={isDark ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
