import { describe, expect, it } from 'vitest';
import { classifyPayoutKind, paidDatesByCase } from '../payoutKind';

describe('klassning av Mockfjärds-utbetalning', () => {
  it('ren KM blir km', () => {
    expect(classifyPayoutKind([{ name: 'Kontrollmätning bilersättning' }, { name: 'X', note: 'kontrollmätning grundavgift' }])).toBe('km');
  });
  it('blandad blir montage', () => {
    expect(classifyPayoutKind([{ name: 'Kontrollmätning' }, { name: 'Montage fönster' }])).toBe('montage');
  });
  it('tom line_items blir montage', () => {
    expect(classifyPayoutKind([])).toBe('montage');
    expect(classifyPayoutKind(null)).toBe('montage');
  });
  it('bara montage tänder betald-signalen; KM syns separat, extra ingenstans', () => {
    const { montage, km } = paidDatesByCase([
      { case_id: 'a', payout_kind: 'km', invoice_date: '2026-08-31' },
      { case_id: 'b', payout_kind: 'montage', invoice_date: '2026-08-19' },
      { case_id: 'c', payout_kind: 'extra', invoice_date: '2026-09-01' },
    ]);
    expect(montage.has('a')).toBe(false);
    expect(km.get('a')).toBe('2026-08-31');
    expect(montage.get('b')).toBe('2026-08-19');
    expect(montage.has('c') || km.has('c')).toBe(false);
  });
});
