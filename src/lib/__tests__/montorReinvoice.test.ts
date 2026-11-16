import { describe, expect, it } from 'vitest';
import {
  allocateSettlement, currentAOrderDocKey, eligibleCredits, eligibleInvoices, isCurrentInvoiceCredited,
  settlementNumbersByAOrderInvoice, type AOrderLike, type SettlementItemLike,
} from '../montorSettlement';

// En krediterad A-order faktureras om på SAMMA rad: ALEX-094 krediteras (ALEX-095),
// raden faktureras om som ALEX-097. Kreditfakturan är skapad före radens nya invoice_sent_at.
const T = 'team-alex';
const row = (o: Partial<AOrderLike> = {}): AOrderLike => ({
  id: 'row', team_id: T, status: 'invoiced', total_amount: 30000, paid_at: null, invoice_number: 'ALEX-097',
  invoice_sent_at: '2026-11-16T10:05:00.123Z', date: '2026-11-01', credited_from_order_id: null,
  customer_address: 'Blåsippsbacken 93, Vällingby', order_kind: 'standard', order_number: 692, ...o,
});
const credit = (o: Partial<AOrderLike> = {}): AOrderLike => ({
  id: 'kredit', team_id: T, status: 'credited', total_amount: -37929, paid_at: null, invoice_number: 'ALEX-095',
  invoice_sent_at: '2026-11-16T10:00:00Z', date: '2026-11-16', credited_from_order_id: 'row',
  created_at: '2026-11-16T10:00:00.456789+00:00', credited_invoice_number: 'ALEX-094', credit_refund_due: false,
  customer_address: 'Blåsippsbacken 93, Vällingby', order_kind: 'standard', ...o,
});
const item = (i: Partial<SettlementItemLike>): SettlementItemLike => ({
  item_kind: 'invoice', a_order_id: 'row', debit_invoice_id: null, document_number: 'ALEX-094', amount: 37929,
  active: true, settlement_number: 'UTB-001', settlement_status: 'paid', ...i,
});

describe('omfakturerad A-order (samma rad, nytt nummer)', () => {
  it('kreditfaktura före radens nuvarande invoice_sent_at gäller en tidigare faktura', () => {
    expect(isCurrentInvoiceCredited(row(), [credit()])).toBe(false);
  });
  it('kreditfaktura vid eller efter invoice_sent_at betyder att nuvarande faktura är krediterad', () => {
    expect(isCurrentInvoiceCredited(row(), [credit({ created_at: '2026-11-16T10:05:00.123Z' })])).toBe(true);
    expect(isCurrentInvoiceCredited(row(), [credit({ created_at: '2026-11-16T11:00:00Z' })])).toBe(true);
  });
  it('(a) obetald faktura krediterad och omfakturerad lägre: nya fakturan i grupp A, krediten inte i grupp B', () => {
    const orders = [row({ total_amount: 30000 }), credit({ credit_refund_due: false })];
    const a = eligibleInvoices(T, orders, [], []);
    expect(a.map(c => [c.id, c.number, c.amount])).toEqual([['row', 'ALEX-097', 30000]]);
    expect(eligibleCredits(T, orders, [], [])).toEqual([]);
  });
  it('(a) radens paid_at från en senare betalning gör inte en obetald kreditering kvittningsbar', () => {
    const orders = [row({ paid_at: '2026-11-20' }), credit({ credit_refund_due: false })];
    expect(eligibleCredits(T, orders, [], [])).toEqual([]);
  });
  it('(b) betald faktura krediterad och omfakturerad: kredit i B, ny faktura i A, netto = skillnaden', () => {
    const orders = [row({ total_amount: 40000 }), credit({ credit_refund_due: true })];
    const a = eligibleInvoices(T, orders, [], []);
    const b = eligibleCredits(T, orders, [], []);
    expect(b.map(c => [c.id, c.label])).toEqual([['kredit', 'Kreditering av ALEX-094 · Blåsippsbacken 93, Vällingby']]);
    const r = allocateSettlement({ invoices: a.map(i => i.amount), credits: b.map(c => c.amount), deductions: [] });
    expect(r).toMatchObject({ error: null, invoicesTotal: 40000, creditsTotal: 37929, net: 2071 });
  });
  it('(c) faktura betald via UTB, krediterad och omfakturerad kan tas med i en ny UTB', () => {
    const orders = [row(), credit({ credit_refund_due: true })];
    const items = [item({ document_number: 'ALEX-094', settlement_status: 'paid' })];
    expect(eligibleInvoices(T, orders, [], items).map(c => c.number)).toEqual(['ALEX-097']);
  });
  it('samma fakturanummer i en aktiv utbetalning utesluter fakturan', () => {
    const items = [item({ document_number: 'ALEX-097', settlement_status: 'created' })];
    expect(eligibleInvoices(T, [row()], [], items)).toEqual([]);
  });
  it('"Ingår i UTB-xxx" bara när numret stämmer med radens nuvarande faktura', () => {
    const items = [item({ document_number: 'ALEX-094', settlement_number: 'UTB-001' })];
    const map = settlementNumbersByAOrderInvoice(items);
    expect(map.get(currentAOrderDocKey(row()))).toBeUndefined();
    expect(map.get(currentAOrderDocKey(row({ invoice_number: 'ALEX-094' })))).toEqual(['UTB-001']);
    expect(settlementNumbersByAOrderInvoice(items, ['created', 'sent']).size).toBe(0);
  });
});
