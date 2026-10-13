import { useLayoutEffect } from 'react';

/**
 * Publika sidor (kundens offertsida, kundens statussida) visas alltid i ljust tema – oavsett besökarens
 * systemtema och oavsett vad next-themes sätter efteråt. ThemeProvider ligger högre upp i trädet och
 * lägger tillbaka klassen "dark" efter att sidan monterats, därför bevakas <html> så länge sidan visas.
 * Återställer temat när sidan lämnas.
 */
export function useForceLight() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const hadDark = el.classList.contains('dark');
    const prevScheme = el.style.colorScheme;
    const apply = () => {
      if (el.classList.contains('dark')) el.classList.remove('dark');
      if (el.style.colorScheme !== 'light') el.style.colorScheme = 'light';
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => {
      mo.disconnect();
      if (hadDark) el.classList.add('dark');
      el.style.colorScheme = prevScheme;
    };
  }, []);
}
