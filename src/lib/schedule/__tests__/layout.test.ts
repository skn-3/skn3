import { describe, expect, it } from 'vitest';
import { buildScheduleEvents } from '../events';
import { layoutWeek } from '../layout';
import { weekDates } from '../dates';
import type { ScheduleCase } from '../types';

const w46 = weekDates(2026, 46); // 9–15 nov
const w47 = weekDates(2026, 47);
const c = (id: string, extra: Partial<ScheduleCase>): ScheduleCase => ({ id, status: 'montage_bokat', address: id, ...extra });

describe('layoutWeek', () => {
  it('orders rows: Logistik, given teams, unknown teams with bookings, Ej tilldelat', () => {
    const events = buildScheduleEvents([
      c('a', { team: 'Tomek', montage_date: '2026-11-10' }),
      c('b', { team: 'GVMO', montage_date: '2026-11-10' }),
      c('d', { team: 'Okänd', montage_date: '2026-12-10' }),
      c('e', { status: 'km_bokad', km_date: '2026-11-11' }),
    ]);
    const rows = layoutWeek(events, w46, ['GVMO', 'Samy']);
    expect(rows.map(r => r.label)).toEqual(['Logistik', 'GVMO', 'Samy', 'Tomek', 'Ej tilldelat']);
    expect(rows[4].segments[0].event.id).toBe('e-km');
  });
  it('puts deliveries and pickups on Logistik', () => {
    const events = buildScheduleEvents([c('a', { status: 'godkand', team: 'GVMO', delivery_week: 46, delivery_year: 2026, waste_pickup_date: '2026-11-12' })]);
    const [logistik] = layoutWeek(events, w46, ['GVMO']);
    expect(logistik.segments.map(s => [s.event.kind, s.start, s.span, s.lane])).toEqual([['leverans', 0, 5, 0], ['hamtning', 3, 1, 1]]);
    expect(logistik.laneCount).toBe(2);
  });
  it('splits montage over a weekend into two segments across weeks', () => {
    const events = buildScheduleEvents([c('a', { team: 'GVMO', montage_date: '2026-11-12', montage_days: 3 })]);
    const s46 = layoutWeek(events, w46, ['GVMO'])[1].segments;
    const s47 = layoutWeek(events, w47, ['GVMO'])[1].segments;
    expect(s46).toEqual([expect.objectContaining({ start: 3, span: 2, continuesBefore: false, continuesAfter: true })]);
    expect(s47).toEqual([expect.objectContaining({ start: 0, span: 1, continuesBefore: true, continuesAfter: false })]);
  });
  it('packs non-overlapping segments into as few lanes as possible', () => {
    const events = buildScheduleEvents([
      c('a', { team: 'GVMO', montage_date: '2026-11-09', montage_days: 2 }),
      c('b', { team: 'GVMO', montage_date: '2026-11-10', montage_days: 2 }),
      c('d', { team: 'GVMO', montage_date: '2026-11-11', montage_days: 1 }),
      c('e', { team: 'GVMO', montage_date: '2026-11-13', montage_days: 1 }),
    ]);
    const row = layoutWeek(events, w46, ['GVMO'])[1];
    const lanes = Object.fromEntries(row.segments.map(s => [s.event.caseId, s.lane]));
    expect(lanes).toEqual({ a: 0, b: 1, d: 0, e: 0 });
    expect(row.laneCount).toBe(2);
  });
  it('never hides a booking', () => {
    const cases = [c('a', { team: 'X', montage_date: '2026-11-09' }), c('b', { team: null, montage_date: '2026-11-09' }), c('d', { status: 'km_bokad', km_team: 'Y', km_date: '2026-11-15' })];
    const rows = layoutWeek(buildScheduleEvents(cases), w46, []);
    expect(rows.flatMap(r => r.segments).length).toBe(3);
  });
});
