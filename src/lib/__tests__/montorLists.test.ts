import { describe, expect, it } from 'vitest';
import { orderFilterKey, orderSummary, KM_STATUSES, compareMontorCases, relevantCaseDate } from '../montorLists';

describe('montörlistornas urval', () => {
  it('skiljer order från skickad, fakturerad, betald och krediterad', () => {
    expect([
      {}, { order_sent_at: '2026-10-25' }, { status: 'invoiced' },
      { status: 'invoiced', paid_at: '2026-10-25' }, { status: 'credited', paid_at: '2026-10-25' },
    ].map(orderFilterKey)).toEqual(['order', 'sent', 'invoiced', 'paid', 'credited']);
  });
  it('summerar öppna, enbart fakturerat obetalt och betalda under aktuellt år', () => {
    expect(orderSummary([
      {}, { order_sent_at: '2026-10-25' }, { status: 'invoiced', total_amount: 469 },
      { status: 'invoiced', total_amount: 1000, paid_at: '2026-01-01' },
      { status: 'invoiced', paid_at: '2025-12-31' }, { status: 'credited', total_amount: -469, paid_at: '2026-10-25' },
    ], 2026)).toEqual({ open: 2, unpaid: 469, paidThisYear: 1 });
  });
  it('KM innehåller endast väntar KM och KM bokad', () => {
    expect(KM_STATUSES).toEqual(['vantar_km', 'km_bokad']);
  });
  it('sorterar KM på KM-datum, montage på montagedatum och saknat datum sist', () => {
    const a = { status: 'km_bokad', km_date: '2026-10-26', montage_date: '2026-11-02' };
    const b = { status: 'vantar_km', km_date: '2026-10-27', montage_date: '2026-11-01' };
    expect(compareMontorCases(a, b, 'km')).toBeLessThan(0);
    expect(compareMontorCases(a, b, 'montage')).toBeGreaterThan(0);
    expect(compareMontorCases({ status: 'km_bokad' }, a, 'km')).toBeGreaterThan(0);
  });
  it('behåller statusordning i Alla och använder datum vid lika status', () => {
    expect(compareMontorCases({ status: 'vantar_km', km_date: '2026-12-01' }, { status: 'km_bokad', km_date: '2026-10-01' }, 'alla')).toBeLessThan(0);
    expect(compareMontorCases({ status: 'km_bokad', km_date: '2026-10-26' }, { status: 'km_bokad', km_date: '2026-10-27' }, 'alla')).toBeLessThan(0);
  });
  it('visar KM-datum under KM-fasen och annars montagedatum', () => {
    expect(relevantCaseDate({ status: 'km_klar', km_date: '2026-10-25', montage_date: '2026-11-01' })).toBe('2026-10-25');
    expect(relevantCaseDate({ status: 'montage_bokat', km_date: '2026-10-25', montage_date: '2026-11-01' })).toBe('2026-11-01');
  });
});
import { montorSummary } from '../montorLists';
describe('montorSummary', () => {
  it('räknar utestående och intjänat med fakturor, krediter och debiteringar', () => {
    const orders = [
      { status: 'invoiced', total_amount: 10000, invoice_number: 'A1', invoice_sent_at: '2026-03-01', paid_at: '2026-03-20' },
      { status: 'invoiced', total_amount: 5000, invoice_number: 'A2', invoice_sent_at: '2026-10-01' },
      { status: 'order', total_amount: 3000, order_sent_at: '2026-10-20' },
      { status: 'credited', total_amount: -2000, credited_from_order_id: 'x', invoice_number: 'K1', date: '2026-09-01' },
    ];
    const invoices = [
      { kind: 'self_billing', status: 'paid', total: 790, date: '2026-05-01', paid_at: '2026-05-10' },
      { kind: 'debit', status: 'sent', total: 1200, date: '2026-10-10' },
    ];
    expect(montorSummary(orders, invoices, 2026)).toEqual({
      pendingCount: 1, pendingAmount: 3000, waiting: 5000, unpaidDebit: 1200,
      outstanding: 3000 + 5000 - 1200, earned: 10000 + 5000 - 2000 + 790 - 1200, paidOut: 10790,
    });
  });
});
