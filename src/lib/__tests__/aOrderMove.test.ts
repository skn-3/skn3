import { describe, it, expect } from 'vitest';
import { aOrderRef, isAOrderEvent, isAOrderDocument, moveEventTexts } from '../aOrderMove';

const order = { id: 'abc12345-0000', order_number: 778, invoice_number: 'Jerk-002' };

describe('aOrderMove', () => {
  it('referens och loggtexter på båda ärendena', () => {
    expect(aOrderRef(order)).toBe('#778');
    expect(moveEventTexts(order, { id: 'a', address: 'Soprangränd 6, Vällingby' }, { id: 'b', address: 'Soprangränd 6' })).toEqual({
      target: 'A-order #778 flyttad hit från Soprangränd 6, Vällingby',
      source: 'A-order #778 flyttad till Soprangränd 6',
    });
  });
  it('flyttar bara händelser som A-ordern skapat', () => {
    expect(isAOrderEvent({ event_type: 'aorder_coupled', description: 'A-order Jerk-002 kopplad. Montör: X.' }, order)).toBe(true);
    expect(isAOrderEvent({ event_type: 'order_link', description: 'A-order 778 kopplad manuellt' }, order)).toBe(true);
    expect(isAOrderEvent({ event_type: 'status_change', description: 'Montörsfaktura Jerk-002 betald 2026-11-01' }, order)).toBe(true);
    expect(isAOrderEvent({ event_type: 'order_link', description: 'A-order 7781 kopplad manuellt' }, order)).toBe(false);
    expect(isAOrderEvent({ event_type: 'status_change', description: 'Fakturerad automatiskt (faktura skickad från A-ORDER)' }, order)).toBe(false);
  });
  it('dokument med samma fakturanummer', () => {
    expect(isAOrderDocument({ doc_type: 'a_order', invoice_number: 'Jerk-002' }, order)).toBe(true);
    expect(isAOrderDocument({ doc_type: 'mockfjards_payout', invoice_number: 'Jerk-002' }, order)).toBe(false);
    expect(isAOrderDocument({ doc_type: 'a_order', invoice_number: 'Jerk-002' }, { id: 'x', order_number: 1 })).toBe(false);
  });
});
