import { describe, it, expect } from 'vitest';
import { costToLine, linkedCostIds, planCostLinkSync, payoutState, COST_LINE_PREFIX } from '../caseCostPayout';

describe('costToLine', () => {
  it('bygger en rad med prefix, belopp och cost_id', () => {
    const line = costToLine({ id: 'c1', description: 'Extra fönsterbleck', amount: 1082.4 }, () => 'al_x');
    expect(line).toEqual({ id: 'al_x', name: `${COST_LINE_PREFIX}Extra fönsterbleck`, unit_price: 1082, qty: 1, amount: 1082, auto: false, cost_id: 'c1' });
  });
});

describe('payoutState', () => {
  it('tolkar de tre lägena', () => {
    expect(payoutState({ a_order_id: null, payout_excluded_at: null })).toBe('pending');
    expect(payoutState({ a_order_id: 'o1', payout_excluded_at: null })).toBe('added');
    expect(payoutState({ a_order_id: null, payout_excluded_at: '2026-10-11' })).toBe('excluded');
    expect(payoutState({ a_order_id: 'o1', payout_excluded_at: '2026-10-11' })).toBe('added');
  });
});

describe('linkedCostIds', () => {
  it('samlar cost_id från rader', () => {
    expect([...linkedCostIds([{ cost_id: 'a' }, {}, { cost_id: 'b' }, { cost_id: 'a' }])]).toEqual(['a', 'b']);
  });
});

describe('planCostLinkSync', () => {
  it('kopplar nya rader och kopplar isär borttagna', () => {
    const plan = planCostLinkSync(
      [{ id: 'l1', cost_id: 'c1' }, { id: 'l2' }, { id: 'l3', cost_id: 'c3' }],
      [{ id: 'c1', a_order_line_id: 'l1' }, { id: 'c2', a_order_line_id: 'l9' }],
    );
    expect(plan).toEqual({ link: [{ costId: 'c3', lineId: 'l3' }], unlink: ['c2'] });
  });

  it('uppdaterar rad-id när raden bytt id', () => {
    const plan = planCostLinkSync([{ id: 'lNew', cost_id: 'c1' }], [{ id: 'c1', a_order_line_id: 'lOld' }]);
    expect(plan).toEqual({ link: [{ costId: 'c1', lineId: 'lNew' }], unlink: [] });
  });

  it('låter första raden gälla om samma kostnad ligger två gånger', () => {
    const plan = planCostLinkSync([{ id: 'l1', cost_id: 'c1' }, { id: 'l2', cost_id: 'c1' }], []);
    expect(plan).toEqual({ link: [{ costId: 'c1', lineId: 'l1' }], unlink: [] });
  });

  it('gör inget när allt redan stämmer', () => {
    expect(planCostLinkSync([{ id: 'l1', cost_id: 'c1' }], [{ id: 'c1', a_order_line_id: 'l1' }])).toEqual({ link: [], unlink: [] });
  });
});
