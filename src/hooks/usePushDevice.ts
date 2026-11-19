// Enhetens lokala tillstånd för guiden "Notiser" (per användare och enhet), samma mönster som useCalendarDevice.
import { useCallback, useSyncExternalStore } from 'react';
import { parsePushState, pushStorageKey, type DevicePushState } from '@/lib/push/guide';

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; state: DevicePushState }>();

function readDevice(userName: string): DevicePushState {
  const key = pushStorageKey(userName);
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* privat läge */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.state;
  const state = parsePushState(raw);
  cache.set(key, { raw, state });
  return state;
}

function writeDevice(userName: string, update: (s: DevicePushState) => DevicePushState) {
  const prev = readDevice(userName);
  const next = update(prev);
  if (next === prev) return;
  try { localStorage.setItem(pushStorageKey(userName), JSON.stringify(next)); } catch { /* privat läge */ }
  listeners.forEach((l) => l());
}

export function usePushDevice(userName: string) {
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l);
    window.addEventListener('storage', l);
    return () => { listeners.delete(l); window.removeEventListener('storage', l); };
  }, []);
  const state = useSyncExternalStore(subscribe, () => readDevice(userName), () => readDevice(userName));
  const update = useCallback((fn: (s: DevicePushState) => DevicePushState) => writeDevice(userName, fn), [userName]);
  return [state, update] as const;
}
