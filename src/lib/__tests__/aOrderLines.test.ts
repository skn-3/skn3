import { describe, it, expect } from 'vitest';
import { generateAutoLines, sumLines } from '../aOrderLines';

const base = { windowCount: 10, doorCount: 1, roofWindowCount: 0, kmDistance: 0 };

function priceOf(lines: ReturnType<typeof generateAutoLines>, name: string) {
  const l = lines.find(x => x.name === name);
  return l?.unit_price;
}

describe('generateAutoLines — fasadberoende priser', () => {
  it('trä: fönster 352, dörr 764.8, bleck 79.8, rivning 154.8', () => {
    const lines = generateAutoLines({ ...base, facadeType: 'tra' });
    expect(priceOf(lines, 'Montering Fönster')).toBe(352);
    expect(priceOf(lines, 'Montering Dörr (+Ädelträlist)')).toBe(764.8);
    expect(priceOf(lines, 'Montering Bleck Trähus')).toBe(79.8);
    expect(priceOf(lines, 'Rivning dörr/fönster')).toBe(154.8);
  });

  it('sten: fönster 624, dörr 1078.8, bleck 131.8', () => {
    const lines = generateAutoLines({ ...base, facadeType: 'sten' });
    expect(priceOf(lines, 'Montering Fönster')).toBe(624);
    expect(priceOf(lines, 'Montering Dörr (+Ädelträlist)')).toBe(1078.8);
    expect(priceOf(lines, 'Montering Bleck Puts/Stenhus')).toBe(131.8);
  });

  it('puts: fönster och dörr har STENPRIS (624 / 1078.8), rivning putsfasad 186.7', () => {
    const lines = generateAutoLines({ ...base, facadeType: 'puts' });
    expect(priceOf(lines, 'Montering Fönster')).toBe(624);
    expect(priceOf(lines, 'Montering Dörr (+Ädelträlist)')).toBe(1078.8);
    expect(priceOf(lines, 'Rivning putsfasad')).toBe(186.7);
    expect(priceOf(lines, 'Montering Bleck Puts/Stenhus')).toBe(131.8);
  });

  it('summan reagerar på fasadbyte', () => {
    const tra = sumLines(generateAutoLines({ ...base, facadeType: 'tra' }));
    const puts = sumLines(generateAutoLines({ ...base, facadeType: 'puts' }));
    expect(puts).toBeGreaterThan(tra);
  });

  it('Materialkostnad Underbleck: 450 kr per enhet, oberoende av fasad', () => {
    for (const facadeType of ['tra', 'sten', 'puts'] as const) {
      const lines = generateAutoLines({ ...base, facadeType });
      const ub = lines.find(l => l.name === 'Materialkostnad Underbleck');
      expect(ub?.unit_price).toBe(450);
      expect(ub?.qty).toBe(base.windowCount + base.doorCount);
    }
  });
});
