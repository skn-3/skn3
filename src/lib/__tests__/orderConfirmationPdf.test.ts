import { describe, it, expect } from 'vitest';
import { plannedExecution, hasCustomTerms, firstName, buildOrderConfirmationDocDef } from '../orderConfirmationPdf';

describe('orderConfirmationPdf', () => {
  it('plannedExecution hittar planerat utförande', () => {
    expect(plannedExecution({ description: 'Arbetet utförs preliminärt april 2027.', payment_terms: '' })).toBe('Preliminärt april 2027');
    expect(plannedExecution({ description: 'Start planeras till september 2026', payment_terms: '' })).toBe('september 2026');
    expect(plannedExecution({ description: 'Byte av fönster.', payment_terms: '' })).toBeNull();
  });

  it('hasCustomTerms', () => {
    expect(hasCustomTerms('10 dagar netto')).toBe(false);
    expect(hasCustomTerms('10 dagar netto.')).toBe(false);
    expect(hasCustomTerms('Ingenting faktureras vid signering. …')).toBe(true);
    expect(hasCustomTerms('')).toBe(false);
  });

  it('firstName', () => {
    expect(firstName('Maria Karolina Willumsen')).toBe('Maria');
    expect(firstName(null)).toBe('');
  });

  it('bygger dokumentdefinitionen', () => {
    const offer: any = {
      offer_number: '2026-0017', customer_type: 'privat', customer_name: 'Maria Karolina Willumsen',
      line_items: [{ id: '1', description: 'Arbete', is_labor: true, qty: 1, unit: 'st', unit_price: 21280, amount: 21280 }],
      vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, handpenning_percent: 25,
    };
    const doc = buildOrderConfirmationDocDef(offer, { name: 'Maria Karolina Willumsen', acceptedAt: '2026-10-15T09:09:28.549Z' }, { logoWhite: null, sans: 'Roboto', display: 'Roboto' });
    expect(doc.pageSize).toBe('A4');
    expect(doc.info.title.startsWith('Orderbekräftelse')).toBe(true);
    const s = JSON.stringify(doc.content);
    expect(s).toContain('Tack för din order, Maria!');
    expect(s).toContain('Johannes Klum');
    expect(s).toContain('Processen efter beställning');
  });
});
