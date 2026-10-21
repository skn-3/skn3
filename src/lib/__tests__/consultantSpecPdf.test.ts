import { describe, it, expect } from 'vitest';
import { buildConsultantSpecPdf } from '../consultantSpecPdf';

describe('buildConsultantSpecPdf', () => {
  it('returnerar ett jsPDF-objekt med minst en sida', () => {
    const doc = buildConsultantSpecPdf({
      consultant: {
        name: 'Gabriel Hanna',
        company_name: 'VPLG AB',
        payer_name: 'Daniel Malke AB',
        commission_tiers: [
          { upTo: 100000, pct: 30 },
          { upTo: null, pct: 50 },
        ],
      },
      payout: {
        kind: 'payout',
        payout_month: '2026-10-01',
        period_start: '2026-09-01',
        period_end: '2026-09-30',
        invoice_number: 42,
        invoice_date: '2026-10-21',
        provision_payout_date: '2026-10-07',
        tb_rows: [{ order_number: '12345', customer_name: 'Anna Ek', signing_date: '2026-09-12', amount: 50000 }],
        tb_corrections: [{ order_number: null, customer_name: null, text: 'Korrigering', amount: -1000 }],
        tb_sum_rows: 50000,
        tb_sum_corrections: -1000,
        tb_amount: 49000,
        tier_pct: 30,
        commission_gross: 14700,
        deductions_total: 450,
        loan_change: -1000,
        net_amount: 13250,
        vat_rate: 25,
        vat_amount: 3312.5,
        total_incl_vat: 16562.5,
      },
      lines: [
        { kind: 'receipt', label: 'Trängselskatt', amount: 450, doc_type: 'trangselskatt', doc_date: '2026-09-20', reg_nr: 'ABC123', doc_number: '999888', included: true, duplicate_of: null },
        { kind: 'receipt', label: 'Dubblettkvitto', amount: 450, doc_type: 'trangselskatt', included: false, duplicate_of: 'x' },
      ],
      loanBalanceBefore: 5000,
      loanBalanceAfter: 4000,
      generatedBy: 'admin@smartklimat.org',
    });
    expect(typeof doc.getNumberOfPages).toBe('function');
    expect(typeof doc.output).toBe('function');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('hanterar tomt underlag utan att kasta', () => {
    const doc = buildConsultantSpecPdf({
      consultant: { name: 'Gabriel Hanna', company_name: 'VPLG AB', payer_name: 'Daniel Malke AB', commission_tiers: [] },
      payout: { kind: 'advance', invoice_number: 43, invoice_date: '2026-10-21', net_amount: 10000, vat_rate: 25, vat_amount: 2500, total_incl_vat: 12500, loan_change: 10000 },
      lines: [],
      loanBalanceBefore: 0,
      loanBalanceAfter: 10000,
      generatedBy: 'admin@smartklimat.org',
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
