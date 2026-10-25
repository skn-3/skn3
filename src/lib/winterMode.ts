import { useCallback, useEffect, useState } from 'react';

// Ändra datumen här för nästa säsong.
export const WINTER_SEASON_START = '2026-10-25';
export const WINTER_SEASON_END = '2027-01-06';

export const WINTER_PREF_KEY = 'smartklimat_julpynt';
export const WINTER_PREF_EVENT = 'smartklimat-winter-pref';

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isWinterSeason(now: Date = new Date()): boolean {
  const s = localDateString(now);
  return s >= WINTER_SEASON_START && s <= WINTER_SEASON_END;
}

export function getWinterPref(): boolean {
  try {
    return localStorage.getItem(WINTER_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setWinterPref(on: boolean): void {
  try {
    localStorage.setItem(WINTER_PREF_KEY, on ? 'on' : 'off');
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new Event(WINTER_PREF_EVENT));
  } catch { /* ignore */ }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useWinterMode(): { season: boolean; enabled: boolean; active: boolean; setEnabled: (on: boolean) => void } {
  const [season] = useState(() => isWinterSeason());
  const [enabled, setEnabledState] = useState(() => getWinterPref());

  useEffect(() => {
    const update = () => setEnabledState(getWinterPref());
    window.addEventListener(WINTER_PREF_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(WINTER_PREF_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => setWinterPref(on), []);
  return { season, enabled, active: season && enabled, setEnabled };
}
