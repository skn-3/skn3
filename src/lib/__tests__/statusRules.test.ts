import { describe, it, expect } from 'vitest';
import { canEnterStatus } from '@/lib/statusRules';

// Leveransgaten: slutförandestatusar (montage_klart, fakturerad) undantas,
// planeringsstegen kräver fortfarande leveransdatum/vecka.
describe('canEnterStatus leveransgate', () => {
  it('montage_klart tillåts utan leveransdatum/vecka (montör kan klarrapportera)', () => {
    const res = canEnterStatus('montage_klart', { status: 'montage_bokat' });
    expect(res.ok).toBe(true);
  });

  it('fakturerad tillåts utan leveransdatum/vecka när montage är klart', () => {
    const res = canEnterStatus('fakturerad', { status: 'montage_klart' });
    expect(res.ok).toBe(true);
  });

  it('montage_bokat stoppas utan leveransdatum/vecka', () => {
    const res = canEnterStatus('montage_bokat', {});
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Välj leveransdatum eller leveransvecka innan ärendet förs vidare från KM klar');
  });

  it('montage_pagar stoppas utan leveransdatum/vecka', () => {
    const res = canEnterStatus('montage_pagar', { status: 'montage_bokat' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Välj leveransdatum eller leveransvecka innan ärendet förs vidare från KM klar');
  });

  it('fakturerad kräver fortfarande montage_klart', () => {
    const res = canEnterStatus('fakturerad', { status: 'montage_bokat', delivery_date: '2026-10-01' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('Montage måste vara klart först');
  });
});
