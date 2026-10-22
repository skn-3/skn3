import { describe, it, expect } from 'vitest';
import { buildHandpenningDocDef, buildSlutfakturaDocDef, cleanTitle } from '../invoicePdf';

const assets = { logoWhite: null, sans: 'Figtree', display: 'Bricolage' };
const priv: any = {
  uppdrag_number: 'U-1', customer_name: 'Anna Andersson', customer_type: 'privat', customer_personnummer: '19800101-1234',
  customer_address: 'Gatan 1', fastighetsbeteckning: 'Huddinge 1:2', title: 'Offert – Fönsterbyte',
  revenue_ex_vat: 399800, revenue_incl_vat: 499750, rot_amount: 50000,
  handpenning_amount: 124938, slutfaktura_amount: 324812, handpenning_invoice_no: '1001',
};
const privOffer: any = { offer_number: '2026-0017', vat_mode: 'vanlig', rot_base: 200000, rot_percent: 30, handpenning_percent: 25,
  line_items: [{ id: '1', description: 'Arbete', is_labor: true, qty: 1, unit: 'st', unit_price: 160000, amount: 160000 }] };
const opts = { invoiceNo: '1002', invoiceDate: new Date('2026-10-22') };

describe('invoicePdf', () => {
  it('handpenning privatkund', () => {
    const s = JSON.stringify(buildHandpenningDocDef(priv, privOffer, opts, assets));
    expect(s).toContain('124 938 kr');
    expect(s).toContain('Moms 25 %');
    expect(s).not.toContain('Personnr');
  });

  it('slutfaktura privatkund', () => {
    const s = JSON.stringify(buildSlutfakturaDocDef(priv, privOffer, opts, assets));
    expect(s).toContain('324 812 kr');
    expect(s).toContain('Avgår handpenning');
    expect(s).toContain('−50 000 kr');
    expect(s).toContain('Personnr');
  });

  it('omvänd moms företagskund', () => {
    const company: any = { ...priv, customer_type: 'foretag', customer_personnummer: null, rot_amount: 0,
      revenue_ex_vat: 400000, revenue_incl_vat: 400000, handpenning_amount: 100000, slutfaktura_amount: 300000 };
    const offer: any = { ...privOffer, vat_mode: 'omvand' };
    for (const d of [buildHandpenningDocDef(company, offer, opts, assets), buildSlutfakturaDocDef(company, offer, opts, assets)]) {
      const s = JSON.stringify(d);
      expect(s).toContain('Omvänd betalningsskyldighet');
      expect(s).not.toContain('Moms 25 %');
    }
  });

  it('cleanTitle', () => {
    expect(cleanTitle('Offert – Fönsterbyte')).toBe('Fönsterbyte');
  });
});
