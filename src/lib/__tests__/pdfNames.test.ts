import { describe, it, expect } from 'vitest';
import { slugPart, datePart, aOrderPdfName, invoicePdfName, creditPdfName, aOrderDocumentName, montorInvoicePdfName, offerPdfName, uppdragInvoicePdfName } from '../pdfNames';

describe('pdfNames', () => {
  it('slugPart gör svenska tecken och mellanslag filnamnssäkra', () => {
    expect(slugPart('Bergsvägen 48, Lidingö')).toBe('Bergsvagen-48-Lidingo');
    expect(slugPart('  Älvkvarnsvägen 104 / Spånga  ')).toBe('Alvkvarnsvagen-104-Spanga');
    expect(slugPart('Zabergsvägen 24B ,  645 71 Strängnäs')).toBe('Zabergsvagen-24B-645-71-Strangnas');
    expect(slugPart('x'.repeat(100), 10)).toBe('xxxxxxxxxx');
    expect(slugPart(null)).toBe('');
  });

  it('datePart klipper ut YYYY-MM-DD', () => {
    expect(datePart('2026-10-20T15:42:11.000Z')).toBe('2026-10-20');
    expect(datePart('2026-10-20')).toBe('2026-10-20');
    expect(datePart(null)).toBe('');
    expect(datePart('inte ett datum')).toBe('');
  });

  const order = {
    order_number: 756, invoice_number: 'TOMEK-003', customer_address: 'Bergsvägen 48, Lidingö',
    date: '2026-10-19', invoice_sent_at: '2026-10-20T15:42:11.000Z', status: 'invoiced', credited_from_order_id: null,
    montor_teams: { name: 'Tomek' },
  };

  it('namnger A-order, faktura och kreditfaktura', () => {
    expect(aOrderPdfName(order)).toBe('A-order-756-Tomek-Bergsvagen-48-Lidingo-2026-10-19.pdf');
    expect(invoicePdfName(order)).toBe('Faktura-TOMEK-003-Tomek-Bergsvagen-48-Lidingo-2026-10-20.pdf');
    expect(creditPdfName({ ...order, invoice_number: 'TOMEK-005', credited_from_order_id: 'x' })).toBe('Kreditfaktura-TOMEK-005-Tomek-Bergsvagen-48-Lidingo-2026-10-20.pdf');
  });

  it('aOrderDocumentName väljer typ efter status', () => {
    expect(aOrderDocumentName({ ...order, status: 'order', invoice_number: null, invoice_sent_at: null })).toMatch(/^A-order-756-/);
    expect(aOrderDocumentName(order)).toMatch(/^Faktura-TOMEK-003-/);
    expect(aOrderDocumentName({ ...order, status: 'credited', credited_from_order_id: 'abc' })).toMatch(/^Kreditfaktura-TOMEK-003-/);
    expect(aOrderDocumentName({ ...order, status: 'credited' })).toMatch(/^Faktura-TOMEK-003-/);
  });

  it('hoppar över tomma delar utan dubbla bindestreck', () => {
    expect(aOrderPdfName({ order_number: 12, customer_address: '', date: '2026-04-13', montor_teams: null })).toBe('A-order-12-2026-04-13.pdf');
  });

  it('namnger montörsfakturor, offerter och uppdragsfakturor', () => {
    expect(montorInvoicePdfName({ invoice_number: 'GVMO-048', kind: 'self_billing', title: 'Kontrollmätningar', date: '2026-09-18', total: 2791, montor_teams: { name: 'GVMO' } }))
      .toBe('Sjalvfaktura-GVMO-048-GVMO-Kontrollmatningar-2026-09-18.pdf');
    expect(montorInvoicePdfName({ invoice_number: 'GVMO-45', kind: 'debit', title: 'Kreditfaktura', date: '2026-09-16', total: -4278, credited_from_invoice_id: 'x', montor_teams: { name: 'GVMO' } }))
      .toBe('Kreditfaktura-GVMO-45-GVMO-Kreditfaktura-2026-09-16.pdf');
    expect(offerPdfName({ offer_number: '2026-0016', customer_name: 'Sandra Thernelius', customer_address: 'Fyrklöversbackarna 3, Hässelby', created_at: '2026-10-13T08:00:00Z' }))
      .toBe('Offert-2026-0016-Sandra-Thernelius-Fyrkloversbackarna-3-Hasselby-2026-10-13.pdf');
    expect(uppdragInvoicePdfName({ customer_name: 'Anna Ek', address: 'Storgatan 1' }, 'slutfaktura', '2026-0012', '2026-10-20'))
      .toBe('Slutfaktura-2026-0012-Anna-Ek-Storgatan-1-2026-10-20.pdf');
  });
});
