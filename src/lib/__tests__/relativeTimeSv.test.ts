import { describe, expect, it } from 'vitest';
import { relativeTimeSv } from '../relativeTimeSv';
describe('relativeTimeSv', () => {
  const now = new Date('2026-10-25T21:41:00Z');
  it.each([[0, 'just nu'], [5, '5 min sedan'], [17 * 60, '17 tim sedan'], [24 * 60, 'igår'], [3 * 24 * 60, '3 dagar sedan']])('%s minuter', (minutes, expected) => {
    expect(relativeTimeSv(new Date(now.getTime() - Number(minutes) * 60000), now)).toBe(expected);
  });
});