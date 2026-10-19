import { describe, expect, it } from 'vitest';
import { groupPayoutLines, planPayoutInvoices, payoutRowWithHour, selectedPayoutRows, type PayoutFinancialRow, type PayoutLineItem } from '../payoutGroups';

const line = (name: string, amount: number, order_number = '123'): PayoutLineItem => ({ name, amount, order_number, note: null, qty: 1, unit_price: amount });
const row = (kind: 'km' | 'extra', overrides: Partial<PayoutFinancialRow> = {}): PayoutFinancialRow => ({
  kind, included: kind === 'km', teamId: 'team1', invoice_number: 'F1', order_number: '123', customer_name: 'Anna',
  kmQty: 10, bilRate: 5, restidRate: 2, grundavgift: 30, enheterQty: 0, enheterRate: 0,
  lines: [line('Justering', 250)], ...overrides,
});

describe('utbetalningsgrupper', () => {
  it('grupperar blandade PDF-rader separat efter typ och fsg.order', () => {
    const groups = groupPayoutLines([line('Kontrollmätning bilersättning', 50), line('Justering', 250), line('Kontrollmätning grundavgift', 30), line('Montage', 900, '456')]);
    expect(groups.map(g => [g.kind, g.order_number, g.lines.length, g.included])).toEqual([
      ['km', '123', 2, true], ['extra', '123', 1, false], ['extra', '456', 1, false],
    ]);
  });
  it('bokför aldrig avbockade extrajobb', () => {
    const km = row('km');
    const extra = row('extra');
    expect(selectedPayoutRows([km, extra])).toEqual([km]);
    expect(planPayoutInvoices([extra])).toEqual([]);
  });
  it('ger en gemensam faktura per team med rätt titel och totalsumma', () => {
    const plans = planPayoutInvoices([row('km'), row('extra', { included: true })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe('Kontrollmätningar & extra arbeten');
    expect(plans[0].total).toBe(819);
    expect(plans[0].lines.map(l => l.amount)).toEqual([100, 250]);
  });
  it('lägger 469 kr timtillägg bara på KM', () => {
    expect(payoutRowWithHour(row('km'))).toBe(569);
    expect(payoutRowWithHour(row('extra', { included: true }))).toBe(250);
    expect(planPayoutInvoices([row('extra', { included: true })])[0].detailedLines.some(l => l.unit === 'tim')).toBe(false);
  });
  it('väljer titel efter teamets egna rader och håller fakturorna separata', () => {
    const plans = planPayoutInvoices([row('km'), row('extra', { included: true, teamId: 'team2' })]);
    expect(plans.map(p => [p.teamId, p.title, p.total])).toEqual([['team1', 'Kontrollmätningar', 569], ['team2', 'Extra arbeten', 250]]);
  });
  it('använder redigerade extrabelopp och bevarar enskilda fakturarader utan dubblering', () => {
    const plan = planPayoutInvoices([row('extra', { included: true, lines: [line('Justering', 125.5), line('Tätning', 80)] })])[0];
    expect(plan.total).toBe(205.5);
    expect(plan.lines[0]).toEqual({ name: 'Extra arbete — Justering, Tätning, Anna (fsg.order 123)', amount: 205.5 });
    expect(plan.detailedLines.map(l => l.amount)).toEqual([125.5, 80]);
  });
});