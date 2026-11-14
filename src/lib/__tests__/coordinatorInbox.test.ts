import { describe, expect, it } from 'vitest';
import { inboxOpenCount, selectOpenDeviations, selectToBook, selectToOrderSheet } from '../coordinatorInbox';

const c = (id: string, extra: Record<string, unknown>) => ({ id, status: 'ny', created_at: '2026-11-01T08:00:00Z', montage_date: null, team: null, ...extra }) as any;

describe('coordinator inbox selections', () => {
  it('to book: approved or in production without date or team', () => {
    const cases = [c('a', { status: 'godkand' }), c('b', { status: 'i_produktion', team: 'Samy', montage_date: '2026-11-20' }), c('d', { status: 'i_produktion', montage_date: '2026-11-20' })];
    expect(selectToBook(cases).map(x => x.id)).toEqual(['a', 'd']);
  });
  it('sheet metal: production phase without an order', () => {
    const cases = [c('a', { status: 'godkand' }), c('b', { status: 'montage_bokat' }), c('d', { status: 'vantar_km' })];
    expect(selectToOrderSheet(cases, new Set(['b'])).map(x => x.id)).toEqual(['a']);
    expect(selectToOrderSheet(cases, undefined).map(x => x.id)).toEqual(['a', 'b']);
  });
  it('open deviations: ny first, resolved excluded', () => {
    const devs = [
      { id: 1, status: 'under_atgard', created_at: '2026-11-01' },
      { id: 2, status: 'ny', created_at: '2026-11-05' },
      { id: 3, status: 'klar', created_at: '2026-11-01' },
      { id: 4, resolved: true, created_at: '2026-11-01' },
      { id: 5, resolved: false, created_at: '2026-11-02' },
    ];
    expect(selectOpenDeviations(devs).map(d => d.id)).toEqual([5, 2, 1]);
  });
  it('counts all open items', () => {
    const cases = [c('a', { status: 'godkand' }), c('b', { status: 'leverans_klar' })];
    expect(inboxOpenCount({ cases, deviations: [{ status: 'ny', created_at: '2026-11-01' }], sheetMetalCaseIds: new Set() })).toBe(4);
  });
});
