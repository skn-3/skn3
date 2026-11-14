import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../platform';
import { alreadyAddedOk, clientLabel, fetchedSince, googleConnected, googleStep1, previewRows, relativeAgo, EXAMPLE_ROWS } from '../guide';
import {
  AUTO_SHOW_LIMIT, EMPTY_DEVICE_STATE, markDone, markPending, markShown, needsCalendar, parseDeviceState, reconcileDeviceState,
  shouldAutoShowGuide, snoozeUntilTomorrow, type DeviceCalendarState,
} from '../popup';
import { actionFor, lastFetchedText, remindConfirm, remindCount, statusOf, summaryLine } from '../overview';
import type { OverviewRow } from '../types';

const NOW = new Date('2026-11-16T12:00:00Z');
const TODAY = '2026-11-16';

describe('Plattform', () => {
  it('iPhone, iPad och Mac ger Apple, Android ger Google, övriga datorer datorläget', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('apple');
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('apple');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1)')).toBe('apple');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('google');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
  });
});

describe('Guiden', () => {
  it('exempelrader när användaren saknar bokningar, annars de två nästa', () => {
    expect(previewRows([])).toEqual(EXAMPLE_ROWS);
    const own = [{ title: 'a', sub: '1' }, { title: 'b', sub: '2' }, { title: 'c', sub: '3' }];
    expect(previewRows(own)).toEqual(own.slice(0, 2));
  });
  it('steg 1 säger teamets mejl för montörer och din mejl för kontoret', () => {
    expect(googleStep1(true)).toBe('Skicka länken till teamets mejl');
    expect(googleStep1(false)).toBe('Skicka länken till din mejl');
  });
  it('hämtad av och senast', () => {
    expect(clientLabel('apple')).toBe('Apple Kalender');
    expect(clientLabel('google')).toBe('Google Kalender');
    expect(clientLabel('outlook')).toBe('Outlook');
    expect(clientLabel('other')).toBe('Annan kalender');
    expect(relativeAgo('2026-11-16T11:59:30Z', NOW)).toBe('nyss');
    expect(relativeAgo('2026-11-16T11:55:00Z', NOW)).toBe('för 5 min sedan');
    expect(relativeAgo('2026-11-16T10:00:00Z', NOW)).toBe('för 2 tim sedan');
    expect(relativeAgo('2026-11-13T12:00:00Z', NOW)).toBe('för 3 dagar sedan');
  });
  it('väntan lyckas bara på en kalenderhämtning efter trycket', () => {
    const tap = Date.parse('2026-11-16T11:58:00Z');
    expect(fetchedSince({ last_fetched_at: '2026-11-16T11:58:30Z', last_client: 'apple' }, tap)).toBe(true);
    expect(fetchedSince({ last_fetched_at: '2026-11-16T11:50:00Z', last_client: 'apple' }, tap)).toBe(false);
    expect(fetchedSince({ last_fetched_at: '2026-11-16T11:58:30Z', last_client: 'browser' }, tap)).toBe(false);
    expect(fetchedSince(null, tap)).toBe(false);
  });
  it('"Jag har redan lagt till schemat" kräver en kalenderhämtning de senaste 10 dagarna', () => {
    expect(alreadyAddedOk({ last_fetched_at: '2026-11-07T12:00:00Z', last_client: 'google' }, NOW)).toBe(true);
    expect(alreadyAddedOk({ last_fetched_at: '2026-11-05T12:00:00Z', last_client: 'google' }, NOW)).toBe(false);
    expect(alreadyAddedOk(null, NOW)).toBe(false);
  });
  it('Google-läget blir klart först när Google har hämtat', () => {
    expect(googleConnected({ last_fetched_at: '2026-11-16T11:00:00Z', last_client: 'google' }, NOW)).toBe(true);
    expect(googleConnected({ last_fetched_at: '2026-11-16T11:00:00Z', last_client: 'apple' }, NOW)).toBe(false);
  });
});

describe('Popupen för montörer', () => {
  const s = (p: Partial<DeviceCalendarState> = {}): DeviceCalendarState => ({ ...EMPTY_DEVICE_STATE, ...p });
  it('visas för montör när allt gäller', () => {
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: true, state: s(), today: TODAY })).toBe(true);
  });
  it('kontorsroller får ingen popup', () => {
    expect(shouldAutoShowGuide({ role: 'seller', popupEnabled: true, state: s(), today: TODAY })).toBe(false);
    expect(shouldAutoShowGuide({ role: 'coordinator', popupEnabled: true, state: s(), today: TODAY })).toBe(false);
  });
  it('avstängd inställning stoppar, oläslig inställning räknas som på', () => {
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: false, state: s(), today: TODAY })).toBe(false);
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: null, state: s(), today: TODAY })).toBe(true);
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: undefined, state: s(), today: TODAY })).toBe(true);
  });
  it('klarmarkerad enhet får ingen popup', () => {
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: true, state: markDone(s()), today: TODAY })).toBe(false);
  });
  it('"Påminn mig i morgon" skjuter upp till nästa dag', () => {
    const snoozed = snoozeUntilTomorrow(s(), TODAY);
    expect(snoozed.snoozedUntil).toBe('2026-11-17');
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: true, state: snoozed, today: TODAY })).toBe(false);
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: true, state: snoozed, today: '2026-11-17' })).toBe(true);
  });
  it('visas högst tre gånger automatiskt; banderollen ligger kvar', () => {
    let st = s();
    for (let i = 0; i < AUTO_SHOW_LIMIT; i++) st = markShown(st);
    expect(st.shownCount).toBe(3);
    expect(shouldAutoShowGuide({ role: 'montor', popupEnabled: true, state: st, today: TODAY })).toBe(false);
    expect(needsCalendar(st)).toBe(true);
  });
  it('ingen kalenderhämtning på 14 dagar tar bort klarmarkeringen och visar texten om två veckor', () => {
    const done = markDone(s());
    const stale = reconcileDeviceState(done, { last_fetched_at: '2026-11-01T11:00:00Z', last_client: 'apple' }, NOW);
    expect(stale.done).toBe(false);
    expect(stale.stale).toBe(true);
    expect(reconcileDeviceState(done, { last_fetched_at: '2026-11-03T13:00:00Z', last_client: 'apple' }, NOW)).toBe(done);
    expect(reconcileDeviceState(done, undefined, NOW)).toBe(done);
  });
  it('en kalenderhämtning efter att kopplingen startats på enheten klarmarkerar', () => {
    const pending = markPending(s(), Date.parse('2026-11-16T11:00:00Z'));
    expect(reconcileDeviceState(pending, { last_fetched_at: '2026-11-16T11:30:00Z', last_client: 'google' }, NOW).done).toBe(true);
    expect(reconcileDeviceState(pending, { last_fetched_at: '2026-11-16T10:00:00Z', last_client: 'google' }, NOW).done).toBe(false);
    expect(reconcileDeviceState(s(), { last_fetched_at: '2026-11-16T11:30:00Z', last_client: 'google' }, NOW).done).toBe(false);
  });
  it('tillståndet läses tåligt', () => {
    expect(parseDeviceState(null)).toEqual(EMPTY_DEVICE_STATE);
    expect(parseDeviceState('{trasig')).toEqual(EMPTY_DEVICE_STATE);
    expect(parseDeviceState(JSON.stringify({ done: true, shownCount: 2, snoozedUntil: 'x' }))).toEqual({ ...EMPTY_DEVICE_STATE, done: true, shownCount: 2 });
  });
});

describe('Adminöversikten', () => {
  const row = (p: Partial<OverviewRow>): OverviewRow => ({ name: 'GVMO', kind: 'montor', has_email: true, connected: false, last_fetched_at: null, last_client: null, guide_sent_at: null, guide_sent_count: 0, ...p });
  it('status, senast hämtad och åtgärd', () => {
    const c = row({ connected: true, last_fetched_at: '2026-11-16T10:00:00Z', last_client: 'apple' });
    expect(statusOf(c)).toBe('connected');
    expect(lastFetchedText(c, NOW)).toBe('För 2 tim sedan · Apple Kalender');
    expect(actionFor(c)).toEqual({ action: 'rotate', label: 'Ny länk', disabled: false, note: null });

    expect(lastFetchedText(row({ guide_sent_count: 1 }), NOW)).toBe('Påmind 1 gång');
    expect(lastFetchedText(row({ guide_sent_count: 3 }), NOW)).toBe('Påmind 3 gånger');
    expect(lastFetchedText(row({}), NOW)).toBe('Inte påmind');
    expect(actionFor(row({})).label).toBe('Skicka guiden');

    const team = row({ name: 'Tomek', kind: 'team_utan_inloggning' });
    expect(statusOf(team)).toBe('no_login');
    expect(lastFetchedText(team, NOW)).toBe('Kan få schemat via mejl');
    expect(actionFor(team).label).toBe('Mejla länken');
    expect(actionFor({ ...team, has_email: false })).toEqual({ action: 'send', label: 'Mejla länken', disabled: true, note: 'Mejladress saknas' });
  });
  it('sammanfattning och påminn alla', () => {
    const rows = [row({ connected: true }), row({ name: 'Samy' }), row({ name: 'Tomek', kind: 'team_utan_inloggning', has_email: false }), row({ name: 'Daniel Malke', kind: 'seller' })];
    expect(summaryLine(rows)).toBe('1 av 4 har schemat i sin kalender.');
    expect(remindCount(rows)).toBe(1);
    expect(remindConfirm(1)).toBe('Skicka guiden till 1 som saknar koppling?');
  });
});
