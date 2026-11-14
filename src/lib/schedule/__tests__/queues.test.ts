import { describe, expect, it } from 'vitest';
import { buildQueues, deliveryLabelOf } from '../queues';
import type { ScheduleCase } from '../types';

const today = '2026-11-14';
const c = (id: string, extra: Partial<ScheduleCase>): ScheduleCase => ({ id, status: 'godkand', address: id, created_at: '2026-10-01T08:00:00Z', ...extra });

describe('buildQueues', () => {
  it('puts waiting KM in the KM queue, longest wait first', () => {
    const q = buildQueues([
      c('a', { status: 'vantar_km', status_changed_at: '2026-11-10T09:00:00Z', km_team: 'Samy' }),
      c('b', { status: 'vantar_km', status_changed_at: null, created_at: '2026-11-01T09:00:00Z' }),
      c('d', { status: 'vantar_km', km_date: '2026-11-20' }),
    ], today);
    expect(q.km.map(i => i.caseId)).toEqual(['b', 'a']);
    expect(q.km[1]).toMatchObject({ queue: 'km', kind: 'km', team: 'Samy', waitingDays: 4, suggestedDays: null });
    expect(q.km[0].waitingDays).toBe(13);
  });
  it('sorts the montage queue: delivered first, then earliest delivery, then longest wait', () => {
    const q = buildQueues([
      c('late', { status: 'godkand', delivery_week: 50, delivery_year: 2026 }),
      c('early', { status: 'i_produktion', delivery_date: '2026-11-18' }),
      c('none', { status: 'godkand' }),
      c('done', { status: 'leverans_klar', delivery_week: 45, delivery_year: 2026, team: 'GVMO', units: 11 }),
      c('booked', { status: 'godkand', montage_date: '2026-11-30' }),
    ], today);
    expect(q.montage.map(i => i.caseId)).toEqual(['done', 'early', 'late', 'none']);
    expect(q.montage[0]).toMatchObject({ team: 'GVMO', deliveryLabel: 'Levererad v.45', suggestedDays: 3 });
    expect(q.montage[1].deliveryLabel).toBe('Leverans 18 nov');
    expect(q.montage[2].deliveryLabel).toBe('Leverans v.50');
    expect(q.montage[3]).toMatchObject({ deliveryLabel: null, suggestedDays: 1 });
  });
  it('uses saved montage_days as suggestion', () => {
    const q = buildQueues([c('a', { status: 'godkand', units: 20, montage_days: 2 })], today);
    expect(q.montage[0].suggestedDays).toBe(2);
  });
  it('collects booked statuses without date in "Saknar datum"', () => {
    const q = buildQueues([
      c('k', { status: 'km_bokad', status_changed_at: '2026-11-05T09:00:00Z' }),
      c('m', { status: 'montage_bokat', status_changed_at: '2026-11-01T09:00:00Z', team: 'GVMO' }),
      c('p', { status: 'montage_pagar', status_changed_at: '2026-11-08T09:00:00Z' }),
      c('ok', { status: 'montage_bokat', montage_date: '2026-11-20' }),
    ], today);
    expect(q.datum.map(i => [i.caseId, i.kind])).toEqual([['m', 'montage'], ['k', 'km'], ['p', 'montage']]);
  });
  it('skips paused cases', () => {
    const q = buildQueues([c('a', { status: 'pausad' })], today);
    expect(q).toEqual({ km: [], montage: [], datum: [] });
  });
  it('labels deliveries', () => {
    expect(deliveryLabelOf(c('a', { delivery_date: '2026-11-10' }), today)).toBe('Levererad 10 nov');
    expect(deliveryLabelOf(c('a', { delivery_week: 2, delivery_year: 2027 }), today)).toBe('Leverans v.2 2027');
    expect(deliveryLabelOf(c('a', { status: 'leverans_klar', delivery_week: 47, delivery_year: 2026 }), today)).toBe('Levererad v.47');
  });
});
