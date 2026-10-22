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
  it('avrundar netto till hela kronor när avdragen har öre', () => {
    const r = calcPayout({
      tb: 47625, tiers: [{ upTo: null, pct: 100 }],
      lines: [{ kind: 'receipt', amount: 4431.69, included: true }],
      loanRepayment: 7500,
    });
    expect(r.gross).toBe(47625);
    expect(r.deductions).toBe(4431.69);
    expect(r.net).toBe(35693);
    expect(r.vat).toBe(8923.25);
    expect(r.total).toBe(44616.25);
  });
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

import { previewEstimate } from '../consultantPay';
describe('previewEstimate', () => {
  it('TB 235 348 med bil 3 000 (på) och 500 (av)', () => {
    const r = previewEstimate({ standard_deductions: [{ amount: 3000, defaultOn: true }, { amount: 500, defaultOn: false }], vat_rate: 25 }, 235348);
    expect(r).toEqual({ pct: 45, gross: 105907, standardDeductions: 3000, net: 102907, vat: 25726.75, total: 128633.75 });
  });
  it('egen trappa och utan avdrag', () => {
    const r = previewEstimate({ commission_tiers: [{ upTo: null, pct: 100 }] }, 1000);
    expect(r.net).toBe(1000);
    expect(r.total).toBe(1250);
  });
});

import { payerFiscalInfo, pickPayerYearFolder, pickPayerMonthFolder, consultantDueDate } from '../consultantPay';
describe('betalarens bokföringsmappar', () => {
  it('sep = 01, okt = 02, jun = 10 med start i september', () => {
    expect(payerFiscalInfo('2026-09-15').nn).toBe('01');
    expect(payerFiscalInfo('2026-10-01').nn).toBe('02');
    expect(payerFiscalInfo('2027-06-30').nn).toBe('10');
    expect(payerFiscalInfo('2026-10-01').monthTitle).toBe('02 Okt');
  });
  it('väljer räkenskapsåret vars intervall innehåller månaden', () => {
    const years = [
      { id: 'a', name: 'Kvitton&Fakturor 202509 - 202608' },
      { id: 'b', name: 'Kvitton&Fakturor 202609 - 202708' },
    ];
    expect(pickPayerYearFolder(years, '2026-08-31')?.id).toBe('a');
    expect(pickPayerYearFolder(years, '2026-10-21')?.id).toBe('b');
    expect(pickPayerYearFolder(years, '2028-01-01')).toBeUndefined();
  });
  it('matchar inkonsekventa månadsnamn och tar den senast skapade', () => {
    const months = [
      { id: '1', name: 'Kvitton&Fakturor 02 Okt 25', createdTime: '2025-10-01T00:00:00Z' },
      { id: '2', name: 'Kvitton&Fakturor 02 okt 26', createdTime: '2026-10-01T00:00:00Z' },
      { id: '3', name: 'Kvitton&Fakturor 10 Jun', createdTime: '2026-06-01T00:00:00Z' },
      { id: '4', name: 'Kvitton&Fakturor 11 jul 2026', createdTime: '2026-07-01T00:00:00Z' },
    ];
    expect(pickPayerMonthFolder(months, '2026-10-21')?.id).toBe('2');
    expect(pickPayerMonthFolder(months, '2026-06-02')?.id).toBe('3');
    expect(pickPayerMonthFolder(months, '2026-07-02')?.id).toBe('4');
    expect(pickPayerMonthFolder(months, '2026-11-02')).toBeUndefined();
  });
  it('förfallodatum är fakturadatum + 10 dagar', () => {
    expect(consultantDueDate('2026-10-25')).toBe('2026-11-04');
  });
});
