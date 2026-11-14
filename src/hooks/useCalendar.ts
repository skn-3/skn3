// Data för kalenderguiden, banderollen och popupen. Kalendertabellerna saknas i den genererade
// typen tills utkastet godkänts; raderna typas i src/lib/calendar/types.ts.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCases, fetchCasesForMontor } from '@/lib/supabaseClient';
import { feedEvents, feedHttpsUrl, guidePageUrl, upcomingFeedEvents, webcalUrl, type FeedCase, type FeedRole } from '@/lib/calendarFeed';
import { deviceStorageKey, parseDeviceState, type DeviceCalendarState } from '@/lib/calendar/popup';
import type { CalendarConnectionRow, CalendarSettingsRow } from '@/lib/calendar/types';
import type { PreviewRow } from '@/lib/calendar/guide';
import { dayLabel, toIso, withScheduleFields } from '@/lib/schedule';
import type { UserRole } from '@/lib/constants';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'gzeovhwoouoxfenaxsss';

/** Enda stället där kalendertabellerna nås utan genererad typ. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: 'calendar_connections' | 'calendar_settings' | 'user_calendar_tokens') => (supabase as any).from(name);

export function calendarLinks(token: string | null | undefined) {
  if (!token) return { feedUrl: null, webcal: null, guideUrl: null };
  const feedUrl = feedHttpsUrl(`https://${PROJECT_ID}.supabase.co`, token);
  return { feedUrl, webcal: webcalUrl(feedUrl), guideUrl: guidePageUrl(token) };
}

/** Egen token: läses och skapas som tidigare (egen rad i user_calendar_tokens). */
export function useOwnCalendarToken(userName: string, enabled: boolean) {
  return useQuery({
    queryKey: ['calendar-token', userName],
    enabled: enabled && !!userName,
    staleTime: Infinity,
    queryFn: async (): Promise<string> => {
      const { data } = await table('user_calendar_tokens').select('token').eq('user_name', userName).maybeSingle();
      if (data?.token) return data.token as string;
      const { data: ins, error } = await table('user_calendar_tokens').insert({ user_name: userName }).select('token').single();
      if (error) throw error;
      return ins.token as string;
    },
  });
}

export async function readOwnConnection(userName: string): Promise<CalendarConnectionRow | null> {
  const { data, error } = await table('calendar_connections').select('user_name,last_fetched_at,last_client').eq('user_name', userName).maybeSingle();
  if (error) throw error;
  return (data as CalendarConnectionRow | null) ?? null;
}

/** Egen rad i calendar_connections. undefined = inte läst (eller tabellen saknas). */
export function useCalendarConnection(userName: string, enabled = true) {
  const q = useQuery({
    queryKey: ['calendar-connection', userName],
    enabled: enabled && !!userName,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: () => readOwnConnection(userName),
  });
  return q.isSuccess ? q.data : undefined;
}

/** calendar_settings.popup_enabled; null när den inte går att läsa (räknas då som på). */
export function useCalendarSettings(enabled = true) {
  return useQuery({
    queryKey: ['calendar-settings'],
    enabled,
    retry: false,
    queryFn: async (): Promise<CalendarSettingsRow | null> => {
      const { data, error } = await table('calendar_settings').select('id,popup_enabled,updated_at,updated_by').eq('id', true).maybeSingle();
      if (error) return null;
      return (data as CalendarSettingsRow | null) ?? null;
    },
  });
}

export async function updatePopupEnabled(enabled: boolean, by: string) {
  const { error } = await table('calendar_settings').update({ popup_enabled: enabled, updated_at: new Date().toISOString(), updated_by: by }).eq('id', true);
  if (error) throw error;
}

// --- Enhetens lokala tillstånd (per användare och enhet) ---------------------------------

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; state: DeviceCalendarState }>();

function readDevice(userName: string): DeviceCalendarState {
  const key = deviceStorageKey(userName);
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { /* privat läge */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.state;
  const state = parseDeviceState(raw);
  cache.set(key, { raw, state });
  return state;
}

export function writeDevice(userName: string, update: (s: DeviceCalendarState) => DeviceCalendarState) {
  const next = update(readDevice(userName));
  try { localStorage.setItem(deviceStorageKey(userName), JSON.stringify(next)); } catch { /* privat läge */ }
  listeners.forEach((l) => l());
}

export function useCalendarDevice(userName: string) {
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l);
    const onStorage = () => l();
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
  }, []);
  const state = useSyncExternalStore(subscribe, () => readDevice(userName), () => readDevice(userName));
  const update = useCallback((fn: (s: DeviceCalendarState) => DeviceCalendarState) => writeDevice(userName, fn), [userName]);
  return [state, update] as const;
}

// --- Förhandsvisning i guiden ------------------------------------------------------------

/** Användarens två nästa bokningar och antal bokningar framåt, med samma urval som flödet. */
export function useCalendarPreview(role: UserRole, enabled: boolean): { rows: PreviewRow[]; count: number | null } {
  const montor = role.type === 'montor';
  const q = useQuery({
    queryKey: montor ? ['cases', 'montor', role.isAdmin ? 'admin' : role.name] : ['cases', 'schedule'],
    queryFn: montor ? fetchCasesForMontor : fetchAllCases,
    enabled,
  });
  return useMemo(() => {
    if (!q.data) return { rows: [], count: null };
    const today = toIso(new Date());
    const cases = (q.data as object[]).map((c) => withScheduleFields(c)) as unknown as FeedCase[];
    const upcoming = upcomingFeedEvents(feedEvents(cases, { name: role.name, role: role.type as FeedRole }, today), today);
    return {
      rows: upcoming.slice(0, 2).map((e) => ({ title: e.summary, sub: `${dayLabel(e.date, today)}${e.time ? `, ${e.time}` : ''}` })),
      count: upcoming.length,
    };
  }, [q.data, role.name, role.type]);
}

export function useInvalidateCalendar() {
  const qc = useQueryClient();
  return (userName: string) => qc.invalidateQueries({ queryKey: ['calendar-connection', userName] });
}
