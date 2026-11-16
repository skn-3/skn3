// PDF för utbetalningsspecifikationen (UTB-serien). Ingen faktura: ingen fakturarubrik,
// ingen momsrad och ingen självfaktureringstext. Byggs ALLTID från de sparade värdena
// i montor_settlements/montor_settlement_items, aldrig från klientens förhandsvisning.
// Samma visuella system som montörsdebetfakturan (src/lib/montorDebitPdf.ts).
import jsPDF from 'jspdf';
import { SELF_BILLING_BUYER } from './selfBillingLayout';
import { formatKr } from './montorSettlement';
import { settlementPdfName, pdfTitleFromName } from './pdfNames';

export interface SettlementPdfSettlement {
  settlement_number: string | null;
  settlement_date: string;
  company_name: string | null;
  org_nr: string | null;
  address: string | null;
  bankgiro: string | null;
  invoices_total: number | string;
  credits_total: number | string;
  deductions_total: number | string;
  net_amount: number | string;
  status?: string | null;
}
export interface SettlementPdfItem {
  item_kind: string;
  document_number: string | null;
  label: string | null;
  document_date: string | null;
  amount: number | string;
  document_total: number | string;
  remaining_after: number | string | null;
  sort_order?: number | null;
  active?: boolean | null;
}

type RGB = [number, number, number];
const DARK: RGB = [51, 51, 51];
const GREY: RGB = [120, 120, 120];
const LIGHT: RGB = [245, 245, 245];
const HEADER_BG: RGB = [55, 65, 81];
const WHITE: RGB = [255, 255, 255];
const PAGE_W = 210;
const MARGIN = 15;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_BOTTOM = 268;

const kr = (n: number | string | null | undefined) => formatKr(n);
const neg = (n: number | string | null | undefined) => {
  const v = Math.abs(Number(n) || 0);
  return v === 0 ? kr(0) : `-${kr(v)}`;
};

export const SETTLEMENT_PDF_TITLE = 'UTBETALNINGSSPECIFIKATION';
export const SETTLEMENT_OFFSET_TEXT =
  'Fordringarna ovan har tidigare skickats till er som debetfakturor. Vi kvittar dem mot era fakturor enligt denna specifikation. Frågor: n3prenad@smartklimat.org.';

export function settlementPayoutBoxText(s: Pick<SettlementPdfSettlement, 'bankgiro' | 'company_name' | 'settlement_number'>): string {
  return `Utbetalas till bankgiro ${s.bankgiro || '—'} (${s.company_name || '—'}) med referens ${s.settlement_number || '—'}.`;
}

function splitAddress(address?: string | null): string[] {
  return String(address || '').split(/\n|,\s*/).map(s => s.trim()).filter(Boolean);
}

export function buildMontorSettlementPdf(s: SettlementPdfSettlement, allItems: SettlementPdfItem[], logoDataUrl?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: pdfTitleFromName(settlementPdfName(s)) });
  const items = [...allItems].filter(i => i.active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const invoices = items.filter(i => i.item_kind === 'invoice' || i.item_kind === 'self_billing_invoice');
  const credits = items.filter(i => i.item_kind === 'credit_note');
  const deductions = items.filter(i => i.item_kind === 'deduction');
  const buyer = SELF_BILLING_BUYER;

  const setText = (size: number, style: 'normal' | 'bold', color: RGB) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
  };

  // ─── Huvud (som montörsdebetfakturan) ───
  if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', MARGIN, 8, 18, 18); } catch { /* utan logga */ } }
  setText(16, 'bold', DARK); doc.text('SmartKlimat', 36, 16);
  setText(12, 'bold', DARK); doc.text('N3prenad', 36, 22);
  setText(8, 'normal', GREY);
  doc.text(`Org.nr ${buyer.orgNr}`, 36, 27);
  doc.text('Morsstigen 3 141 71', 36, 30);
  doc.text('Segeltorp', 36, 33);

  setText(10, 'normal', GREY); doc.text(s.settlement_date, RIGHT, 14, { align: 'right' });
  setText(17, 'bold', DARK); doc.text(SETTLEMENT_PDF_TITLE, RIGHT, 28, { align: 'right' });
  setText(14, 'bold', DARK); doc.text(s.settlement_number || '—', RIGHT, 36, { align: 'right' });
  setText(9, 'normal', GREY); doc.text(`Datum ${s.settlement_date}`, RIGHT, 42, { align: 'right' });

  // ─── Avsändare och mottagare ───
  let y = 54;
  const colR = 110;
  setText(8, 'bold', GREY); doc.text('AVSÄNDARE', MARGIN, y); doc.text('MOTTAGARE', colR, y);
  y += 5;
  setText(11, 'bold', DARK);
  doc.text(buyer.name, MARGIN, y);
  doc.text(doc.splitTextToSize(s.company_name || '—', RIGHT - colR)[0], colR, y);
  y += 5;
  setText(9, 'normal', DARK);
  const left = [`Org.nr ${buyer.orgNr}`, ...buyer.addressLines, `Momsreg.nr ${buyer.vatNr}`];
  const right = [s.org_nr ? `Org.nr ${s.org_nr}` : '', ...splitAddress(s.address)].filter(Boolean);
  const rows = Math.max(left.length, right.length);
  for (let i = 0; i < rows; i++) {
    if (left[i]) doc.text(left[i], MARGIN, y);
    if (right[i]) doc.text(doc.splitTextToSize(right[i], RIGHT - colR)[0], colR, y);
    y += 4.4;
  }
  y += 6;

  const ensure = (h: number) => { if (y + h > CONTENT_BOTTOM) { doc.addPage(); y = 20; } };

  // ─── Tabeller ───
  type Col = { title: string; x: number; align?: 'right'; width?: number; wrap?: boolean };
  const table = (heading: string, cols: Col[], body: string[][]) => {
    ensure(24);
    setText(10, 'bold', DARK); doc.text(heading, MARGIN, y); y += 3;
    const head = () => {
      doc.setFillColor(...HEADER_BG); doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7.5, 'F');
      setText(7.5, 'bold', WHITE);
      cols.forEach(c => doc.text(c.title, c.x, y + 5, c.align ? { align: c.align } : undefined));
      y += 7.5;
    };
    head();
    body.forEach((row, i) => {
      setText(8, 'normal', DARK);
      // Kolumner med wrap får upp till tre rader (t.ex. "Avser ALEX-097 (adress) · beskrivning").
      const cells = cols.map((c, k) => {
        if (!c.width) return [row[k] || ''];
        const all = doc.splitTextToSize(row[k] || '', c.width) as string[];
        return c.wrap ? all.slice(0, 3) : [all[0] || ''];
      });
      const rowH = 7 + (Math.max(...cells.map(l => l.length)) - 1) * 3.6;
      if (y + rowH > CONTENT_BOTTOM) { doc.addPage(); y = 20; head(); setText(8, 'normal', DARK); }
      if (i % 2 === 1) { doc.setFillColor(...LIGHT); doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F'); }
      cols.forEach((c, k) => {
        cells[k].forEach((ln, n) => doc.text(ln, c.x, y + 4.8 + n * 3.6, c.align ? { align: c.align } : undefined));
      });
      y += rowH;
    });
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(MARGIN, y + 1, RIGHT, y + 1);
    y += 8;
  };

  table('Era fakturor som betalas', [
    { title: 'FAKTURANR', x: 17, width: 30 },
    { title: 'AVSER', x: 50, width: 88 },
    { title: 'FAKTURADATUM', x: 142 },
    { title: 'BELOPP', x: 193, align: 'right' },
  ], invoices.map(i => [i.document_number || '—', i.label || '', i.document_date || '', kr(i.amount)]));

  if (credits.length) {
    table('Kreditfakturor som kvittas', [
      { title: 'KREDITNR', x: 17, width: 30 },
      { title: 'AVSER', x: 50, width: 88 },
      { title: 'DATUM', x: 142 },
      { title: 'BELOPP', x: 193, align: 'right' },
    ], credits.map(i => [i.document_number || '—', i.label || '', i.document_date || '', neg(i.amount)]));
  }

  if (deductions.length) {
    table('Våra fordringar som kvittas', [
      { title: 'NR', x: 17, width: 20 },
      { title: 'AVSER / BESKRIVNING', x: 38, width: 80, wrap: true },
      { title: 'FORDRAN', x: 135, align: 'right' },
      { title: 'KVITTAT NU', x: 164, align: 'right' },
      { title: 'KVAR ATT KVITTA', x: 193, align: 'right' },
    ], deductions.map(i => [i.document_number || '—', i.label || '', kr(i.document_total), kr(Math.abs(Number(i.amount) || 0)), kr(i.remaining_after ?? 0)]));
  }

  // ─── Summering ───
  ensure(34);
  let sy = y + 2;
  setText(10, 'normal', DARK);
  const sumRow = (label: string, value: string) => { doc.text(label, 150, sy, { align: 'right' }); doc.text(value, RIGHT, sy, { align: 'right' }); sy += 5.5; };
  sumRow('Summa fakturor', kr(s.invoices_total));
  sumRow('Avgår kreditfakturor', neg(s.credits_total));
  sumRow('Avgår kvittade fordringar', neg(s.deductions_total));
  doc.setDrawColor(200, 200, 200); doc.line(110, sy - 2.5, RIGHT, sy - 2.5);
  sy += 2;
  setText(13, 'bold', DARK);
  doc.text('Att utbetala', 150, sy, { align: 'right' });
  doc.text(kr(s.net_amount), RIGHT, sy, { align: 'right' });
  y = sy + 8;

  // ─── Utbetalningsruta ───
  ensure(22);
  doc.setDrawColor(180, 180, 180); doc.setFillColor(...LIGHT);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 16, 'FD');
  setText(9, 'bold', DARK); doc.text('UTBETALNING', MARGIN + 4, y + 6);
  setText(9, 'normal', DARK);
  doc.text(doc.splitTextToSize(settlementPayoutBoxText(s), PAGE_W - MARGIN * 2 - 8)[0], MARGIN + 4, y + 11.5);
  y += 22;

  ensure(14);
  setText(8.5, 'normal', DARK);
  const note = deductions.length ? SETTLEMENT_OFFSET_TEXT : 'Frågor om utbetalningen: n3prenad@smartklimat.org.';
  doc.splitTextToSize(note, PAGE_W - MARGIN * 2).forEach((ln: string) => { doc.text(ln, MARGIN, y); y += 4.2; });

  // ─── Sidfot på varje sida ───
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    setText(8, 'normal', GREY);
    doc.text(`${buyer.name} | ${buyer.orgNr} | Momsreg.nr ${buyer.vatNr}  Godkänd för F-skatt`, MARGIN, 276);
    if (pages > 1) doc.text(`Sida ${p} av ${pages}`, RIGHT, 276, { align: 'right' });
    doc.setFillColor(...HEADER_BG); doc.rect(0, 282, PAGE_W, 12, 'F');
    setText(7, 'normal', WHITE);
    doc.text('\u260E 070-719 72 35    \u2709 n3prenad@smartklimat.org    \u2302 Morsstigen 3 141 71 Segeltorp', PAGE_W / 2, 289, { align: 'center' });
  }
  doc.setPage(pages);
  return doc;
}
