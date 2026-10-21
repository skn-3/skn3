// Intern lönespecifikation för konsultutbetalningar — ska aldrig skickas
// till revisor eller kund. Här finns TB-underlag, provisionstrappa, avdrag
// och lånerörelser som inte får synas på fakturan.
import jsPDF from 'jspdf';
import { DOC_TYPE_LABELS, monthLabel, tierFor, type CommissionTier, DEFAULT_TIERS } from './consultantPay';

const PAGE_W = 210;
const MARGIN = 15;
const RIGHT = PAGE_W - MARGIN;
const BOTTOM = 280;

type RGB = [number, number, number];
const DARK: RGB = [51, 51, 51];
const GREY: RGB = [120, 120, 120];
const LIGHT: RGB = [245, 245, 245];
const HEADER_BG: RGB = [55, 65, 81];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [34, 197, 94];
const AMBER: RGB = [180, 120, 20];

function fmtNum(n: number): string {
  return Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 2 }).replace(/−/g, '-');
}
function fmtKr(n: number): string {
  return fmtNum(n) + ' kr';
}
function fmtDate(s?: string | null): string {
  return s ? String(s).slice(0, 10) : '—';
}

export interface ConsultantSpecLine {
  kind: string;
  label?: string | null;
  amount?: number | null;
  doc_type?: string | null;
  doc_date?: string | null;
  reg_nr?: string | null;
  doc_number?: string | null;
  included?: boolean | null;
  duplicate_of?: string | null;
}

export interface ConsultantSpecInput {
  consultant: {
    name?: string | null;
    company_name?: string | null;
    payer_name?: string | null;
    commission_tiers?: CommissionTier[] | null;
  };
  payout: {
    kind?: string | null;
    payout_month?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    invoice_number?: number | string | null;
    invoice_date?: string | null;
    provision_payout_date?: string | null;
    tb_rows?: Array<{ order_number?: string | null; customer_name?: string | null; signing_date?: string | null; amount?: number | null }> | null;
    tb_corrections?: Array<{ order_number?: string | null; customer_name?: string | null; text?: string | null; amount?: number | null }> | null;
    tb_sum_rows?: number | null;
    tb_sum_corrections?: number | null;
    tb_amount?: number | null;
    tier_pct?: number | null;
    commission_gross?: number | null;
    deductions_total?: number | null;
    loan_change?: number | null;
    net_amount?: number | null;
    vat_rate?: number | null;
    vat_amount?: number | null;
    total_incl_vat?: number | null;
  };
  lines: ConsultantSpecLine[];
  loanBalanceBefore: number;
  loanBalanceAfter: number;
  generatedBy: string;
}

export function buildConsultantSpecPdf(input: ConsultantSpecInput): jsPDF {
  const { consultant: c, payout: p, lines } = input;
  const doc = new jsPDF();
  let y = 0;

  const setText = (size: number, style: 'normal' | 'bold', color: RGB) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) { doc.addPage(); y = 20; }
  };
  const heading = (text: string) => {
    ensure(16);
    y += 7;
    setText(11, 'bold', DARK);
    doc.text(text, MARGIN, y);
    y += 6;
  };
  const kv = (label: string, value: string) => {
    ensure(5);
    setText(8, 'normal', GREY);
    doc.text(label, MARGIN, y);
    setText(9, 'normal', DARK);
    doc.text(value, MARGIN + 70, y);
    y += 4.6;
  };
  const tableHead = (cols: Array<[string, number, boolean]>) => {
    ensure(10);
    doc.setFillColor(...HEADER_BG);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, 'F');
    setText(7.5, 'bold', WHITE);
    for (const [label, x, rightAlign] of cols) doc.text(label, x, y + 4.8, rightAlign ? { align: 'right' } : undefined);
    y += 7;
  };
  type Cell = [string, number, boolean, number?];
  const subheading = (text: string, color: RGB = DARK) => {
    ensure(12);
    setText(8, 'bold', color);
    doc.text(text, MARGIN, y + 3);
    y += 5;
  };
  const typeLabel = (l: ConsultantSpecLine) =>
    l.kind === 'standard' ? 'Standard' : l.kind === 'manual' ? 'Manuell' : (DOC_TYPE_LABELS[l.doc_type || 'annat'] ?? 'Annat');
  const tableRow = (cells: Cell[], i: number, bold = false, color: RGB = DARK) => {
    ensure(6);
    if (i % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 5.5, 'F');
    }
    setText(8, bold ? 'bold' : 'normal', color);
    for (const [text, x, rightAlign, maxW] of cells) doc.text(text ? (doc.splitTextToSize(text, maxW ?? 90)[0] ?? '') : '', x, y + 4, rightAlign ? { align: 'right' } : undefined);
    y += 5.5;
  };

  // ── Rubrik ──
  y = 18;
  setText(16, 'bold', DARK);
  doc.text('LÖNESPECIFIKATION – intern', MARGIN, y);
  y += 8;
  kv('Konsult', `${c.company_name || ''} (${c.name || ''})`.trim());
  kv('Betalare', c.payer_name || '—');
  kv('Utbetalningsmånad', p.payout_month ? monthLabel(p.payout_month) : '—');
  kv('Period', p.period_start && p.period_end ? `${p.period_start} – ${p.period_end}` : '—');
  kv('Faktura', p.invoice_number ? `nr ${p.invoice_number} · ${fmtDate(p.invoice_date)}` : 'Ej fakturerad');

  // ── Underlag från Mockfjärds ──
  heading('Underlag från Mockfjärds');
  kv('Utbetalningsdatum', fmtDate(p.provision_payout_date));
  const tbRows = Array.isArray(p.tb_rows) ? p.tb_rows : [];
  if (tbRows.length) {
    const cols: Array<[string, number, boolean]> = [['ORDERNR', MARGIN + 2, false], ['KUND', 52, false], ['SIGNERAD', 120, false], ['BELOPP', RIGHT - 2, true]];
    tableHead(cols);
    tbRows.forEach((r, i) => tableRow([
      [String(r.order_number ?? ''), MARGIN + 2, false],
      [String(r.customer_name ?? ''), 52, false, 64],
      [fmtDate(r.signing_date), 120, false],
      [fmtNum(Number(r.amount) || 0), RIGHT - 2, true],
    ], i));
  } else {
    setText(8, 'normal', GREY);
    doc.text('Inga TB-rader.', MARGIN, y); y += 5;
  }
  const corrections = Array.isArray(p.tb_corrections) ? p.tb_corrections : [];
  if (corrections.length) {
    y += 4;
    subheading('Korrigeringar');
    corrections.forEach((r, i) => tableRow([
      [String(r.order_number ?? ''), MARGIN + 2, false],
      [String(r.text ?? r.customer_name ?? ''), 52, false, 64],
      ['', 120, false],
      [fmtNum(Number(r.amount) || 0), RIGHT - 2, true],
    ], i));
  }
  y += 4;
  tableRow([['Summa Utb.ÅF', MARGIN + 2, false], ['', 52, false], ['', 120, false], [fmtKr(Number(p.tb_sum_rows) || 0), RIGHT - 2, true]], 0, true);
  tableRow([['Summa Korrigering', MARGIN + 2, false], ['', 52, false], ['', 120, false], [fmtKr(Number(p.tb_sum_corrections) || 0), RIGHT - 2, true]], 1, true);
  tableRow([['Summa Total (TB)', MARGIN + 2, false], ['', 52, false], ['', 120, false], [fmtKr(Number(p.tb_amount) || 0), RIGHT - 2, true]], 0, true);

  // ── Provision ──
  heading('Provision');
  const tiers = (Array.isArray(c.commission_tiers) && c.commission_tiers.length ? c.commission_tiers : DEFAULT_TIERS) as CommissionTier[];
  const tb = Number(p.tb_amount) || 0;
  const activeTier = tierFor(tb, tiers);
  tableHead([['TB UPP TILL', MARGIN + 2, false], ['PROCENT', 120, true], ['', RIGHT - 2, true]]);
  tiers.forEach((t, i) => {
    const active = t.upTo === activeTier.upTo && t.pct === activeTier.pct;
    tableRow([
      [t.upTo === null ? 'Resten' : fmtKr(t.upTo), MARGIN + 2, false],
      [`${t.pct} %`, 120, true],
      [active ? 'aktivt steg' : '', RIGHT - 2, true],
    ], i, active, active ? GREEN : DARK);
  });
  y += 4;
  kv('Beräkning', `${fmtKr(tb)} × ${Number(p.tier_pct ?? activeTier.pct)} % = ${fmtKr(Number(p.commission_gross) || 0)}`);

  // ── Avdrag ──
  heading('Avdrag');
  const included = lines.filter(l => l.included !== false);
  const excluded = lines.filter(l => l.included === false);
  if (included.length) {
    tableHead([['TYP', MARGIN + 2, false], ['BESKRIVNING', 40, false], ['DATUM', 108, false], ['REGNR', 130, false], ['NUMMER', 152, false], ['BELOPP', RIGHT - 2, true]]);
    included.forEach((l, i) => tableRow([
      [typeLabel(l), MARGIN + 2, false, 22],
      [String(l.label ?? ''), 40, false, 64],
      [fmtDate(l.doc_date), 108, false],
      [l.reg_nr || '', 130, false],
      [l.doc_number || '', 152, false, 28],
      [fmtNum(Number(l.amount) || 0), RIGHT - 2, true],
    ], i));
    tableRow([['Summa avdrag', MARGIN + 2, false], ['', 40, false], ['', 108, false], ['', 130, false], ['', 152, false], [fmtKr(Number(p.deductions_total) || 0), RIGHT - 2, true]], 0, true);
  } else {
    setText(8, 'normal', GREY);
    doc.text('Inga avdrag.', MARGIN, y); y += 5;
  }
  if (excluded.length) {
    y += 4;
    subheading('Ej draget', AMBER);
    excluded.forEach((l, i) => tableRow([
      [String(l.label ?? ''), MARGIN + 2, false, 130],
      [l.duplicate_of ? 'Dubblett' : 'Avbockad', 152, false, 28],
      [fmtNum(Number(l.amount) || 0), RIGHT - 2, true],
    ], i, false, AMBER));
  }

  // ── Lån ──
  heading('Lån');
  const loanChange = Number(p.loan_change) || 0;
  if (loanChange < 0) kv('Amortering', fmtKr(Math.abs(loanChange)));
  else if (loanChange > 0) kv('Förskott', fmtKr(loanChange));
  else kv('Lånerörelse', 'Ingen');
  kv('Saldo före', fmtKr(input.loanBalanceBefore));
  kv('Saldo efter', fmtKr(input.loanBalanceAfter));

  // ── Summering ──
  heading('Summering');
  kv('Provision', fmtKr(Number(p.commission_gross) || 0));
  kv('Avdrag totalt', fmtKr(Number(p.deductions_total) || 0));
  kv('Amortering', fmtKr(loanChange < 0 ? Math.abs(loanChange) : 0));
  kv('Netto ex moms', fmtKr(Number(p.net_amount) || 0));
  kv(`Moms ${Number(p.vat_rate ?? 25)} %`, fmtKr(Number(p.vat_amount) || 0));
  ensure(6);
  setText(11, 'bold', DARK);
  doc.text('Totalt att betala', MARGIN, y);
  doc.text(fmtKr(Number(p.total_incl_vat) || 0), RIGHT, y, { align: 'right' });

  // ── Sidfot på varje sida ──
  const generatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const pages = doc.getNumberOfPages();
  for (let pg = 1; pg <= pages; pg++) {
    doc.setPage(pg);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 286, RIGHT, 286);
    setText(7, 'normal', GREY);
    doc.text(`Intern specifikation – ska inte skickas till revisor eller kund. Genererad ${generatedAt} av ${input.generatedBy}`, MARGIN, 291);
    if (pages > 1) doc.text(`Sida ${pg} av ${pages}`, RIGHT, 291, { align: 'right' });
  }
  doc.setPage(pages);
  return doc;
}
