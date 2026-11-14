import { describe, expect, it } from 'vitest';
import { addDaysIso, deliveryWeekMonday, isoWeekOf, isWeekend, montageDates, montageEnd, suggestedMontageDays, UNITS_PER_DAY, weekDates, daysBetween, isoDateOf } from '../dates';

describe('schedule dates', () => {
  it('computes ISO weeks, including year boundaries', () => {
    expect(isoWeekOf('2026-11-14')).toEqual({ year: 2026, week: 46 });
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf('2024-12-30')).toEqual({ year: 2025, week: 1 });
  });
  it('lists Monday to Sunday of a week', () => {
    expect(weekDates(2026, 46)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(deliveryWeekMonday(2026, 1)).toBe('2025-12-29');
    expect(deliveryWeekMonday(2026, 53)).toBe('2026-12-28');
  });
  it('adds days across month and DST boundaries', () => {
    expect(addDaysIso('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDaysIso('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-03-27', '2026-03-31')).toBe(4);
  });
  it('detects weekends', () => {
    expect(isWeekend('2026-11-14')).toBe(true);
    expect(isWeekend('2026-11-15')).toBe(true);
    expect(isWeekend('2026-11-16')).toBe(false);
  });
  it('counts the start day as day 1 and the following weekdays', () => {
    expect(montageDates('2026-11-12', 3)).toEqual(['2026-11-12', '2026-11-13', '2026-11-16']);
    expect(montageDates('2026-11-14', 2)).toEqual(['2026-11-14', '2026-11-16']);
    expect(montageEnd('2026-11-12', 4)).toBe('2026-11-17');
  });
  it('treats null or less than 1 day as 1', () => {
    expect(montageDates('2026-11-12', null)).toEqual(['2026-11-12']);
    expect(montageDates('2026-11-12', 0)).toEqual(['2026-11-12']);
    expect(montageEnd('2026-11-12', undefined)).toBe('2026-11-12');
  });
  it('suggests montage days from units', () => {
    expect(UNITS_PER_DAY).toBe(5);
    expect(suggestedMontageDays(null)).toBe(1);
    expect(suggestedMontageDays(0)).toBe(1);
    expect(suggestedMontageDays(5)).toBe(1);
    expect(suggestedMontageDays(6)).toBe(2);
    expect(suggestedMontageDays(12)).toBe(3);
    expect(suggestedMontageDays(1000)).toBe(30);
  });
  it('takes the date part of timestamps and ISO dates', () => {
    expect(isoDateOf('2026-11-03')).toBe('2026-11-03');
    expect(isoDateOf(null)).toBeNull();
    expect(isoDateOf('nonsens')).toBeNull();
  });
});
