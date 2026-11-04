import { describe, expect, it } from 'vitest';
import { parseMockfjardsHeader, parseSwedishAmount, parseCompactDate, interpretMockfjards, validateMockfjards, invoiceNumberFromFileName, type PdfTextItem } from './mockfjardsInvoice';

// Textlagret ur en riktig MIKH0291 (från användarens exempel).
const MIKH0291_TEXT = `Fakturanummer ...............: MIKH0291
Datum ..............................: 20260907
Förfallodatum...................: 20260917
Betalning..........................: 10 dagar netto
Försäljningssaldo Totalrabatt Tillägg Moms Avrundning Total
6 384,76 0,00 0,00 0,00 0,00 6 384,76SEK`;

/** Bygger positionerade textobjekt rad för rad (y minskar nedåt som i PDF). */
function items(rows: [number, string][][]): PdfTextItem[] {
  return rows.flatMap((row, i) => row.map(([x, str]) => ({ str, x, y: 800 - i * 15, page: 1 })));
}
const header = (date: string, due: string, nr = 'MIKH0291'): [number, string][][] => [
  [[340, `Fakturanummer ...............: ${nr}`]],
  [[340, `Datum ..............................: ${date}`]],
  [[340, `Förfallodatum...................: ${due}`]],
  [[42, 'Fsg. order'], [113, 'Namn'], [227, 'Notering'], [397, 'Kvt'], [440, 'á pris'], [524, 'Belopp']],
  [[42, '30149460'], [113, 'Isho Lindgren'], [227, 'Kontrollmätning grundavgift'], [420, '1'], [460, '1 500,00'], [540, '1 500,00']],
  [[42, '30149460'], [113, 'Isho Lindgren'], [227, 'Bilersättning'], [418, '12'], [465, '25,00'], [545, '300,00']],
  [[42, '30149461'], [113, 'Anna Berg'], [227, 'Montage fönster'], [420, '2'], [460, '2 292,38'], [540, '4 584,76']],
  [[42, 'Försäljningssaldo Totalrabatt Tillägg Moms Avrundning Total']],
  [[42, '6 384,76 0,00 0,00 0,00 0,00 6 384,76SEK']],
];

describe('Mockfjärds-huvud ur textlagret', () => {
  it('läser MIKH0291 exakt', () => {
    expect(parseMockfjardsHeader(MIKH0291_TEXT)).toEqual({ invoice_number: 'MIKH0291', invoice_date: '2026-09-07', due_date: '2026-09-17', total_amount: 6384.76 });
  });
  it('svenska belopp och kompakta datum', () => {
    expect(parseSwedishAmount('6 384,76')).toBe(6384.76);
    expect(parseSwedishAmount('29 920,93')).toBe(29920.93);
    expect(parseCompactDate('20260231')).toBeNull();
  });
  it('fakturanummer ur filnamnet', () => {
    expect(invoiceNumberFromFileName('Fakturanr_MIKH0218_Ordernr_30149460.pdf')).toBe('MIKH0218');
  });
});

describe('hela tolkningen', () => {
  it('MIKH0291: rader summerar till Total och inga varningar', () => {
    const r = interpretMockfjards(items(header('20260907', '20260917')), 'Fakturanr_MIKH0291_Ordernr_30149460.pdf', '2026-09-10');
    expect(r.is_mockfjards).toBe(true);
    expect(r.header).toEqual({ invoice_number: 'MIKH0291', invoice_date: '2026-09-07', due_date: '2026-09-17', total_amount: 6384.76 });
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toMatchObject({ order_number: '30149460', customer_name: 'Isho Lindgren', name: 'Kontrollmätning grundavgift', qty: 1, unit_price: 1500, amount: 1500 });
    expect(r.line_sum).toBe(6384.76);
    expect(r.warnings).toEqual([]);
  });
  it('fel år ger varning (mer än 150 dagar från idag)', () => {
    const r = interpretMockfjards(items(header('20241016', '20241026', 'MIKH0334')), 'Fakturanr_MIKH0334_Ordernr_1.pdf', '2026-10-20');
    expect(r.header.invoice_date).toBe('2024-10-16');
    expect(r.warnings.some(w => w.includes('150 dagar'))).toBe(true);
  });
  it('fakturanummer i filnamnet som inte stämmer ger varning', () => {
    const r = interpretMockfjards(items(header('20260707', '20260717', 'MIKH0220')), 'Fakturanr_MIKH0218_Ordernr_1.pdf', '2026-07-10');
    expect(r.warnings.some(w => w.includes('MIKH0218'))).toBe(true);
  });
});

describe('validering innan sparande', () => {
  const ok = { fileName: 'Fakturanr_MIKH0331_x.pdf', invoiceNumber: 'MIKH0331', invoiceDate: '2026-10-01', dueDate: '2026-10-11', total: 29920.93, lineSum: 29920.93, hasLines: true, today: '2026-10-05' };
  it('radernas summa måste vara Total ±1 kr', () => {
    expect(validateMockfjards(ok)).toEqual([]);
    expect(validateMockfjards({ ...ok, lineSum: 29920.0 })).toEqual([]);
    expect(validateMockfjards({ ...ok, lineSum: 408 }).some(w => w.includes('Radernas summa'))).toBe(true);
  });
  it('förfallodatum 5–35 dagar efter fakturadatum', () => {
    expect(validateMockfjards({ ...ok, dueDate: '2026-10-06' })).toEqual([]);
    expect(validateMockfjards({ ...ok, dueDate: '2026-11-05' })).toEqual([]);
    expect(validateMockfjards({ ...ok, dueDate: '2026-10-05' }).length).toBe(1);
    expect(validateMockfjards({ ...ok, dueDate: '2026-11-06' }).length).toBe(1);
  });
});
