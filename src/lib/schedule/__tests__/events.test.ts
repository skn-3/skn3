import { describe, expect, it } from 'vitest';
import { buildScheduleEvents } from '../events';
import type { ScheduleCase } from '../types';

const base: ScheduleCase = { id: 'c1', status: 'montage_bokat', address: 'Storgatan 1', city: 'Täby', customer_name: 'Anna', customer_phone: '0701', units: 7, seller: 'Sara', team: 'GVMO', km_team: 'Samy' };

describe('buildScheduleEvents', () => {
  it('builds KM with km_team and time', () => {
    const [e] = buildScheduleEvents([{ ...base, status: 'km_bokad', km_date: '2026-11-16', km_time: '08:00:00' }]);
    expect(e).toMatchObject({ id: 'c1-km', kind: 'km', team: 'Samy', startDate: '2026-11-16', endDate: '2026-11-16', dates: ['2026-11-16'], time: '08:00', state: 'bokad', weekBased: false });
  });
  it('builds multi-day montage over a weekend', () => {
    const [e] = buildScheduleEvents([{ ...base, montage_date: '2026-11-12', montage_days: 4 }]);
    expect(e).toMatchObject({ kind: 'montage', team: 'GVMO', dates: ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17'], endDate: '2026-11-17', days: 4, state: 'bokad' });
  });
  it('treats missing montage_days as 1', () => {
    const [e] = buildScheduleEvents([{ ...base, montage_date: '2026-11-12' }]);
    expect(e.dates).toEqual(['2026-11-12']);
  });
  it.each([
    ['montage_bokat', 'bokad'], ['montage_pagar', 'pagar'], ['montage_klart', 'klar'], ['fakturerad', 'klar'], ['godkand', 'bokad'],
  ])('montage state for %s is %s', (status, state) => {
    expect(buildScheduleEvents([{ ...base, status, montage_date: '2026-11-12' }])[0].state).toBe(state);
  });
  it.each([
    ['vantar_km', 'bokad'], ['km_bokad', 'bokad'], ['km_klar', 'klar'], ['godkand', 'klar'], ['montage_bokat', 'klar'],
  ])('KM state for %s is %s', (status, state) => {
    expect(buildScheduleEvents([{ ...base, status, km_date: '2026-11-12' }])[0].state).toBe(state);
  });
  it('builds week based delivery Monday to Friday', () => {
    const [e] = buildScheduleEvents([{ ...base, status: 'godkand', delivery_week: 47, delivery_year: 2026 }]);
    expect(e).toMatchObject({ kind: 'leverans', weekBased: true, dates: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'] });
  });
  it('prefers the exact delivery date over the week', () => {
    const [e] = buildScheduleEvents([{ ...base, status: 'godkand', delivery_date: '2026-11-18', delivery_time: '10:30:00', delivery_week: 47, delivery_year: 2026 }]);
    expect(e).toMatchObject({ kind: 'leverans', weekBased: false, dates: ['2026-11-18'], time: '10:30' });
  });
  it('builds waste pickup', () => {
    const [e] = buildScheduleEvents([{ ...base, status: 'montage_klart', waste_pickup_date: '2026-11-19' }]);
    expect(e).toMatchObject({ id: 'c1-hamtning', kind: 'hamtning', dates: ['2026-11-19'] });
  });
  it('skips paused cases', () => {
    expect(buildScheduleEvents([{ ...base, status: 'pausad', montage_date: '2026-11-12', km_date: '2026-11-01' }])).toEqual([]);
  });
  it('contains no economy fields', () => {
    const [e] = buildScheduleEvents([{ ...base, montage_date: '2026-11-12', order_value: 99999, tb_percent: 30 } as ScheduleCase]);
    expect(Object.keys(e).sort()).toEqual(['address', 'caseId', 'city', 'customerName', 'customerPhone', 'dates', 'days', 'endDate', 'id', 'kind', 'seller', 'startDate', 'state', 'status', 'team', 'time', 'units', 'weekBased'].sort());
  });
});
