import { describe, expect, it } from 'vitest';
import { pickKeep, mergeFieldPlan, findDuplicatePairs, movedSummary } from '../caseMerge';

const orig = { id: 'a', address: 'Soprangränd 6', seller: 'Daniel Malke', created_at: '2026-06-04T09:26:14Z', customer_name: 'Ulf Wencke', city: 'Vällingby', customer_phone: '0708109788', order_number: null, status: 'montage_klart' };
const dup = { id: 'b', address: 'Soprangränd 6, Vällingby', seller: 'Okänd', created_at: '2026-11-04T09:51:36Z', customer_name: 'Ulf Wictor Encke', city: null, customer_phone: '', order_number: '20524725', status: 'fakturerad' };

describe('pickKeep', () => {
  it('keeps the older case by default', () => {
    expect(pickKeep(dup, orig)[0].id).toBe('a');
    expect(pickKeep(orig, dup)[0].id).toBe('a');
  });
  it('never keeps a case with seller "Okänd" when the other has a real seller, even if older', () => {
    const olderUnknown = { ...dup, created_at: '2026-01-01T00:00:00Z' };
    const [keep, drop] = pickKeep(olderUnknown, orig);
    expect(keep.id).toBe('a');
    expect(drop.id).toBe('b');
  });
  it('falls back to the older case when both sellers are unknown', () => {
    expect(pickKeep({ ...orig, seller: 'Okänd' }, { ...dup, created_at: '2026-01-01T00:00:00Z' })[0].id).toBe('b');
  });
});

describe('mergeFieldPlan', () => {
  it('always fills empty fields on the kept case from the duplicate', () => {
    const plan = mergeFieldPlan(orig, dup);
    const order = plan.find(r => r.key === 'order_number')!;
    expect(order.result).toBe('20524725');
    expect(order.autoFilled).toBe(true);
    expect(order.changed).toBe(true);
  });
  it('keeps filled values unless "drop" is chosen', () => {
    const name = mergeFieldPlan(orig, dup).find(r => r.key === 'customer_name')!;
    expect(name.result).toBe('Ulf Wencke');
    expect(name.needsChoice).toBe(true);
    const status = mergeFieldPlan(orig, dup, { status: 'drop' }).find(r => r.key === 'status')!;
    expect(status.result).toBe('fakturerad');
    expect(status.changed).toBe(true);
  });
  it('choosing "drop" for an empty duplicate value keeps the existing value', () => {
    const phone = mergeFieldPlan(orig, dup, { customer_phone: 'drop' }).find(r => r.key === 'customer_phone')!;
    expect(phone.result).toBe('0708109788');
    expect(phone.changed).toBe(false);
  });
  it('trims values so whitespace-only differences do not count as changes', () => {
    const city = mergeFieldPlan({ ...orig, city: 'Vällingby ' }, { ...dup, city: 'Vällingby' }).find(r => r.key === 'city')!;
    expect(city.changed).toBe(false);
    expect(city.needsChoice).toBe(false);
  });
});

describe('findDuplicatePairs', () => {
  it('pairs cases with the same street and house number and pre-selects the kept case', () => {
    const pairs = findDuplicatePairs([dup, orig, { id: 'c', address: 'Soprangränd 16', seller: 'X', created_at: '2026-01-01' }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].keep.id).toBe('a');
    expect(pairs[0].drop.id).toBe('b');
  });
  it('ignores addresses without street and number', () => {
    expect(findDuplicatePairs([{ id: 'x', address: 'Plissé' }, { id: 'y', address: 'Plissé' }])).toHaveLength(0);
  });
});

describe('movedSummary', () => {
  it('describes moved rows in Swedish with singular and plural', () => {
    expect(movedSummary({ case_events: 2, a_orders: 1, visits: 1, case_documents: 1 })).toBe('1 A-order, 1 dokument, 2 händelser, 1 besök');
    expect(movedSummary({}, 0)).toBe('inget');
    expect(movedSummary({ a_orders: 2 }, 1)).toBe('2 A-ordrar, 1 notis');
  });
});
