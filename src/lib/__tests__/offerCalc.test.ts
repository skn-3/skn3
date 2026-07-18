import { describe, it, expect } from 'vitest';
import { calcOfferTotals, type OfferLineItem } from '../offerCalc';

const item = (amount: number, is_labor: boolean): OfferLineItem => ({
  id: 'x',
  description: '',
  is_labor,
  qty: 1,
  unit: 'st',
  unit_price: amount,
  amount,
});

describe('calcOfferTotals — handpenning före ROT', () => {
  it('vanlig moms utan ROT: handpenning = incl_vat * hp%', () => {
    const t = calcOfferTotals([item(10000, false)], {
      vat_mode: 'vanlig',
      rot_enabled: false,
      rot_percent: 30,
      handpenning_percent: 25,
    });
    expect(t.total_incl_vat).toBe(12500);
    expect(t.rot_amount).toBe(0);
    expect(t.total_after_rot).toBe(12500);
    expect(t.handpenning).toBe(3125); // 25% av 12500
    expect(t.slutfaktura).toBe(12500 - 3125);
  });

  it('vanlig moms med ROT: handpenning på belopp FÖRE ROT, hela ROT dras på slutfaktura', () => {
    const t = calcOfferTotals([item(10000, true)], {
      vat_mode: 'vanlig',
      rot_enabled: true,
      rot_percent: 30,
      handpenning_percent: 25,
    });
    // arbete: 10000 ex vat -> 12500 incl vat
    // rot_base = 10000 * 1.25 = 12500; rot 30% = 3750
    expect(t.total_incl_vat).toBe(12500);
    expect(t.rot_amount).toBe(3750);
    expect(t.total_after_rot).toBe(12500 - 3750);
    // Handpenning ska räknas på 12500 (FÖRE ROT), inte på total_after_rot
    expect(t.handpenning).toBe(3125);
    expect(t.slutfaktura).toBe(t.total_after_rot - 3125);
  });

  it('omvänd moms: handpenning = total_ex_vat * hp%', () => {
    const t = calcOfferTotals([item(10000, false)], {
      vat_mode: 'omvand',
      rot_enabled: false,
      rot_percent: 30,
      handpenning_percent: 25,
    });
    expect(t.total_vat).toBe(0);
    expect(t.total_incl_vat).toBe(10000);
    expect(t.handpenning).toBe(2500);
    expect(t.slutfaktura).toBe(10000 - 2500);
  });

  it('handpenning 0%: hela beloppet blir slutfaktura', () => {
    const t = calcOfferTotals([item(10000, true)], {
      vat_mode: 'vanlig',
      rot_enabled: true,
      rot_percent: 30,
      handpenning_percent: 0,
    });
    expect(t.handpenning).toBe(0);
    expect(t.slutfaktura).toBe(t.total_after_rot);
  });
});
