import { describe, expect, it } from 'vitest';
import { buildScheduleEvents } from '../events';
import { findConflicts, teamLoad } from '../conflicts';
import { weekDates } from '../dates';
import type { ScheduleCase } from '../types';

const c = (id: string, extra: Partial<ScheduleCase>): ScheduleCase => ({ id, status: 'montage_bokat', address: id, ...extra });

describe('conflicts', () => {
  it('finds two montages of the same team sharing a day', () => {
    const events = buildScheduleEvents([
      c('a', { team: 'GVMO', montage_date: '2026-11-12', montage_days: 3 }),
      c('b', { team: 'GVMO', montage_date: '2026-11-16' }),
      c('d', { team: 'Samy', montage_date: '2026-11-16' }),
    ]);
    const r = findConflicts(events);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ kind: 'montage', dates: ['2026-11-16'] });
    expect(r.byEvent.get('a-montage')).toHaveLength(1);
    expect(r.byEvent.get('b-montage')).toHaveLength(1);
    expect(r.byEvent.has('d-montage')).toBe(false);
  });
  it('finds KM with same team, date and time but not without time', () => {
    const events = buildScheduleEvents([
      c('a', { status: 'km_bokad', km_team: 'Samy', km_date: '2026-11-12', km_time: '08:00' }),
      c('b', { status: 'km_bokad', km_team: 'Samy', km_date: '2026-11-12', km_time: '08:00:00' }),
      c('d', { status: 'km_bokad', km_team: 'Samy', km_date: '2026-11-12', km_time: '10:00' }),
      c('e', { status: 'km_bokad', km_team: 'Samy', km_date: '2026-11-12' }),
      c('f', { status: 'km_bokad', km_team: 'Samy', km_date: '2026-11-12' }),
    ]);
    const r = findConflicts(events);
    expect(r.pairs.map(p => [p.a.caseId, p.b.caseId])).toEqual([['a', 'b']]);
  });
  it('ignores bookings without team', () => {
    const events = buildScheduleEvents([c('a', { montage_date: '2026-11-12' }), c('b', { montage_date: '2026-11-12' })]);
    expect(findConflicts(events).pairs).toEqual([]);
  });
  it('counts weekdays with montage and KM in the week', () => {
    const events = buildScheduleEvents([
      c('a', { team: 'GVMO', montage_date: '2026-11-12', montage_days: 3 }),
      c('b', { team: 'GVMO', montage_date: '2026-11-13' }),
      c('d', { team: 'GVMO', montage_date: '2026-11-14' }),
      c('e', { status: 'km_bokad', km_team: 'GVMO', km_date: '2026-11-10' }),
      c('f', { status: 'km_bokad', km_team: 'GVMO', km_date: '2026-11-18' }),
    ]);
    expect(teamLoad(events, weekDates(2026, 46), 'GVMO')).toEqual({ montageDays: 2, kmCount: 1 });
    expect(teamLoad(events, weekDates(2026, 46), 'Samy')).toEqual({ montageDays: 0, kmCount: 0 });
  });
});
