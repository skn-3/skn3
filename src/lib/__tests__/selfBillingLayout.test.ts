import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import { fmtKr, drawSelfBillingInvoice, type SelfBillingInvoice } from '../selfBillingLayout';

const base: SelfBillingInvoice = {
  kind: 'invoice',
  invoiceNumber: '42',
  date: '2026-10-21',
  seller: { company_name: 'VPLG AB', name: 'Gabriel Hanna', org_nr: '559123-4567', address: 'Testvägen 1, 123 45 Staden', bankgiro: 'SEB 5222-03 319 11' },
  reference: 'Konsultprovision oktober 2026',
  lines: [{ description: 'Konsult Provision', qty: 1, unit: 'st', unit_price: 1000, amount: 1000 }],
  vatMode: 'vanlig',
  subtotal: 1000,
  vatAmount: 250,
  total: 1250,
};

function allText(doc: jsPDF): string {
  const pages = doc.getNumberOfPages();
  let out = '';
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    out += JSON.stringify((doc as any).getText?.() ?? '') + '\n';
    const items = (doc as any).internal?.pages?.[p] ?? [];
    out += items.join('\n');
  }
  return out;
}

describe('selfBillingLayout köpare', () => {
  it('utan buyer används SmartKlimat N3prenad AB', () => {
    const doc = drawSelfBillingInvoice(new jsPDF(), base);
    const text = allText(doc);
    expect(text).toContain('SmartKlimat N3prenad AB');
    expect(text).not.toContain('Daniel Malke AB');
  });

  it('med buyer ritas betalaren och inte N3prenad', () => {
    const doc = drawSelfBillingInvoice(new jsPDF(), {
      ...base,
      buyer: {
        name: 'Daniel Malke AB',
        addressLines: ['Betalargatan 2', '111 22 Stockholm'],
        orgNr: '559999-0000',
        vatNr: 'SE559999000001',
        email: 'ekonomi@dmab.se',
      },
    });
    const text = allText(doc);
    expect(text).toContain('Daniel Malke AB');
    expect(text).not.toContain('N3prenad');
  });

  it('hoppar över tomma delar i den nedersta raden', () => {
    const doc = drawSelfBillingInvoice(new jsPDF(), {
      ...base,
      buyer: { name: 'Daniel Malke AB', addressLines: ['Gatan 1'], orgNr: '1', vatNr: '' },
    });
    const text = allText(doc);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
  });
});

describe('fmtKr', () => {
  it('visar öre bara när de finns', () => {
    expect(fmtKr(808.5).replace(/\s/g, ' ')).toBe('808,50 kr');
    expect(fmtKr(3234).replace(/\s/g, ' ')).toBe('3 234 kr');
  });
});
