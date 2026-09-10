import { useEffect } from 'react';

/** Publika sidor ska alltid visas i ljust tema. */
export function useForceLight() {
  useEffect(() => {
    const el = document.documentElement;
    const hadDark = el.classList.contains('dark');
    el.classList.remove('dark');
    return () => {
      if (hadDark) el.classList.add('dark');
    };
  }, []);
}
