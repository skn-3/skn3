import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIERS,
  calcPayout,
  monthLabel,
  normalizeDocNumber,
  parseMonthFolderName,
  tierFor,
} from '../consultantPay';

describe('tierFor', () => {
  it('väljer rätt steg på gränserna', () => {
    expect(tierFor(100000).pct).toBe(30);
    expect(tierFor(100001).pct).toBe(35);
    expect(tierFor(250000).pct).toBe(45);
    expect(tierFor(250001).pct).toBe(50);
  });
  it('tb <= 0 ger första steget', () => {
    expect(tierFor(0)).toEqual(DEFAULT_TIERS[0]);
    expect(tierFor(-500)).toEqual(DEFAULT_TIERS[0]);
  });
});

describe('calcPayout', () => {
  it('TB 235 348, bil 3 000, amortering 7 500', () => {
    const r = calcPayout({
      tb: 235348,
      lines: [{ kind: 'standard', amount: 3000, included: true }],
      loanRepayment: 7500,
    });
    expect(r.pct).toBe(45);
    expect(r.gross).toBe(105907);
    expect(r.deductions).toBe(3000);
    expect(r.net).toBe(95407);
    expect(r.vat).toBe(23851.75);
    expect(r.total).toBe(119258.75);
  });
  it('TB 68 768 med kvitton 850 + 700', () => {
    const r = calcPayout({
      tb: 68768,
      lines: [
        { kind: 'receipt', amount: 850, included: true },
        { kind: 'receipt', amount: 700, included: true },
      ],
    });
    expect(r.gross).toBe(20630);
    expect(r.net).toBe(19080);
    expect(r.vat).toBe(4770);
    expect(r.total).toBe(23850);
  });
  it('exkluderad rad räknas inte', () => {
    const r = calcPayout({
      tb: 100000,
      lines: [
        { kind: 'receipt', amount: 500, included: false },
        { kind: 'receipt', amount: 200, included: true },
      ],
    });
    expect(r.deductions).toBe(200);
  });
  it('net får bli negativt', () => {
    const r = calcPayout({ tb: 1000, lines: [{ kind: 'manual', amount: 5000, included: true }] });
    expect(r.net).toBeLessThan(0);
  });
});

describe('normalizeDocNumber', () => {
  it('tar bort mellanslag och bindestreck', () => {
    expect(normalizeDocNumber('140127 0240 02971481')).toBe('140127024002971481');
  });
  it('korta nummer blir tomma', () => {
    expect(normalizeDocNumber('ab-12')).toBe('');
    expect(normalizeDocNumber(null)).toBe('');
  });
});

describe('parseMonthFolderName', () => {
  it.each([
    ['VPLG Oktober 2026', '2026-10-01'],
    ['VPLG Aug 2026', '2026-08-01'],
    ['VPLG maj 26 - Att dra av utbet', '2026-05-01'],
    ['Utlägg Mars 26', '2026-03-01'],
    ['Kvitton&Fakturor 02 okt 26', '2026-10-01'],
  ])('%s → %s', (name, expected) => {
    expect(parseMonthFolderName(name)).toBe(expected);
  });
  it('returnerar null utan månad', () => {
    expect(parseMonthFolderName('Lån')).toBeNull();
  });
});

describe('monthLabel', () => {
  it('formaterar iso-månad', () => {
    expect(monthLabel('2026-10-01')).toBe('oktober 2026');
  });
});
