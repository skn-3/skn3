import { describe, expect, it } from 'vitest';
import { invoiceEmailData } from '../../../supabase/functions/send-invoice/email';

describe('invoice email data', () => {
  const u = { customer_name: 'Maria Karolina Willumsen', customer_address: 'Kalvgränd 24, Järfälla', handpenning_amount: 124938, slutfaktura_amount: 324812, handpenning_invoice_date: '2026-10-22', slutfaktura_invoice_date: '2026-10-23', rot_amount: 50000 };
  it('uses handpenning invoice date plus ten days and the same logical attachment name', () => {
    const data = invoiceEmailData(u, {}, 'handpenning', 'N3-12');
    expect(data.dueDate).toBe('1 november 2026');
    expect(data.attachmentName).toBe('Handpenningsfaktura-N3-12-Maria-Karolina-Willumsen-Kalvgrand-24-Jarfalla-2026-10-22.pdf');
    expect(data.amount).toBe((124938).toLocaleString('sv-SE') + ' kr');
  });
  it('uses the final invoice date and final amount independently', () => {
    const data = invoiceEmailData(u, {}, 'slutfaktura', 'N3-13');
    expect(data.dueDate).toBe('2 november 2026');
    expect(data.amount).toBe((324812).toLocaleString('sv-SE') + ' kr');
  });
  it('falls back to today plus ten days when invoice date is absent', () => {
    const data = invoiceEmailData({}, {}, 'handpenning', '12', new Date('2026-10-23T12:00:00Z'));
    expect(data.invoiceDate).toBe('2026-10-23');
    expect(data.dueDate).toBe('2 november 2026');
  });
  it('defaults deposit percentage to 25 without overriding an offer percentage', () => {
    expect(invoiceEmailData(u, {}, 'handpenning', '12').hpPercent).toBe(25);
    expect(invoiceEmailData(u, { handpenning_percent: 30 }, 'handpenning', '12').hpPercent).toBe(30);
  });
  it('takes ROT from the assignment and reverse VAT only from the offer', () => {
    expect(invoiceEmailData(u, {}, 'handpenning', '12').rotAmount).toBe(50000);
    expect(invoiceEmailData({}, {}, 'slutfaktura', '12').rotAmount).toBe(0);
    expect(invoiceEmailData(u, { vat_mode: 'omvand' }, 'slutfaktura', '12').reverseVat).toBe(true);
    expect(invoiceEmailData(u, {}, 'slutfaktura', '12').reverseVat).toBe(false);
  });
});