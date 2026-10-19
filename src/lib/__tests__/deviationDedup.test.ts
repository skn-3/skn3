import { describe, it, expect } from 'vitest';
import { findDuplicateDeviation } from '../deviationDedup';

const now = new Date('2026-10-09T10:00:00Z');
const base = { case_id: 'c1', created_by: 'LUKAS', description: 'Fönstret är för litet' };
const row = (over: Partial<{ id: string; case_id: string | null; created_by: string; description: string; created_at: string }>) => ({
  id: 'd1', case_id: 'c1', created_by: 'LUKAS', description: 'Fönstret är för litet', created_at: '2026-10-09T09:55:00Z', ...over,
});

describe('findDuplicateDeviation', () => {
  it('återanvänder avvikelse från samma användare på samma ärende med samma beskrivning inom 15 min', () => {
    expect(findDuplicateDeviation([row({})], base, now)?.id).toBe('d1');
  });
  it('ignorerar skillnad i blanksteg och versaler', () => {
    expect(findDuplicateDeviation([row({ description: '  fönstret  är för\nlitet ' })], base, now)?.id).toBe('d1');
  });
  it('skapar ny när den befintliga är äldre än 15 minuter', () => {
    expect(findDuplicateDeviation([row({ created_at: '2026-10-09T09:44:59Z' })], base, now)).toBeNull();
  });
  it('räknar exakt 15 minuter som dubblett', () => {
    expect(findDuplicateDeviation([row({ created_at: '2026-10-09T09:45:00Z' })], base, now)?.id).toBe('d1');
  });
  it('skapar ny när en annan användare rapporterat', () => {
    expect(findDuplicateDeviation([row({ created_by: 'Alex NBD' })], base, now)).toBeNull();
  });
  it('skapar ny på ett annat ärende', () => {
    expect(findDuplicateDeviation([row({ case_id: 'c2' })], base, now)).toBeNull();
  });
  it('skapar ny när beskrivningen skiljer sig', () => {
    expect(findDuplicateDeviation([row({ description: 'Annat problem' })], base, now)).toBeNull();
  });
  it('väljer den senaste när flera dubbletter finns', () => {
    const list = [row({ id: 'a', created_at: '2026-10-09T09:50:00Z' }), row({ id: 'b', created_at: '2026-10-09T09:58:00Z' })];
    expect(findDuplicateDeviation(list, base, now)?.id).toBe('b');
  });
});
