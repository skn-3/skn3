import { describe, expect, it } from 'vitest';
import { buildScheduleEvents } from '../events';
import { weekDates } from '../dates';
import { monthWeekModel, monthWeeks, stepMonth } from '../month';
import { buildListDays } from '../list';
import type { ScheduleCase } from '../types';

const c = (id: string, extra: Partial<ScheduleCase>): ScheduleCase => ({ id, status: 'montage_bokat', address: id, city: 'Sala', ...extra });
const w47 = weekDates(2026, 47);

describe('month', () => {
  it('weeks covering november 2026 (v.44–v.49)', () => {
    expect(monthWeeks(2026, 11).map(w => w.week)).toEqual([44, 45, 46, 47, 48, 49]);
    expect(monthWeeks(2026, 11)[0].dates[0]).toBe('2026-10-26');
  });
  it('steps across the year', () => {
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it('bars, overflow and per-day counts', () => {
    const cases = [
      ...['a', 'b', 'd', 'e', 'f'].map(id => c(id, { team: id === 'f' ? null : 'Samy', montage_date: '2026-11-17' })),
      c('k1', { status: 'km_bokad', km_date: '2026-11-18' }),
      c('k2', { status: 'km_bokad', km_date: '2026-11-18' }),
      c('l', { status: 'godkand', delivery_date: '2026-11-18' }),
      c('w', { status: 'godkand', delivery_week: 47, delivery_year: 2026 }),
    ];
    const m = monthWeekModel(buildScheduleEvents(cases), w47);
    expect(m.bars).toHaveLength(4);
    expect(m.hiddenCount).toBe(1);
    expect(m.bars.map(b => b.label)).toContain('Samy · a');
    expect(m.perDay[2]).toEqual({ date: '2026-11-18', km: 2, deliveries: 1 });
  });
  it('labels montage without team', () => {
    const m = monthWeekModel(buildScheduleEvents([c('x', { team: null, montage_date: '2026-11-17' })]), w47);
    expect(m.bars[0]).toMatchObject({ label: 'Ej tilldelat · x', unassigned: true });
  });
});

describe('list', () => {
  it('groups by day, all-day first, multi-day montage on each day, week-based delivery on the first day', () => {
    const days = buildListDays(buildScheduleEvents([
      c('m', { team: 'Samy', montage_date: '2026-11-16', montage_days: 2, montage_time: '07:00:00' }),
      c('k', { status: 'km_bokad', km_date: '2026-11-16' }),
      c('w', { status: 'godkand', delivery_week: 47, delivery_year: 2026 }),
    ]), w47, '2026-11-17');
    expect(days[0].title).toBe('måndag 16 november');
    expect(days[0].items.map(i => [i.timeLabel, i.kindLabel, i.team])).toEqual([['v.47', 'Leverans', 'Logistik'], ['heldag', 'KM', 'Ej tilldelat'], ['07:00', 'Montage', 'Samy']]);
    expect(days[1].isToday).toBe(true);
    expect(days[1].items.map(i => i.event.id)).toEqual(['m-montage']);
    expect(days[2].items).toEqual([]);
  });
});
