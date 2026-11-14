// Bokningspanelens och detaljpanelens regler och texter. Ren logik.
import { MAX_MONTAGE_DAYS, suggestedMontageDays } from './dates';
import type { ScheduleEvent } from './events';
import type { QueueItem } from './queues';
import { montageDaysOf, type ScheduleCase } from './types';
import { dayLabel, daysWord } from './labels';

export type BookingMode = 'bookKm' | 'bookMontage' | 'setMontageDate' | 'rescheduleMontage' | 'rescheduleKm';

export const BOOKING_TITLES: Record<BookingMode, string> = {
  bookKm: 'Boka KM',
  bookMontage: 'Boka montage',
  setMontageDate: 'Sätt montagedatum',
  rescheduleMontage: 'Boka om montage',
  rescheduleKm: 'Boka om KM',
};

export function bookingKind(mode: BookingMode): 'km' | 'montage' {
  return mode === 'bookKm' || mode === 'rescheduleKm' ? 'km' : 'montage';
}

/** Kön avgör läget: KM (även KM utan datum) bokas, montage bokas eller får datum. */
export function bookingModeForQueue(item: Pick<QueueItem, 'kind' | 'queue'>): BookingMode {
  if (item.kind === 'km') return 'bookKm';
  return item.queue === 'datum' ? 'setMontageDate' : 'bookMontage';
}

export function rescheduleModeFor(event: Pick<ScheduleEvent, 'kind'>): BookingMode | null {
  if (event.kind === 'montage') return 'rescheduleMontage';
  if (event.kind === 'km') return 'rescheduleKm';
  return null;
}

export interface SmsOption { show: boolean; label: string; defaultOn: boolean }

export function smsOption(mode: BookingMode, status: string): SmsOption {
  switch (mode) {
    case 'bookMontage': return { show: true, label: 'SMS till kunden om bokat montage', defaultOn: true };
    case 'setMontageDate': return { show: status !== 'montage_pagar', label: 'SMS till kunden om bokat montage', defaultOn: false };
    case 'rescheduleMontage': return { show: true, label: 'SMS till kunden om den nya dagen', defaultOn: false };
    default: return { show: false, label: '', defaultOn: false };
  }
}

/** Primärknappen: "Boka montage ons 18 nov", "Boka KM tors 19 nov" eller "Spara ny dag". */
export function submitLabel(mode: BookingMode, date: string | null, today: string): string {
  const day = date ? ` ${dayLabel(date, today)}` : '';
  if (mode === 'bookMontage') return `Boka montage${day}`;
  if (mode === 'bookKm') return `Boka KM${day}`;
  return 'Spara ny dag';
}

/** Förvalt antal arbetsdagar: vid ombokning ärendets värde, annars förslaget från enheterna. */
export function defaultDays(mode: BookingMode, c: ScheduleCase): number {
  if (mode === 'rescheduleMontage') return montageDaysOf(c) ?? 1;
  return montageDaysOf(c) ?? suggestedMontageDays(c.units);
}

export function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_MONTAGE_DAYS, Math.max(1, Math.round(n)));
}

/** "Förslag: 2 dagar för 9 enheter. Helger räknas inte." */
export function daysHint(units: number | null | undefined): string {
  const n = suggestedMontageDays(units);
  if (!units || units <= 0) return `Förslag: ${daysWord(n)}. Helger räknas inte.`;
  return `Förslag: ${daysWord(n)} för ${units} ${units === 1 ? 'enhet' : 'enheter'}. Helger räknas inte.`;
}

/** Visas när bokningen byter team; null när teamet inte ändras eller ärendet saknar team. */
export function teamChangeNotice(oldTeam: string | null | undefined, newTeam: string | null | undefined): string | null {
  const from = oldTeam || null;
  const to = newTeam || null;
  if (!from || from === to) return null;
  return `Ärendet står på ${from}. Teamet byts till ${to ?? 'Inget team'} när du bokar.`;
}

const HEADS: Record<BookingMode, string> = {
  bookMontage: 'Montage bokat',
  setMontageDate: 'Montagedatum satt',
  rescheduleMontage: 'Montage ombokat',
  bookKm: 'KM bokad',
  rescheduleKm: 'KM ombokad',
};

/** Bekräftelsen ovanför tavlan; speglar vad som faktiskt skickades. */
export const LOCAL_CONFIRMATION_TAIL = 'Mejl och SMS skickas inte i testmiljön.';

export function confirmationText(p: { mode: BookingMode; date: string; team: string | null; teamMailed: boolean; smsSent: boolean; local?: boolean; today: string }): string {
  const head = `${HEADS[p.mode]} ${dayLabel(p.date, p.today)}${p.team ? ` · ${p.team}` : ''}.`;
  let tail: string;
  if (p.local) tail = LOCAL_CONFIRMATION_TAIL;
  else if (p.teamMailed && p.smsSent) tail = 'Teamet har fått mejl och kunden SMS.';
  else if (p.teamMailed) tail = 'Teamet har fått mejl.';
  else if (p.smsSent) tail = 'Kunden har fått SMS. Inget mejl gick till teamet.';
  else tail = 'Inget mejl gick till teamet.';
  return `${head} ${tail}`;
}

const MONTAGE_EARLY_STATUSES = new Set(['km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'leverans_klar']);

export interface DetailActions { reschedule: boolean; changeTeam: boolean; open: boolean; unbook: boolean }

/** Knapparna i bokningens detaljer, efter typ och status. */
export function detailActions(event: Pick<ScheduleEvent, 'kind' | 'status' | 'state'>): DetailActions {
  const none = { reschedule: false, changeTeam: false, open: true, unbook: false };
  if (event.kind === 'montage') {
    if (event.status === 'montage_bokat') return { reschedule: true, changeTeam: true, open: true, unbook: true };
    if (event.status === 'montage_pagar') return { ...none, reschedule: true };
    // Montage med datum i en tidigare status kan flyttas och byta team, men inte avbokas.
    if (event.status && MONTAGE_EARLY_STATUSES.has(event.status)) return { reschedule: true, changeTeam: true, open: true, unbook: false };
    return none;
  }
  if (event.kind === 'km') {
    if (event.status === 'km_bokad' || event.status === 'vantar_km') return { reschedule: true, changeTeam: true, open: true, unbook: true };
    return none;
  }
  return none;
}

export const UNBOOK_TITLE = 'Ta bort bokningen?';
export const UNBOOK_TEXT = 'Ärendet läggs tillbaka i kön Att boka och teamet får mejl. Kunden får inget SMS, kontakta kunden själv.';
export const BOOKING_FOOTNOTE = 'Teamet får mejl direkt och bokningen syns i deras kalender.';
