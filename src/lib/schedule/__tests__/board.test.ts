import { describe, expect, it } from 'vitest';
import { buildScheduleEvents } from '../events';
import { weekDates } from '../dates';
import { findConflicts } from '../conflicts';
import { buildQueues } from '../queues';
import {
  EMPTY_FILTER, buildBoardRows, capacityBars, conflictChip, filterEvents, filterLabel, placementCells, placementPrompt, summaryText, weekSummary,
} from '../board';
import type { ScheduleCase } from '../types';

const T = '2026-11-14';
const w47 = weekDates(2026, 47); // 16–22 nov
const c = (id: string, extra: Partial<ScheduleCase>): ScheduleCase => ({ id, status: 'montage_bokat', address: id, city: 'Sala', ...extra });

describe('filters', () => {
  const events = buildScheduleEvents([
    c('a', { team: 'Samy', seller: 'Daniel Malke', montage_date: '2026-11-17' }),
    c('b', { status: 'km_bokad', km_team: 'GVMO', seller: 'Gabriel Hanna', km_date: '2026-11-17' }),
  ]);
  it('filters on kind, team and seller', () => {
    expect(filterEvents(events, { ...EMPTY_FILTER, kinds: ['km'] }).map(e => e.id)).toEqual(['b-km']);
    expect(filterEvents(events, { ...EMPTY_FILTER, teams: ['Samy'] }).map(e => e.id)).toEqual(['a-montage']);
    expect(filterEvents(events, { ...EMPTY_FILTER, sellers: ['Gabriel Hanna'] }).map(e => e.id)).toEqual(['b-km']);
  });
  it('labels the filter button', () => {
    expect(filterLabel({ teams: [], sellers: [] })).toBe('Alla team');
    expect(filterLabel({ teams: ['Samy'], sellers: [] })).toBe('Samy');
    expect(filterLabel({ teams: ['Samy', 'GVMO', 'Jerk'], sellers: [] })).toBe('3 team');
    expect(filterLabel({ teams: [], sellers: ['A', 'B'] })).toBe('2 säljare');
    expect(filterLabel({ teams: ['A', 'B'], sellers: ['C'] })).toBe('2 team · 1 säljare');
  });
});

describe('buildBoardRows', () => {
  it('sorts teams by name and shows Ej tilldelat only with bookings or while placing KM', () => {
    const events = buildScheduleEvents([c('a', { team: 'Samy', montage_date: '2026-11-17' })]);
    const rows = buildBoardRows({ events, weekDates: w47, teamNames: ['Tomek', 'Alex NBD', 'Samy'], filter: EMPTY_FILTER });
    expect(rows.map(r => r.label)).toEqual(['Logistik', 'Alex NBD', 'Samy', 'Tomek']);
    const placing = buildBoardRows({ events, weekDates: w47, teamNames: ['Samy'], filter: EMPTY_FILTER, placingKm: true });
    expect(placing.map(r => r.label)).toEqual(['Logistik', 'Samy', 'Ej tilldelat']);
  });
  it('merges week-based deliveries into one bar per week', () => {
    const events = buildScheduleEvents([
      c('a', { status: 'godkand', delivery_week: 47, delivery_year: 2026 }),
      c('b', { status: 'godkand', delivery_week: 47, delivery_year: 2026 }),
      c('d', { status: 'godkand', delivery_date: '2026-11-18' }),
    ]);
    const [logistik] = buildBoardRows({ events, weekDates: w47, teamNames: [], filter: EMPTY_FILTER });
    expect(logistik.segments).toHaveLength(2);
    const group = Object.values(logistik.groups)[0];
    expect(group.week).toBe(47);
    expect(group.events.map(e => e.caseId)).toEqual(['a', 'b']);
    const bar = logistik.segments.find(s => s.event.id === 'leveransvecka-2026-47')!;
    expect([bar.start, bar.span]).toEqual([0, 5]);
  });
});

describe('summary and conflicts', () => {
  const events = buildScheduleEvents([
    c('a', { team: 'Alex NBD', montage_date: '2026-11-19', montage_days: 2 }),
    c('b', { team: 'Alex NBD', montage_date: '2026-11-20' }),
    c('p', { status: 'montage_pagar', team: 'Samy', montage_date: '2026-11-16', montage_days: 2 }),
    c('k', { status: 'km_bokad', km_date: '2026-11-17' }),
    c('l', { status: 'godkand', delivery_date: '2026-11-18' }),
  ]);
  it('counts today and the week', () => {
    const s = weekSummary(events, w47, '2026-11-17');
    expect(s).toEqual({ todayMontage: 1, todayKm: 1, weekMontage: 3, weekKm: 1, weekDeliveries: 1 });
    expect(summaryText(s)).toBe('Idag: 1 montage pågår · 1 KM. Veckan: 3 montage · 1 KM · 1 leverans.');
  });
  it('conflict chip names team and weekday', () => {
    expect(conflictChip(findConflicts(events), w47)).toEqual({ text: '1 krock: Alex NBD fre', eventId: 'a-montage' });
    expect(conflictChip(findConflicts(events), weekDates(2026, 46))).toBeNull();
  });
  it('capacity bars mark weekdays with montage', () => {
    expect(capacityBars(events, w47, 'Alex NBD')).toEqual([false, false, false, true, true]);
  });
});

describe('placement', () => {
  it('evaluates team rows, skips Logistik, and blocks before delivery', () => {
    const cs = [c('m', { status: 'leverans_klar', team: 'Samy', delivery_date: '2026-11-18', units: 5, created_at: '2026-11-01' })];
    const events = buildScheduleEvents(cs);
    const rows = buildBoardRows({ events, weekDates: w47, teamNames: ['Samy'], filter: EMPTY_FILTER });
    const cells = placementCells({ rows, weekDates: w47, caseData: cs[0], kind: 'montage', days: 1, events, today: T });
    expect(Object.keys(cells)).toEqual(['team:Samy']);
    expect(cells['team:Samy'].map(r => r.level)).toEqual(['blocked', 'blocked', 'ok', 'ok', 'ok', 'warn', 'warn']);
  });
  it('KM placement includes Ej tilldelat', () => {
    const cs = [c('k', { status: 'vantar_km' })];
    const rows = buildBoardRows({ events: [], weekDates: w47, teamNames: ['Samy'], filter: EMPTY_FILTER, placingKm: true });
    const cells = placementCells({ rows, weekDates: w47, caseData: cs[0], kind: 'km', events: [], today: T });
    expect(Object.keys(cells)).toEqual(['team:Samy', 'ej_tilldelat']);
  });
  it('prompt follows the delivery', () => {
    const q = buildQueues([
      c('m', { status: 'i_produktion', team: 'Samy', delivery_date: '2026-11-18', created_at: '2026-11-01' }),
    ], T).montage[0];
    expect(placementPrompt(q, w47, T)).toEqual({ lead: 'Placera montage: m, Sala.', hint: 'Leverans 18 nov. Tryck på en dag från ons 18 nov.' });
    expect(placementPrompt(q, weekDates(2026, 46), T).hint).toBe('Leverans 18 nov. Tidigast ons 18 nov, byt vecka med pilarna.');
    const km = buildQueues([c('k', { status: 'vantar_km', created_at: '2026-11-01' })], T).km[0];
    expect(placementPrompt(km, w47, T)).toEqual({ lead: 'Placera KM: k, Sala.', hint: 'Tryck på en dag i schemat.' });
  });
});
