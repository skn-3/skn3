import { describe, expect, it } from 'vitest';
import { checkPlacement } from '../placement';
import { buildScheduleEvents } from '../events';
import type { ScheduleCase } from '../types';

const today = '2026-11-14';
const caseData: ScheduleCase = { id: 'c1', status: 'leverans_klar', address: 'Storgatan 1', delivery_date: '2026-11-10' };

describe('checkPlacement', () => {
  it('accepts a normal weekday', () => {
    expect(checkPlacement({ caseData, kind: 'montage', date: '2026-11-17', team: 'GVMO', events: [], today })).toEqual({ level: 'ok', reasons: [] });
  });
  it('blocks a passed day unless allowPast', () => {
    expect(checkPlacement({ caseData, kind: 'km', date: '2026-11-13', events: [], today })).toEqual({ level: 'blocked', reasons: ['Dagen har passerat'] });
    expect(checkPlacement({ caseData, kind: 'km', date: '2026-11-13', events: [], today, allowPast: true }).level).toBe('ok');
  });
  it('requires a team for montage but not for KM', () => {
    expect(checkPlacement({ caseData, kind: 'montage', date: '2026-11-17', events: [], today })).toEqual({ level: 'blocked', reasons: ['Montage kräver ett team'] });
    expect(checkPlacement({ caseData, kind: 'km', date: '2026-11-17', events: [], today }).level).toBe('ok');
  });
  it('uses the status rule reason when delivery is missing', () => {
    const r = checkPlacement({ caseData: { id: 'c1', status: 'godkand' }, kind: 'montage', date: '2026-11-17', team: 'GVMO', events: [], today });
    expect(r).toEqual({ level: 'blocked', reasons: ['Välj leveransdatum eller leveransvecka innan ärendet förs vidare från KM klar'] });
    const noTeam = checkPlacement({ caseData: { id: 'c1', status: 'godkand' }, kind: 'montage', date: '2026-11-17', events: [], today });
    expect(noTeam.reasons).toEqual(['Montage kräver ett team', 'Välj leveransdatum eller leveransvecka innan ärendet förs vidare från KM klar']);
  });
  it('blocks montage before the delivery date', () => {
    const r = checkPlacement({ caseData: { ...caseData, delivery_date: '2026-11-18' }, kind: 'montage', date: '2026-11-17', team: 'GVMO', events: [], today });
    expect(r).toEqual({ level: 'blocked', reasons: ['Före leveransen ons 18 nov'] });
  });
  it('blocks before the delivery week and warns within it', () => {
    const wk = { id: 'c1', status: 'godkand', delivery_week: 48, delivery_year: 2026 };
    expect(checkPlacement({ caseData: wk, kind: 'montage', date: '2026-11-20', team: 'GVMO', events: [], today }).reasons).toEqual(['Före leveransveckan v.48']);
    const inside = checkPlacement({ caseData: wk, kind: 'montage', date: '2026-11-25', team: 'GVMO', events: [], today });
    expect(inside).toEqual({ level: 'warn', reasons: ['Leveransen är planerad till v.48, exakt dag saknas'] });
    expect(checkPlacement({ caseData: wk, kind: 'montage', date: '2026-12-01', team: 'GVMO', events: [], today }).level).toBe('ok');
  });
  it('warns on weekends', () => {
    expect(checkPlacement({ caseData, kind: 'km', date: '2026-11-15', events: [], today })).toEqual({ level: 'warn', reasons: ['Helgdag'] });
  });
  it('warns when the team already has montage on one of the days', () => {
    const events = buildScheduleEvents([
      { id: 'other', status: 'montage_bokat', team: 'GVMO', montage_date: '2026-11-18' },
      { id: 'c1', status: 'montage_bokat', team: 'GVMO', montage_date: '2026-11-17' },
    ]);
    const r = checkPlacement({ caseData, kind: 'montage', date: '2026-11-17', days: 2, team: 'GVMO', events, today });
    expect(r).toEqual({ level: 'warn', reasons: ['GVMO har redan montage ons 18 nov'] });
    expect(checkPlacement({ caseData, kind: 'montage', date: '2026-11-17', days: 1, team: 'GVMO', events, today }).level).toBe('ok');
  });
});
