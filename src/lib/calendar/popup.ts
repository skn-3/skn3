// När kalenderguiden visas automatiskt för montörer, och enhetens lokala tillstånd. Ren logik.
import { STALE_DAYS, isConnected, type ConnectionRow } from '@/lib/calendarFeed';
import { addDaysIso } from '@/lib/schedule/dates';
import type { RoleType } from '@/lib/constants';

export const AUTO_SHOW_LIMIT = 3;
const DAY_MS = 86_400_000;

export interface DeviceCalendarState {
  /** Klart-läget har nåtts på den här enheten. */
  done: boolean;
  /** "Påminn mig i morgon": visas inte automatiskt före detta datum (ISO). */
  snoozedUntil: string | null;
  /** Antal automatiska visningar på enheten. */
  shownCount: number;
  /** Klarmarkeringen togs bort för att ingen kalender hämtat på två veckor. */
  stale: boolean;
  /** Tidpunkt (ms) när användaren startade en koppling (Lägg till, Skicka länken, Kopiera). */
  pendingSince: number | null;
}

export const EMPTY_DEVICE_STATE: DeviceCalendarState = { done: false, snoozedUntil: null, shownCount: 0, stale: false, pendingSince: null };

export function deviceStorageKey(userName: string): string {
  return `smartklimat_kalender_${userName}`;
}

export function parseDeviceState(raw: string | null | undefined): DeviceCalendarState {
  if (!raw) return { ...EMPTY_DEVICE_STATE };
  try {
    const v = JSON.parse(raw) as Partial<DeviceCalendarState>;
    return {
      done: v.done === true,
      snoozedUntil: typeof v.snoozedUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.snoozedUntil) ? v.snoozedUntil : null,
      shownCount: typeof v.shownCount === 'number' && v.shownCount >= 0 ? Math.floor(v.shownCount) : 0,
      stale: v.stale === true,
      pendingSince: typeof v.pendingSince === 'number' && Number.isFinite(v.pendingSince) ? v.pendingSince : null,
    };
  } catch {
    return { ...EMPTY_DEVICE_STATE };
  }
}

export interface AutoShowInput {
  role: RoleType;
  /** calendar_settings.popup_enabled; går den inte att läsa (null/undefined) räknas den som på. */
  popupEnabled: boolean | null | undefined;
  state: DeviceCalendarState;
  today: string;
}

/** Popupen visas automatiskt bara för montörer, när den är på, enheten inte är klar, inte uppskjuten och visats färre än tre gånger. */
export function shouldAutoShowGuide({ role, popupEnabled, state, today }: AutoShowInput): boolean {
  if (role !== 'montor') return false;
  if (popupEnabled === false) return false;
  if (state.done) return false;
  if (state.snoozedUntil && today < state.snoozedUntil) return false;
  return state.shownCount < AUTO_SHOW_LIMIT;
}

export const markShown = (s: DeviceCalendarState): DeviceCalendarState => ({ ...s, shownCount: s.shownCount + 1 });
export const snoozeUntilTomorrow = (s: DeviceCalendarState, today: string): DeviceCalendarState => ({ ...s, snoozedUntil: addDaysIso(today, 1) });
export const markDone = (s: DeviceCalendarState): DeviceCalendarState => ({ ...s, done: true, stale: false, pendingSince: null });
export const markPending = (s: DeviceCalendarState, nowMs: number): DeviceCalendarState => ({ ...s, pendingSince: nowMs });

/**
 * Stämmer av enhetens tillstånd mot serverns senaste hämtning (row undefined = okänt, inget ändras):
 * - klar men ingen kalenderklient har hämtat på 14 dagar: klarmarkeringen tas bort och stale sätts;
 * - inte klar men en kalender har hämtat efter att kopplingen startades på enheten: klar.
 */
export function reconcileDeviceState(state: DeviceCalendarState, row: ConnectionRow | null | undefined, now: Date): DeviceCalendarState {
  if (row === undefined) return state;
  const t = row?.last_fetched_at ? Date.parse(row.last_fetched_at) : NaN;
  if (state.done) {
    // Ingen hämtning alls på servern (raden saknas eller ny länk): enheten är inte längre klar.
    if (!Number.isFinite(t)) return { ...state, done: false, stale: true };
    if (Number.isFinite(t) && now.getTime() - t > STALE_DAYS * DAY_MS) return { ...state, done: false, stale: true };
    return state;
  }
  if (state.pendingSince && Number.isFinite(t) && t > state.pendingSince - 5000 && isConnected(row, now)) return markDone(state);
  return state;
}

export const BANNER_TEXTS = {
  title: 'Få schemat i telefonens kalender',
  text: 'Du gör det en gång.',
  stale: 'Kalendern har inte hämtat schemat på två veckor. Lägg till den igen.',
  button: 'Lägg till',
} as const;

/** Banderollen och pricken på fliken visas tills enheten är klar. */
export function needsCalendar(state: DeviceCalendarState): boolean {
  return !state.done;
}
