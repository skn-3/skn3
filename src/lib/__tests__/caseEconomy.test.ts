import { describe, it, expect } from 'vitest';
import { bucketCaseCosts, computeCaseEconomics, marginWithFallback } from '../caseEconomy';

const docs = (arr: [string, number][]) => arr.map(([doc_type, total_amount]) => ({ doc_type, total_amount }));
const noBuckets = { ovrigt: 0, reklMontor: 0, reklOvrig: 0, reklFabrik: 0 };

describe('computeCaseEconomics', () => {
  it('räknar intäkt från payout och kostnad från lokala a_orders', () => {
    const eco = computeCaseEconomics({ aOrderSum: 30000, docs: docs([['mockfjards_payout', 100000]]), buckets: noBuckets });
    expect(eco.revenue).toBe(100000);
    expect(eco.cost).toBe(30000);
    expect(eco.profit).toBe(70000);
    expect(eco.margin).toBeCloseTo(0.7);
    expect(eco.hasMontor).toBe(true);
  });

  it('krediter nettas: negativ a_order-summa sänker kostnaden', () => {
    const eco = computeCaseEconomics({ aOrderSum: 30000 - 30000, docs: docs([['mockfjards_payout', 100000]]), buckets: noBuckets });
    expect(eco.montorCost).toBe(0);
    expect(eco.hasMontor).toBe(false);
  });

  it('faller tillbaka på a_order-dokument när lokala rader saknas', () => {
    const eco = computeCaseEconomics({ aOrderSum: null, docs: docs([['mockfjards_payout', 100000], ['a_order', 25000]]), buckets: noBuckets });
    expect(eco.montorCost).toBe(25000);
    expect(eco.hasMontor).toBe(true);
  });

  it('fabriksreklamationer ingår ALDRIG i kostnaden', () => {
    const buckets = bucketCaseCosts([
      { category: 'reklamation', responsible: 'fabrik', amount: 9999 },
      { category: 'reklamation', responsible: 'montor', amount: 1000 },
      { category: 'ovrigt', responsible: null, amount: 500 },
    ]);
    expect(buckets.reklFabrik).toBe(9999);
    const eco = computeCaseEconomics({ aOrderSum: 10000, docs: docs([['mockfjards_payout', 50000]]), buckets });
    expect(eco.cost).toBe(10000 + 1000 + 500);
  });

  it('plåt- och montörfakturor adderas till kostnaden', () => {
    const eco = computeCaseEconomics({
      aOrderSum: 10000,
      docs: docs([['mockfjards_payout', 50000], ['sheet_metal_invoice', 2000], ['montor_invoice', 3000]]),
      buckets: noBuckets,
    });
    expect(eco.cost).toBe(15000);
  });

  it('förlustärende: profit negativ, margin negativ', () => {
    const eco = computeCaseEconomics({ aOrderSum: 60000, docs: docs([['mockfjards_payout', 50000]]), buckets: noBuckets });
    expect(eco.profit).toBe(-10000);
    expect(eco.margin).toBeLessThan(0);
  });

  it('margin är null när intäkt saknas', () => {
    const eco = computeCaseEconomics({ aOrderSum: 5000, docs: [], buckets: noBuckets });
    expect(eco.margin).toBeNull();
  });
});

describe('marginWithFallback', () => {
  it('använder ordervärde som preliminär intäkt tills payout finns', () => {
    const eco = computeCaseEconomics({ aOrderSum: 30000, docs: [], buckets: noBuckets });
    const m = marginWithFallback(eco, 100000);
    expect(m.usingPayout).toBe(false);
    expect(m.revenue).toBe(100000);
    expect(m.profit).toBe(70000);
    expect(m.marginPct).toBe(70);
  });

  it('växlar till payout när den finns', () => {
    const eco = computeCaseEconomics({ aOrderSum: 30000, docs: docs([['mockfjards_payout', 90000]]), buckets: noBuckets });
    const m = marginWithFallback(eco, 100000);
    expect(m.usingPayout).toBe(true);
    expect(m.revenue).toBe(90000);
  });
});
