import { describe, it, expect } from 'vitest';
import { serviceOrderPrefillFromInvoice } from '../serviceOrder';

describe('serviceOrderPrefillFromInvoice', () => {
  const parsed = {
    invoice_number: '9123456',
    invoice_date: '2026-10-22',
    sales_order_number: '20525300',
    customer_name: 'Anna Ek',
    team_prefix: 'alex',
    line_items: [
      { name: 'Byte låskista', unit_price: 850, qty: 1, amount: 850 },
      { name: 'Restid', unit_price: 11.73, qty: 40, amount: 469 },
    ],
  };
  const teams = [{ id: 't1', invoice_prefix: 'SAMY' }, { id: 't2', invoice_prefix: 'ALEX' }];

  it('tar raderna 1:1, Mockfjärds som betalare och Fsg.order', () => {
    const p = serviceOrderPrefillFromInvoice(parsed, teams);
    expect(p.line_items).toEqual(parsed.line_items);
    expect(p.payer).toBe('mockfjards');
    expect(p.mockfjards_order_number).toBe('20525300');
    expect(p.mockfjards_invoice_number).toBe('9123456');
    expect(p.date).toBe('2026-10-22');
    expect(p.customer_name).toBe('Anna Ek');
    expect(p.description_line).toBe('Enligt Mockfjärds faktura 9123456');
  });

  it('matchar team på prefix oavsett skiftläge', () => {
    expect(serviceOrderPrefillFromInvoice(parsed, teams).team_id).toBe('t2');
    expect(serviceOrderPrefillFromInvoice({ ...parsed, team_prefix: 'NOPE' }, teams).team_id).toBeNull();
  });
});
