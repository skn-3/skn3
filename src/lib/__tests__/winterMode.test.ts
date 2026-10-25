import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isWinterSeason, getWinterPref, setWinterPref } from '../winterMode';

const d = (s: string) => { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day, 12); };

describe('isWinterSeason', () => {
  it.each([
    ['2026-10-24', false], ['2026-10-25', true], ['2026-12-24', true],
    ['2027-01-06', true], ['2027-01-07', false], ['2026-06-01', false],
  ])('%s -> %s', (s, exp) => expect(isWinterSeason(d(s))).toBe(exp));
});

describe('winter pref', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });
  it('defaults to on', () => expect(getWinterPref()).toBe(true));
  it('can be turned off and on', () => {
    setWinterPref(false);
    expect(getWinterPref()).toBe(false);
    setWinterPref(true);
    expect(getWinterPref()).toBe(true);
  });
});
