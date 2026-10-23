import { describe, it, expect } from 'vitest';
import { splitCaseChanges } from '@/lib/caseEvents';

describe('splitCaseChanges', () => {
  it('sorterar ekonomirader (Ordervärde, TB, Extra timmar sålda) till economy', () => {
    const res = splitCaseChanges([
      'Ordervärde ändrat till 250 000 kr',
      'TB ändrat till 32%',
      'Extra timmar sålda ändrade till 4',
      'Telefon uppdaterad',
      'Montage-montör ändrad till Team Norr',
    ]);
    expect(res.economy).toEqual([
      'Ordervärde ändrat till 250 000 kr',
      'TB ändrat till 32%',
      'Extra timmar sålda ändrade till 4',
    ]);
    expect(res.update).toEqual(['Telefon uppdaterad', 'Montage-montör ändrad till Team Norr']);
  });

  it('lämnar ofta förväxlingsbara rader kvar i update', () => {
    const res = splitCaseChanges([
      'Extra timmar begärda ändrade till 2',
      'Antal enheter satt till 5',
    ]);
    expect(res.economy).toEqual([]);
    expect(res.update).toHaveLength(2);
  });

  it('hanterar tom lista', () => {
    expect(splitCaseChanges([])).toEqual({ update: [], economy: [] });
  });
});
