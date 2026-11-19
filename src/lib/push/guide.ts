// När guiden "Notiser" visas automatiskt, och enhetens lokala tillstånd. Samma mönster som src/lib/calendar/popup.ts.
import { addDaysIso } from '@/lib/schedule/dates';
import type { PushStatus } from './platform';

export const PUSH_AUTO_SHOW_LIMIT = 3;

export interface DevicePushState {
  /** Notiser har slagits på på den här enheten. */
  done: boolean;
  /** "Påminn mig i morgon": visas inte automatiskt före detta datum (ISO). */
  snoozedUntil: string | null;
  /** Antal automatiska visningar på enheten. */
  shownCount: number;
}

export const EMPTY_PUSH_STATE: DevicePushState = { done: false, snoozedUntil: null, shownCount: 0 };

export function pushStorageKey(userName: string): string {
  return `smartklimat_notiser_${userName}`;
}

export function parsePushState(raw: string | null | undefined): DevicePushState {
  if (!raw) return { ...EMPTY_PUSH_STATE };
  try {
    const v = JSON.parse(raw) as Partial<DevicePushState>;
    return {
      done: v.done === true,
      snoozedUntil: typeof v.snoozedUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.snoozedUntil) ? v.snoozedUntil : null,
      shownCount: typeof v.shownCount === 'number' && v.shownCount >= 0 ? Math.floor(v.shownCount) : 0,
    };
  } catch {
    return { ...EMPTY_PUSH_STATE };
  }
}

export interface PushAutoShowInput {
  status: PushStatus;
  state: DevicePushState;
  today: string;
  /** Kalenderguiden visas automatiskt i den här sessionen (bara montörer). */
  calendarGuideThisSession: boolean;
}

/**
 * Guiden visas automatiskt för alla roller tills enheten är klar, högst tre gånger, inte när den är uppskjuten,
 * inte när enheten saknar stöd och inte i en session där kalenderguiden visas automatiskt.
 */
export function shouldAutoShowPushGuide({ status, state, today, calendarGuideThisSession }: PushAutoShowInput): boolean {
  if (calendarGuideThisSession) return false;
  if (status === 'on' || status === 'unsupported') return false;
  if (state.done) return false;
  if (state.snoozedUntil && today < state.snoozedUntil) return false;
  return state.shownCount < PUSH_AUTO_SHOW_LIMIT;
}

export const markPushShown = (s: DevicePushState): DevicePushState => ({ ...s, shownCount: s.shownCount + 1 });
export const snoozePushUntilTomorrow = (s: DevicePushState, today: string): DevicePushState => ({ ...s, snoozedUntil: addDaysIso(today, 1) });
export const markPushDone = (s: DevicePushState): DevicePushState => ({ ...s, done: true });
export const markPushUndone = (s: DevicePushState): DevicePushState => ({ ...s, done: false });

/** Enhetens klarmarkering följer status: på = klar; avstängd eller blockerad efter att ha varit klar = inte klar. */
export function reconcilePushState(state: DevicePushState, status: PushStatus | null): DevicePushState {
  if (status === null) return state;
  if (status === 'on' && !state.done) return markPushDone(state);
  if ((status === 'off' || status === 'blocked') && state.done) return markPushUndone(state);
  return state;
}

export const PUSH_TEXTS = {
  title: 'Notiser',
  intro: 'Få ett meddelande på telefonen eller datorn när någon skriver till dig i chatten, även när appen är stängd.',
  nudge: 'Slå på notiser så missar du inga meddelanden',
  nudgeButton: 'Slå på',
  enable: 'Slå på notiser',
  test: 'Skicka testnotis',
  disable: 'Stäng av på den här enheten',
  snooze: 'Påminn mig i morgon',
  on: 'Notiser är påslagna på den här enheten.',
  unsupported: 'Den här webbläsaren kan inte ta emot notiser. Öppna SmartKlimat N3prenad i Chrome, Edge, Firefox eller Safari, eller från hemskärmen på telefonen.',
  iosSteps: [
    'Tryck på Dela.',
    'Välj Lägg till på hemskärmen.',
    'Öppna SmartKlimat N3prenad från hemskärmen och logga in.',
    'Tryck Slå på notiser där.',
  ],
} as const;

/** Händelse som öppnar guiden "Notiser" (användarmenyn, raden i chattlistan). */
export const OPEN_PUSH_GUIDE_EVENT = 'smartklimat:open-push-guide';
export function openPushGuide() { window.dispatchEvent(new CustomEvent(OPEN_PUSH_GUIDE_EVENT)); }
