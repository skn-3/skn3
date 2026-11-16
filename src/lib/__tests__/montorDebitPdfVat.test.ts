import { describe, expect, it } from 'vitest';
import { buildMontorDebitPdf } from '../montorDebitPdf';

const team = { name: 'GVMO', company_name: 'GVMO Montage AB', org_nr: '556677-8899', address: 'Byggvägen 4, 123 45 Stockholm' };
function pdfText(vatMode: 'omvand' | 'vanlig' | 'ingen', debitType: any) {
  const doc = buildMontorDebitPdf({
    invoiceNumber: 'N3-099', date: '2026-11-16', team, lines: [{ description: 'Test', qty: 1, unit: 'st', unit_price: 4000, amount: 4000 }],
    vatMode, subtotal: 4000, vatAmount: vatMode === 'vanlig' ? 1000 : 0, total: vatMode === 'vanlig' ? 5000 : 4000, debitType, settleMode: 'avrakning',
  } as any);
  return doc.output();
}

describe('debetfakturans köparmomsnummer', () => {
  it('visar montörens momsreg.nr vid omvänd betalningsskyldighet', () => {
    expect(pdfText('omvand', 'byggtjanst')).toContain('Momsreg.nr SE556677889901');
  });
  it('visar inget köparmomsnummer vid vanlig moms eller ingen moms', () => {
    expect(pdfText('vanlig', 'material_frakt')).not.toContain('SE556677889901');
    expect(pdfText('ingen', 'skada_merkostnad')).not.toContain('SE556677889901');
  });
});
