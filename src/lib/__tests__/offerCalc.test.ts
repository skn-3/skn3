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

describe('calcOfferTotals — ROT-tak per person (50 000 kr/år)', () => {
  // arbete 300 000 ex moms -> rot_base 375 000 -> 30 % = 112 500 utan tak
  const bigLabor = [item(300000, true), item(50000, false)];

  it('1 person: avdraget begränsas till 50 000 kr', () => {
    const t = calcOfferTotals(bigLabor, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, handpenning_percent: 25 });
    expect(t.rot_uncapped).toBe(112500);
    expect(t.rot_room).toBe(50000);
    expect(t.rot_amount).toBe(50000);
    expect(t.rot_capped).toBe(true);
    expect(t.total_after_rot).toBe(437500 - 50000);
    expect(t.slutfaktura).toBe(t.total_after_rot - t.handpenning);
  });

  it('2 personer: taket blir 100 000 kr', () => {
    const t = calcOfferTotals(bigLabor, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, handpenning_percent: 25, rot_persons: 2 });
    expect(t.rot_room).toBe(100000);
    expect(t.rot_amount).toBe(100000);
    expect(t.rot_capped).toBe(true);
  });

  it('redan utnyttjat avdrag minskar utrymmet', () => {
    const t = calcOfferTotals(bigLabor, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_used: 30000 });
    expect(t.rot_room).toBe(70000);
    expect(t.rot_amount).toBe(70000);
  });

  it('under taket: avdraget påverkas inte', () => {
    const t = calcOfferTotals([item(10000, true)], { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 1 });
    expect(t.rot_amount).toBe(3750);
    expect(t.rot_capped).toBe(false);
  });

  it('eget tak per offert respekteras, utrymme kan inte bli negativt', () => {
    const t = calcOfferTotals(bigLabor, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 1, rot_cap_per_person: 75000, rot_used: 100000 });
    expect(t.rot_room).toBe(0);
    expect(t.rot_amount).toBe(0);
    expect(t.rot_capped).toBe(true);
    expect(t.total_after_rot).toBe(437500);
  });

  it('ROT avstängt: inga ROT-fält sätts', () => {
    const t = calcOfferTotals(bigLabor, { vat_mode: 'vanlig', rot_enabled: false, rot_percent: 30, rot_persons: 2 });
    expect(t.rot_amount).toBe(0);
    expect(t.rot_room).toBe(0);
    expect(t.rot_capped).toBe(false);
  });
});
