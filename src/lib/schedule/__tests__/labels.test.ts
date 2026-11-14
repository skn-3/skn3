import { describe, expect, it } from 'vitest';
import { buildScheduleEvents } from '../events';
import { weekDates } from '../dates';
import { dateRangeLabel, dayGroupTitle, dayLabel, eventLine, monthTitle, teamLoadLabel, weekRangeLabel, whenLabel } from '../labels';
import type { ScheduleCase } from '../types';

const T = '2026-11-14';
const c = (id: string, extra: Partial<ScheduleCase>): ScheduleCase => ({ id, status: 'montage_bokat', address: 'Lindvägen 3', city: 'Västerås', units: 9, ...extra });

describe('labels', () => {
  it('week range within a month and across months', () => {
    expect(weekRangeLabel(weekDates(2026, 47))).toBe('16–22 november');
    expect(weekRangeLabel(weekDates(2026, 49))).toBe('30 nov – 6 dec');
  });
  it('month title, group title and day label', () => {
    expect(monthTitle(2026, 11)).toBe('november 2026');
    expect(dayGroupTitle('2026-11-17')).toBe('tisdag 17 november');
    expect(dayLabel('2026-11-18', T)).toBe('ons 18 nov');
  });
  it('date ranges', () => {
    expect(dateRangeLabel(['2026-11-18', '2026-11-19'], T)).toBe('ons 18 – tors 19 nov');
    expect(dateRangeLabel(['2026-11-16', '2026-11-17', '2026-11-18'], T)).toBe('mån 16 – ons 18 nov');
    expect(dateRangeLabel(['2026-11-27', '2026-11-30', '2026-12-01'], T)).toBe('fre 27 nov – tis 1 dec');
  });
  it('event second lines', () => {
    const [m] = buildScheduleEvents([c('a', { team: 'Samy', montage_date: '2026-11-18' })]);
    expect(eventLine(m)).toBe('Montage · 9 enh · Västerås');
    const [done] = buildScheduleEvents([c('b', { status: 'montage_klart', team: 'Samy', montage_date: '2026-11-18' })]);
    expect(eventLine(done)).toBe('Montage klart · 9 enh · Västerås');
    const [km] = buildScheduleEvents([c('k', { status: 'km_bokad', km_date: '2026-11-18' })]);
    expect(eventLine(km)).toBe('KM heldag · Västerås');
    const [kmT] = buildScheduleEvents([c('k', { status: 'km_bokad', km_date: '2026-11-18', km_time: '08:00:00' })]);
    expect(eventLine(kmT)).toBe('KM 08:00 · Västerås');
    const ev = buildScheduleEvents([c('l', { status: 'godkand', delivery_date: '2026-11-18', delivery_time: '10:00:00', waste_pickup_date: '2026-11-19' })]);
    expect(ev.map(eventLine)).toEqual(['Leverans 10:00 · Västerås', 'Ragn-Sells hämtar · Västerås']);
  });
  it('when label with time and for week-based delivery', () => {
    const [m] = buildScheduleEvents([c('a', { team: 'Samy', montage_date: '2026-11-16', montage_days: 3, montage_time: '07:00:00' })]);
    expect(whenLabel(m, T)).toBe('mån 16 – ons 18 nov, 07:00');
    const [lev] = buildScheduleEvents([c('l', { status: 'godkand', delivery_week: 47, delivery_year: 2026 })]);
    expect(whenLabel(lev, T)).toBe('v.47, exakt dag saknas');
  });
  it('team load', () => {
    expect(teamLoadLabel({ montageDays: 3, kmCount: 2 })).toBe('3 av 5 dagar montage · 2 KM');
  });
});
