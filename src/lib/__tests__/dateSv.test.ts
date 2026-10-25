import { describe, expect, it } from 'vitest';
import { formatDaySv, formatDayTimeSv, relativeDaySv } from '../dateSv';

const now = new Date(2026, 9, 25, 12); // sön 25 okt 2026

describe('dateSv', () => {
  it('formaterar dag utan år i innevarande år', () => {
    expect(formatDaySv('2026-11-04', now)).toBe('ons 4 nov');
    expect(formatDaySv('2026-10-03', now)).toBe('lör 3 okt');
  });
  it('visar år när det inte är innevarande år', () => {
    expect(formatDaySv('2025-11-03', now)).toBe('3 nov 2025');
  });
  it('lägger till tid', () => {
    expect(formatDayTimeSv('2026-10-28', '08:00:00', now)).toBe('ons 28 okt · 08:00');
    expect(formatDayTimeSv('2026-10-28', null, now)).toBe('ons 28 okt');
  });
  it('relativ dag', () => {
    expect(relativeDaySv('2026-10-25', now)).toBe('Idag');
    expect(relativeDaySv('2026-10-26', now)).toBe('Imorgon');
    expect(relativeDaySv('2026-10-27', now)).toBe('tis 27 okt');
  });
  it('tomt värde ger tom text', () => {
    expect(formatDaySv(null, now)).toBe('');
  });
});
