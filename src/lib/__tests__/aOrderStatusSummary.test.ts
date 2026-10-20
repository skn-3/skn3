import { describe, it, expect } from 'vitest';
import { summarizeAOrderStatuses } from '../aOrderStatusSummary';

describe('summarizeAOrderStatuses', () => {
  const t = (name: string) => ({ name });
  const groups = summarizeAOrderStatuses([
    { status: 'order', montor_teams: t('Bertil') },
    { status: 'order', montor_teams: t('Alex NBD') },
    { status: 'order', montor_teams: t('Bertil') },
    { status: 'order', montor_teams: null },
    { status: 'invoiced', montor_teams: t('Alex NBD') },
    { status: 'invoiced', paid_at: '2026-10-01', montor_teams: t('Alex NBD') },
    { status: 'credited', montor_teams: t('Alex NBD') },
  ]);

  it('returns order, invoiced, paid with totals; credited ignored', () => {
    expect(groups.map((g) => [g.key, g.label, g.total])).toEqual([
      ['order', 'Order', 4],
      ['invoiced', 'Fakturerad', 1],
      ['paid', 'Betald', 1],
    ]);
  });

  it('sorts byTeam by count desc then name, uses Ej tilldelad', () => {
    expect(groups[0].byTeam).toEqual([
      { team: 'Bertil', count: 2 },
      { team: 'Alex NBD', count: 1 },
      { team: 'Ej tilldelad', count: 1 },
    ]);
  });

  it('keeps empty groups', () => {
    const empty = summarizeAOrderStatuses([]);
    expect(empty.map((g) => g.total)).toEqual([0, 0, 0]);
  });
});
