import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import {
  allocateSettlement, AVRAKNING_NOTICE, DEBIT_TYPES, debitTotals, debitVatMode, debitVatText, deductionStatusText,
  eligibleCredits, eligibleDeductions, eligibleInvoices, formatPaymentAmount, round2, settlementPaymentLine,
  settlementStatusText, SETTLEMENT_CREDIT_CUTOFF, teamPayoutOverview, type AOrderLike, type DebitLike, type SettlementItemLike,
} from '../montorSettlement';
import { REVERSE_CHARGE_TEXT } from '../selfBillingLayout';
import { settlementPdfName } from '../pdfNames';
import { buildMontorSettlementPdf, settlementPayoutBoxText } from '../montorSettlementPdf';
import { buildSettlementEmailHtml, settlementRecipients, settlementSubject } from '../../../supabase/functions/send-montor-settlement/email';

const T1 = 'team-1';
const T2 = 'team-2';

const order = (o: Partial<AOrderLike> & { id: string }): AOrderLike => ({
  team_id: T1, status: 'invoiced', total_amount: 10000, paid_at: null, invoice_number: `NBD-${o.id}`,
  invoice_sent_at: '2026-11-10T10:00:00Z', date: '2026-11-10', credited_from_order_id: null, customer_address: 'Exempelgatan 1', order_kind: 'standard', ...o,
});
const debit = (d: Partial<DebitLike> & { id: string }): DebitLike => ({
  team_id: T1, kind: 'debit', status: 'sent', total: 1000, paid_at: null, invoice_number: `N3-${d.id}`, date: '2026-11-01',
  created_at: '2026-11-01T08:00:00Z', credited_from_invoice_id: null, settle_mode: 'avrakning', title: 'Skada', description: 'Repad karm', ...d,
});
const item = (i: Partial<SettlementItemLike>): SettlementItemLike => ({ item_kind: 'invoice', a_order_id: null, debit_invoice_id: null, amount: 0, active: true, settlement_number: 'UTB-001', settlement_status: 'created', ...i });

describe('moms per avdragstyp (typen styr momsen)', () => {
  it('skada eller merkostnad: ingen moms, total = belopp', () => {
    expect(debitTotals('skada_merkostnad', 4000)).toEqual({ vatMode: 'ingen', subtotal: 4000, vatAmount: 0, total: 4000 });
  });
  it('material eller frakt: 25 % moms läggs på', () => {
    expect(debitTotals('material_frakt', 1000)).toEqual({ vatMode: 'vanlig', subtotal: 1000, vatAmount: 250, total: 1250 });
  });
  it('lån eller förskott: ingen moms, total = belopp', () => {
    expect(debitTotals('lan_forskott', 15000)).toEqual({ vatMode: 'ingen', subtotal: 15000, vatAmount: 0, total: 15000 });
  });
  it('byggtjänst: omvänd betalningsskyldighet, total = belopp', () => {
    expect(debitTotals('byggtjanst', 2500)).toEqual({ vatMode: 'omvand', subtotal: 2500, vatAmount: 0, total: 2500 });
  });
  it('har exakt fyra typer med de beslutade momslägena', () => {
    expect(DEBIT_TYPES.map(t => [t.key, debitVatMode(t.key)])).toEqual([
      ['skada_merkostnad', 'ingen'], ['material_frakt', 'vanlig'], ['lan_forskott', 'ingen'], ['byggtjanst', 'omvand'],
    ]);
  });
  it('omvänd-texten står bara vid vat_mode omvand', () => {
    expect(debitVatText('omvand', 'byggtjanst')).toBe(REVERSE_CHARGE_TEXT);
    expect(debitVatText('ingen', 'skada_merkostnad')).toBe('Ingen moms: ersättning för skada eller merkostnad utgör ingen omsättning enligt mervärdesskattelagen.');
    expect(debitVatText('ingen', 'lan_forskott')).toBe('Ingen moms: återbetalning av lån eller förskott.');
    expect(debitVatText('vanlig', 'material_frakt')).toBeNull();
    for (const t of DEBIT_TYPES.filter(x => x.vatMode !== 'omvand')) expect(debitVatText(t.vatMode, t.key) ?? '').not.toContain('Omvänd');
  });
  it('avräkningstexten är den beslutade', () => {
    expect(AVRAKNING_NOTICE).toBe('Regleras genom avräkning mot nästa utbetalning till er. Har ni invändningar, kontakta oss innan dess på n3prenad@smartklimat.org.');
  });
});

describe('momshänvisning på självfakturor', () => {
  it('hänvisar till 16 kap. 13 § ML (2023:200)', () => {
    expect(REVERSE_CHARGE_TEXT).toBe('Omvänd betalningsskyldighet, 16 kap. 13 § ML (2023:200)');
  });
  it('ryms på en rad utan att nå summeringen', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const textEnd = 15 + doc.getTextWidth(REVERSE_CHARGE_TEXT);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const summaryStart = 150 - doc.getTextWidth('Summa exkl. moms');
    expect(textEnd).toBeLessThan(summaryStart - 2);
  });
});

describe('fördelning av avdrag', () => {
  const ded = (id: string, remaining: number, date: string) => ({ id, remaining, date, created_at: `${date}T08:00:00Z`, number: id });

  it('fördelar äldst först', () => {
    const r = allocateSettlement({ invoices: [5000], credits: [], deductions: [ded('ny', 3000, '2026-11-10'), ded('gammal', 3000, '2026-11-01')] });
    expect(r.allocations).toEqual([{ id: 'gammal', take: 3000, remainingAfter: 0 }, { id: 'ny', take: 2000, remainingAfter: 1000 }]);
    expect(r.net).toBe(0);
  });
  it('delkvittar sista avdraget och nettot blir aldrig negativt', () => {
    const r = allocateSettlement({ invoices: [1000], credits: [], deductions: [ded('a', 4000, '2026-11-01')] });
    expect(r.deductionsTotal).toBe(1000);
    expect(r.allocations[0]).toEqual({ id: 'a', take: 1000, remainingAfter: 3000 });
    expect(r.net).toBe(0);
  });
  it('avdrag som inte får något ligger kvar orörda', () => {
    const r = allocateSettlement({ invoices: [1000], credits: [], deductions: [ded('a', 1000, '2026-11-01'), ded('b', 500, '2026-11-02')] });
    expect(r.untouched).toEqual(['b']);
    expect(r.net).toBe(0);
  });
  it('kreditfakturor dras före avdragen', () => {
    const r = allocateSettlement({ invoices: [10000], credits: [-3000], deductions: [ded('a', 8000, '2026-11-01')] });
    expect(r).toMatchObject({ invoicesTotal: 10000, creditsTotal: 3000, deductionsTotal: 7000, net: 0 });
    expect(r.allocations[0].remainingAfter).toBe(1000);
  });
  it('stoppar när kreditfakturorna är större än fakturorna', () => {
    expect(allocateSettlement({ invoices: [1000], credits: [-1500], deductions: [] }).error).toBe('credits_exceed');
  });
  it('kräver minst en faktura', () => {
    expect(allocateSettlement({ invoices: [], credits: [], deductions: [ded('a', 100, '2026-11-01')] }).error).toBe('no_invoice');
  });
  it('räknar i ören utan flyttalsfel', () => {
    const r = allocateSettlement({ invoices: [0.1, 0.2, 76911.005], credits: [], deductions: [ded('a', 0.3, '2026-11-01')] });
    expect(r.invoicesTotal).toBe(76911.31);
    expect(r.net).toBe(76911.01);
    expect(round2(1234.565)).toBe(1234.57);
  });
});

describe('betalningsraden', () => {
  it('har formatet Nummer - Belopp - Bankgiro (bolag)', () => {
    expect(settlementPaymentLine({ settlement_number: 'UTB-001', net_amount: 76911, bankgiro: '833-7859', company_name: 'NBD AB' }))
      .toBe('UTB-001 - 76 911,00 kr - Bankgiro 833-7859 (NBD AB)');
  });
  it('visar ören och vanliga mellanslag', () => {
    expect(formatPaymentAmount(1234567.5)).toBe('1 234 567,50 kr');
    expect(formatPaymentAmount(0)).toBe('0,00 kr');
  });
});

describe('urval grupp A–C', () => {
  it('A: obetalda självfakturor i teamet, inte krediterade, inte i annan aktiv specifikation', () => {
    const orders = [
      order({ id: '1' }),
      order({ id: '2', paid_at: '2026-11-12' }),
      order({ id: '3', team_id: T2 }),
      order({ id: '4', total_amount: 0 }),
      order({ id: '5' }), order({ id: '5k', status: 'credited', credited_from_order_id: '5', total_amount: -10000, date: '2026-11-20' }),
      order({ id: '6' }),
      order({ id: '7', status: 'order' }),
      order({ id: '8', order_kind: 'service' }),
    ];
    const km = [
      debit({ id: 'km1', kind: 'self_billing', settle_mode: 'bankgiro', total: 2000, title: 'Kontrollmätningar' }),
      debit({ id: 'km2', kind: 'self_billing', settle_mode: 'bankgiro', status: 'paid', paid_at: '2026-11-01' }),
    ];
    const ids = eligibleInvoices(T1, orders, km, [item({ a_order_id: '6' })]).map(c => c.id);
    expect(ids.sort()).toEqual(['1', '8', 'km1']);
  });
  it('A: en faktura i en makulerad specifikation (inaktiv rad) går att välja igen', () => {
    expect(eligibleInvoices(T1, [order({ id: '1' })], [], [item({ a_order_id: '1', active: false })]).map(c => c.id)).toEqual(['1']);
  });
  it('B: bara kreditfakturor från 2026-11-16 med betalt original som inte redan kvittats', () => {
    expect(SETTLEMENT_CREDIT_CUTOFF).toBe('2026-11-16');
    const orders = [
      order({ id: 'o1', status: 'credited', paid_at: '2026-11-05' }), order({ id: 'c1', status: 'credited', credited_from_order_id: 'o1', total_amount: -4000, date: '2026-11-16' }),
      order({ id: 'o2', status: 'credited', paid_at: '2026-10-01' }), order({ id: 'c2', status: 'credited', credited_from_order_id: 'o2', total_amount: -4000, date: '2026-11-15' }),
      order({ id: 'o3', status: 'credited', paid_at: null }), order({ id: 'c3', status: 'credited', credited_from_order_id: 'o3', total_amount: -4000, date: '2026-11-20' }),
      order({ id: 'o4', status: 'credited', paid_at: '2026-11-05' }), order({ id: 'c4', status: 'credited', credited_from_order_id: 'o4', total_amount: -4000, date: '2026-11-20' }),
      order({ id: 'o5', status: 'credited', paid_at: '2026-11-05', team_id: T2 }), order({ id: 'c5', team_id: T2, status: 'credited', credited_from_order_id: 'o5', total_amount: -4000, date: '2026-11-20' }),
    ];
    const km = [
      debit({ id: 'k1', kind: 'self_billing', settle_mode: 'bankgiro', status: 'credited', paid_at: '2026-11-10' }),
      debit({ id: 'kc1', kind: 'self_billing', settle_mode: 'bankgiro', credited_from_invoice_id: 'k1', total: -1000, date: '2026-11-17' }),
    ];
    const res = eligibleCredits(T1, orders, km, [item({ item_kind: 'credit_note', a_order_id: 'c4', amount: -4000 })]);
    expect(res.map(c => c.id).sort()).toEqual(['c1', 'kc1']);
    expect(res.find(c => c.id === 'c1')?.amount).toBe(-4000);
  });
  it('C: öppna avdrag med avräkning, äldst först, kvarvarande efter tidigare delkvittning', () => {
    const debits = [
      debit({ id: 'b', date: '2026-11-05', total: 3000 }),
      debit({ id: 'a', date: '2026-11-02', total: 5000 }),
      debit({ id: 'bg', settle_mode: 'bankgiro' }),
      debit({ id: 'cr', status: 'credited' }),
      debit({ id: 'pd', status: 'paid', paid_at: '2026-11-03' }),
      debit({ id: 'x', team_id: T2 }),
      debit({ id: 'full', total: 800 }),
      debit({ id: 'has-credit' }), debit({ id: 'hc-note', credited_from_invoice_id: 'has-credit', total: -1000 }),
    ];
    const items = [
      item({ item_kind: 'deduction', debit_invoice_id: 'a', amount: -2000 }),
      item({ item_kind: 'deduction', debit_invoice_id: 'full', amount: -800 }),
      item({ item_kind: 'deduction', debit_invoice_id: 'b', amount: -3000, active: false }),
    ];
    const res = eligibleDeductions(T1, debits, items);
    expect(res.map(d => [d.id, d.remaining])).toEqual([['a', 3000], ['b', 3000]]);
  });
  it('översikten kvittar aldrig mellan team', () => {
    const o = teamPayoutOverview(T1, [order({ id: '1', total_amount: 2000 })], [debit({ id: 'x', team_id: T2, total: 1500 })], []);
    expect(o.deductions).toHaveLength(0);
    expect(o.allocation.net).toBe(2000);
  });
});

describe('statusar', () => {
  it('specifikation', () => {
    expect(settlementStatusText({ status: 'created' })).toBe('Skapad');
    expect(settlementStatusText({ status: 'sent' })).toBe('Skickad');
    expect(settlementStatusText({ status: 'paid', paid_at: '2026-11-20' })).toBe('Betald 2026-11-20');
    expect(settlementStatusText({ status: 'cancelled' })).toBe('Makulerad');
  });
  it('avdrag', () => {
    const d = debit({ id: 'a', total: 3000 });
    expect(deductionStatusText(d, [])).toBe('Regleras vid nästa utbetalning');
    expect(deductionStatusText(d, [item({ item_kind: 'deduction', debit_invoice_id: 'a', amount: -1000 })]).replace(/\s/g, ' ')).toBe('Delvis kvittad, kvar 2 000 kr');
    expect(deductionStatusText({ ...d, status: 'paid', paid_at: '2026-11-20' }, [item({ item_kind: 'deduction', debit_invoice_id: 'a', amount: -3000, settlement_number: 'UTB-004' })])).toBe('Kvittad mot UTB-004');
    expect(deductionStatusText({ ...d, status: 'paid', paid_at: '2026-11-20' }, [])).toBe('Betald');
    expect(deductionStatusText({ ...d, status: 'credited' }, [])).toBe('Krediterad');
  });
});

describe('utbetalningsspecifikationens PDF och mejl', () => {
  const s = {
    settlement_number: 'UTB-001', settlement_date: '2026-11-16', company_name: 'NBD AB', org_nr: '556000-0000', address: 'Exempelvägen 1, 123 45 Stockholm',
    bankgiro: '833-7859', invoices_total: 80000, credits_total: 1089, deductions_total: 2000, net_amount: 76911, status: 'created',
  };
  const items = [
    { item_kind: 'invoice', document_number: 'NBD-010', label: 'Exempelgatan 1', document_date: '2026-11-10', amount: 80000, document_total: 80000, remaining_after: null, sort_order: 1 },
    { item_kind: 'credit_note', document_number: 'NBD-011', label: 'Kreditering av NBD-009', document_date: '2026-11-16', amount: -1089, document_total: -1089, remaining_after: null, sort_order: 2 },
    { item_kind: 'deduction', document_number: 'N3-012', label: 'Repad karm', document_date: '2026-11-02', amount: -2000, document_total: 5000, remaining_after: 3000, sort_order: 3 },
  ];
  it('logiskt filnamn', () => {
    expect(settlementPdfName(s)).toBe('Utbetalning-UTB-001-NBD-AB-2026-11-16.pdf');
  });
  it('PDF:en är ingen faktura och har ingen momsrad', () => {
    const out = buildMontorSettlementPdf(s, items).output();
    expect(out).toContain('UTBETALNINGSSPECIFIKATION');
    expect(out).toContain('UTB-001');
    expect(out).toContain('Att utbetala');
    expect(out).not.toMatch(/lvfakturering/);
    expect(out).not.toMatch(/Moms \d|Moms:|ATT BETALA|KREDITFAKTURA/);
    expect(settlementPayoutBoxText(s)).toBe('Utbetalas till bankgiro 833-7859 (NBD AB) med referens UTB-001.');
  });
  it('mejlet: ämne, mottagare och betalningsraden överst', () => {
    expect(settlementSubject(s)).toBe('Utbetalningsspecifikation UTB-001 från SmartKlimat N3prenad');
    expect(settlementRecipients({ invoice_email: 'faktura@nbd.example', email: 'info@nbd.example' }))
      .toEqual({ to: ['faktura@nbd.example'], cc: ['n3prenad@smartklimat.org', 'daniel@malke.se'] });
    expect(settlementRecipients({ email: 'info@nbd.example' })?.to).toEqual(['info@nbd.example']);
    expect(settlementRecipients({})).toBeNull();
    const html = buildSettlementEmailHtml(s, true);
    const line = 'UTB-001 - 76 911,00 kr - Bankgiro 833-7859 (NBD AB)';
    expect(html).toContain(line);
    expect(html.indexOf(line)).toBeLessThan(html.indexOf('<h1'));
  });
});
