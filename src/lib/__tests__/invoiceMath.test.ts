import { describe, it, expect } from 'vitest';
import { calcInvoiceTotals, lineAmount } from '../invoiceMath';

describe('calcInvoiceTotals', () => {
  it('omvänd moms: 0 kr moms', () => {
    const t = calcInvoiceTotals([{ amount: 10000 }, { amount: 2500 }], 'omvand');
    expect(t).toEqual({ subtotal: 12500, vatAmount: 0, total: 12500 });
  });

  it('vanlig moms: 25 % avrundat till heltal', () => {
    const t = calcInvoiceTotals([{ amount: 999 }], 'vanlig');
    expect(t.vatAmount).toBe(250);
    expect(t.total).toBe(1249);
  });

  it('kreditrader (negativa belopp) nettas i subtotal', () => {
    const t = calcInvoiceTotals([{ amount: 10000 }, { amount: -10000 }], 'vanlig');
    expect(t).toEqual({ subtotal: 0, vatAmount: 0, total: 0 });
  });

  it('null/undefined-belopp räknas som 0', () => {
    const t = calcInvoiceTotals([{ amount: null }, { amount: undefined }, { amount: 100 }], 'omvand');
    expect(t.subtotal).toBe(100);
  });
});

describe('lineAmount', () => {
  it('avrundar pris × antal till heltal', () => {
    expect(lineAmount(450.4, 3)).toBe(1351);
    expect(lineAmount(null, 5)).toBe(0);
    expect(lineAmount(100, undefined)).toBe(0);
  });
});
