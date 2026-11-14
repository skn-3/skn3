import { describe, expect, it } from 'vitest';
import {
  bookingModeForQueue, clampDays, confirmationText, daysHint, defaultDays, detailActions, smsOption, submitLabel, teamChangeNotice,
} from '../bookingForm';
import { QUEUE_HELP, queueCardMeta, searchQueue, waitIsLong, waitLabel } from '../queueView';
import { effectiveView, parseStoredView, availableViews } from '../viewPrefs';
import type { QueueItem } from '../queues';

const T = '2026-11-14';

describe('booking form rules', () => {
  it('mode per queue', () => {
    expect(bookingModeForQueue({ kind: 'km', queue: 'km' })).toBe('bookKm');
    expect(bookingModeForQueue({ kind: 'km', queue: 'datum' })).toBe('bookKm');
    expect(bookingModeForQueue({ kind: 'montage', queue: 'montage' })).toBe('bookMontage');
    expect(bookingModeForQueue({ kind: 'montage', queue: 'datum' })).toBe('setMontageDate');
  });
  it('SMS checkbox per mode', () => {
    expect(smsOption('bookMontage', 'leverans_klar')).toEqual({ show: true, label: 'SMS till kunden om bokat montage', defaultOn: true });
    expect(smsOption('setMontageDate', 'montage_bokat')).toEqual({ show: true, label: 'SMS till kunden om bokat montage', defaultOn: false });
    expect(smsOption('setMontageDate', 'montage_pagar').show).toBe(false);
    expect(smsOption('rescheduleMontage', 'montage_bokat')).toEqual({ show: true, label: 'SMS till kunden om den nya dagen', defaultOn: false });
    expect(smsOption('bookKm', 'vantar_km').show).toBe(false);
  });
  it('submit labels', () => {
    expect(submitLabel('bookMontage', '2026-11-18', T)).toBe('Boka montage ons 18 nov');
    expect(submitLabel('bookKm', '2026-11-19', T)).toBe('Boka KM tors 19 nov');
    expect(submitLabel('rescheduleMontage', '2026-11-19', T)).toBe('Spara ny dag');
    expect(submitLabel('setMontageDate', '2026-11-19', T)).toBe('Spara ny dag');
  });
  it('default days: suggestion from units, the case value when rescheduling', () => {
    expect(defaultDays('bookMontage', { id: 'a', status: 'godkand', units: 9 })).toBe(2);
    expect(defaultDays('rescheduleMontage', { id: 'a', status: 'montage_bokat', units: 9 })).toBe(1);
    expect(defaultDays('rescheduleMontage', { id: 'a', status: 'montage_bokat', units: 9, montage_days: 3 })).toBe(3);
    expect(clampDays(0)).toBe(1);
    expect(clampDays(31)).toBe(30);
  });
  it('hint and team change notice', () => {
    expect(daysHint(9)).toBe('Förslag: 2 dagar för 9 enheter. Helger räknas inte.');
    expect(daysHint(null)).toBe('Förslag: 1 dag. Helger räknas inte.');
    expect(teamChangeNotice('Samy', 'GVMO')).toBe('Ärendet står på Samy. Teamet byts till GVMO när du bokar.');
    expect(teamChangeNotice('Samy', 'Samy')).toBeNull();
    expect(teamChangeNotice(null, 'Samy')).toBeNull();
  });
  it('confirmation mirrors what was sent', () => {
    const base = { mode: 'bookMontage' as const, date: '2026-11-18', team: 'Samy', today: T };
    expect(confirmationText({ ...base, teamMailed: true, smsSent: true })).toBe('Montage bokat ons 18 nov · Samy. Teamet har fått mejl och kunden SMS.');
    expect(confirmationText({ ...base, teamMailed: true, smsSent: false })).toBe('Montage bokat ons 18 nov · Samy. Teamet har fått mejl.');
    expect(confirmationText({ ...base, teamMailed: false, smsSent: false, local: true })).toBe('Montage bokat ons 18 nov · Samy. Mejl och SMS skickas inte i testmiljön.');
    expect(confirmationText({ ...base, teamMailed: false, smsSent: false })).toBe('Montage bokat ons 18 nov · Samy. Inget mejl gick till teamet.');
    expect(confirmationText({ mode: 'bookKm', date: '2026-11-19', team: null, today: T, teamMailed: false, smsSent: false })).toBe('KM bokad tors 19 nov. Inget mejl gick till teamet.');
  });
  it('detail buttons per kind and status', () => {
    const all = { reschedule: true, changeTeam: true, open: true, unbook: true };
    const openOnly = { reschedule: false, changeTeam: false, open: true, unbook: false };
    expect(detailActions({ kind: 'montage', status: 'montage_bokat', state: 'bokad' })).toEqual(all);
    expect(detailActions({ kind: 'montage', status: 'montage_pagar', state: 'pagar' })).toEqual({ ...openOnly, reschedule: true });
    expect(detailActions({ kind: 'montage', status: 'montage_klart', state: 'klar' })).toEqual(openOnly);
    expect(detailActions({ kind: 'km', status: 'km_bokad', state: 'bokad' })).toEqual(all);
    expect(detailActions({ kind: 'km', status: 'km_klar', state: 'klar' })).toEqual(openOnly);
    expect(detailActions({ kind: 'leverans', status: 'godkand', state: 'bokad' })).toEqual(openOnly);
    expect(detailActions({ kind: 'hamtning', status: 'montage_klart', state: 'bokad' })).toEqual(openOnly);
  });
});

describe('queue view', () => {
  const item = (extra: Partial<QueueItem>): QueueItem => ({
    caseId: 'a', queue: 'km', kind: 'km', status: 'vantar_km', address: 'Lindvägen 3', city: 'Sala', customerName: 'Anna Berg', units: 4,
    seller: 'Daniel Malke', team: null, waitingDays: 3, deliveryLabel: null, suggestedDays: null, waitingSince: null, deliveryStart: null, ...extra,
  });
  it('help texts are exact', () => {
    expect(QUEUE_HELP.km).toBe('Väntar på kontrollmätning, äldst först. Välj ett ärende och tryck sedan på en dag i schemat.');
    expect(QUEUE_HELP.montage).toBe('Godkända ärenden utan montagedatum. Dagar före leveransen går inte att välja.');
    expect(QUEUE_HELP.datum).toBe('Står som Montage bokat eller pågår men saknar datum. Sätt dagen här.');
  });
  it('search on address, city and customer', () => {
    const items = [item({ caseId: 'a' }), item({ caseId: 'b', address: 'Kvarngatan 1', city: 'Enköping', customerName: 'Per Holm' })];
    expect(searchQueue(items, 'kvarn').map(i => i.caseId)).toEqual(['b']);
    expect(searchQueue(items, 'SALA').map(i => i.caseId)).toEqual(['a']);
    expect(searchQueue(items, 'holm').map(i => i.caseId)).toEqual(['b']);
    expect(searchQueue(items, ' ').length).toBe(2);
  });
  it('card meta and waiting chip', () => {
    expect(queueCardMeta(item({}))).toBe('Sala · säljare Daniel');
    expect(waitLabel(1)).toBe('Väntat 1 dag');
    expect(waitIsLong(13)).toBe(false);
    expect(waitIsLong(14)).toBe(true);
  });
});

describe('view prefs', () => {
  it('phone never shows the week board', () => {
    expect(effectiveView(null, false)).toBe('vecka');
    expect(effectiveView(null, true)).toBe('lista');
    expect(effectiveView('vecka', true)).toBe('lista');
    expect(effectiveView('manad', true)).toBe('manad');
    expect(availableViews(true)).toEqual(['manad', 'lista']);
    expect(parseStoredView('nonsens')).toBeNull();
    expect(parseStoredView('manad')).toBe('manad');
  });
});
