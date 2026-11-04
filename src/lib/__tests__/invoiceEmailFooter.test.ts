import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INVOICE_EMAIL_FOOTER_ROW, INVOICE_EMAIL_FOOTER_TEXT } from '../../../supabase/functions/_shared/invoiceEmailFooter';

const fn = (p: string) => readFileSync(resolve(__dirname, '../../../supabase/functions', p), 'utf8');

describe('invoice email footer', () => {
  it('states F-skatt approval with the company details', () => {
    expect(INVOICE_EMAIL_FOOTER_TEXT).toBe('SmartKlimat N3prenad AB · Org.nr 559026-6630 · Godkänd för F-skatt · Morsstigen 3, 141 71 Segeltorp · n3prenad@smartklimat.org');
  });
  it('is identical to the footer in the assignment invoice email', () => {
    expect(fn('send-invoice/email.ts')).toContain(INVOICE_EMAIL_FOOTER_ROW);
  });
  it('is used by every A-order invoice/credit template', () => {
    expect(fn('send-a-order-invoice/index.ts').match(/\$\{INVOICE_EMAIL_FOOTER_ROW\}/g)?.length).toBe(1);
  });
  it('is used by invoice, self-billing and credit templates for installer invoices', () => {
    expect(fn('send-montor-debit-invoice/index.ts').match(/\$\{INVOICE_EMAIL_FOOTER_ROW\}/g)?.length).toBe(3);
  });
});
