import { describe, expect, it } from 'vitest';
import {
  debitRelatedInvoiceLine, eligibleDeductions, relatedInvoiceLabel, relatedInvoiceNotice, relatedInvoiceOptions,
  RELATED_INVOICE_NOT_INCLUDED, type DebitLike, type RelatedInvoiceSource,
} from '../montorSettlement';

const T1 = 'team-1';
const nb = (s: string) => s.replace(/\u00a0/g, ' ');

describe('avdrag som avser en viss faktura', () => {
  const blas = { invoice_number: 'ALEX-094', order_number: 692, order_kind: 'standard', customer_address: 'Blåsippsbacken 93, Vällingby' };

  it('debetfakturans rad: nummer, A-ordernummer och adress', () => {
    expect(debitRelatedInvoiceLine(blas)).toBe('Avser faktura ALEX-094 (A-order #692, Blåsippsbacken 93, Vällingby)');
  });
  it('debetfakturans rad för serviceorder och utan koppling', () => {
    expect(debitRelatedInvoiceLine({ ...blas, order_kind: 'service' })).toBe('Avser faktura ALEX-094 (Serviceorder #692, Blåsippsbacken 93, Vällingby)');
    expect(debitRelatedInvoiceLine(null)).toBeNull();
  });

  it('utbetalningsdialogen visar nuvarande nummer med adress, montörsvyn bara numret', () => {
    const refakturerad = { ...blas, invoice_number: 'ALEX-097' };
    expect(relatedInvoiceLabel(refakturerad)).toBe('Avser ALEX-097 (Blåsippsbacken 93, Vällingby)');
    expect(relatedInvoiceLabel(refakturerad, false)).toBe('Avser ALEX-097');
  });

  it('notis när fakturan avdraget avser inte är ikryssad, annars ingen', () => {
    expect(relatedInvoiceNotice('a-1', ['a-2'])).toBe(RELATED_INVOICE_NOT_INCLUDED);
    expect(RELATED_INVOICE_NOT_INCLUDED).toBe('Fakturan som avdraget avser är inte med i den här utbetalningen');
    expect(relatedInvoiceNotice('a-1', ['a-2', 'a-1'])).toBeNull();
    expect(relatedInvoiceNotice(null, [])).toBeNull();
  });

  it('avdragsraden i grupp C får texten från den kopplade A-orderraden', () => {
    const d: DebitLike = {
      id: 'd1', team_id: T1, kind: 'debit', status: 'sent', total: 2000, paid_at: null, invoice_number: 'N3-010', date: '2026-11-16',
      created_at: '2026-11-16T08:00:00Z', credited_from_invoice_id: null, settle_mode: 'avrakning', title: 'Skada', description: 'Repad karm',
      related_a_order_id: 'a-1', related_order: { ...blas, invoice_number: 'ALEX-097' },
    };
    const [c] = eligibleDeductions(T1, [d, { ...d, id: 'd2', invoice_number: 'N3-011', related_a_order_id: null, related_order: null }], []);
    expect(c.related_a_order_id).toBe('a-1');
    expect(c.related_label).toBe('Avser ALEX-097 (Blåsippsbacken 93, Vällingby)');
    expect(eligibleDeductions(T1, [{ ...d, related_a_order_id: null, related_order: null }], [])[0].related_label).toBeNull();
  });

  describe('fakturor att välja i "Avser faktura"', () => {
    const o = (x: Partial<RelatedInvoiceSource> & { id: string }): RelatedInvoiceSource => ({
      team_id: T1, status: 'invoiced', total_amount: 37929, paid_at: null, invoice_number: `ALEX-${x.id}`, invoice_sent_at: '2026-11-10T10:00:00Z',
      date: '2026-11-10', credited_from_order_id: null, customer_address: 'Blåsippsbacken 93, Vällingby', order_kind: 'standard', case_id: 'case-1', ...x,
    });
    const rows = [
      o({ id: '090', invoice_sent_at: '2026-11-01T10:00:00Z' }),
      o({ id: '094', invoice_sent_at: '2026-11-12T10:00:00Z' }),
      o({ id: '091', status: 'credited', invoice_sent_at: '2026-11-05T10:00:00Z' }), // krediterat original: med
      o({ id: '095', status: 'credited', credited_from_order_id: 'x', total_amount: -37929 }), // kreditfakturan: inte med
      o({ id: '096', team_id: 'team-2' }), // annat team
      o({ id: '097', invoice_number: null, status: 'order' }), // ingen faktura
      o({ id: '098', order_kind: 'service', invoice_sent_at: '2026-11-08T10:00:00Z' }),
    ];
    it('bara valt teams fakturor med nummer, krediterade original men inte kreditfakturor, nyast först', () => {
      expect(relatedInvoiceOptions(T1, rows).map(r => r.invoice_number)).toEqual(['ALEX-094', 'ALEX-098', 'ALEX-091', 'ALEX-090']);
      expect(relatedInvoiceOptions(null, rows)).toEqual([]);
    });
    it('visning "ALEX-094 · adress · belopp" och fakturans ärende', () => {
      const [first] = relatedInvoiceOptions(T1, rows);
      expect(nb(first.label)).toBe('ALEX-094 · Blåsippsbacken 93, Vällingby · 37 929 kr');
      expect(first.case_id).toBe('case-1');
    });
  });
});
