import jsPDF from 'jspdf';

export interface MontorDebitPdfLine {
  description: string;
  qty: number;
  unit?: string;
  unit_price: number;
  amount: number;
}

export interface MontorDebitPdfTeam {
  company_name?: string | null;
  org_nr?: string | null;
  address?: string | null;
  name?: string | null;
}

export interface BuildMontorDebitPdfArgs {
  invoiceNumber: string;
  date: string;
  dueDate?: string | null;
  team: MontorDebitPdfTeam;
  title?: string | null;
  description?: string | null;
  lines: MontorDebitPdfLine[];
  vatMode: 'omvand' | 'vanlig';
  subtotal: number;
  vatAmount: number;
  total: number;
  logoDataUrl?: string | null;
}

const DARK: [number, number, number] = [51, 51, 51];
const LIGHT: [number, number, number] = [245, 245, 245];
const HEADER_BG: [number, number, number] = [55, 65, 81];
const WHITE: [number, number, number] = [255, 255, 255];

function fmtNum(n: number) {
  return Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 2 });
}
function fmtKr(n: number) {
  return Math.round(n || 0).toLocaleString('sv-SE') + ' kr';
}

export function buildMontorDebitPdf(args: BuildMontorDebitPdfArgs): jsPDF {
  const { invoiceNumber, date, dueDate, team, title, description, lines, vatMode, subtotal, vatAmount, total, logoDataUrl } = args;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const margin = 15;
  const pageW = 210;

  // HEADER
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', margin, 8, 18, 18); } catch { /* ignore */ }
  }
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SmartKlimat', 36, 16);
  doc.setFontSize(12);
  doc.text('N3prenad', 36, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Org.nr 559026-6630', 36, 27);
  doc.text('Morsstigen 3 141 71', 36, 30);
  doc.text('Segeltorp', 36, 33);

  // Right header
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(date, pageW - margin, 14, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...DARK);
  doc.text('FAKTURA', pageW - margin, 30, { align: 'right' });
  doc.setFontSize(14);
  doc.text(`#${invoiceNumber}`, pageW - margin, 38, { align: 'right' });
  if (dueDate) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Förfallodatum: ${dueDate}`, pageW - margin, 44, { align: 'right' });
  }

  // KUND-block
  let y = 54;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('KUND', margin, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text(team.company_name || team.name || '—', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (team.org_nr) { doc.text(`Org.nr ${team.org_nr}`, margin, y); y += 4; }
  if (team.address) {
    const addrLines = doc.splitTextToSize(String(team.address), 90);
    addrLines.forEach((ln: string) => { doc.text(ln, margin, y); y += 4; });
  }

  if (title) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 5;
  }

  // TABLE
  y = Math.max(y + 4, 90);
  doc.setFillColor(...HEADER_BG);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BENÄMNING', 17, y + 5.4);
  doc.text('Á-PRIS', 130, y + 5.4, { align: 'right' });
  doc.text('ANTAL', 158, y + 5.4, { align: 'right' });
  doc.text('SUMMA', 193, y + 5.4, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  lines.forEach((l, i) => {
    if (y > 235) { doc.addPage(); y = 20; }
    if (i % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(margin, y, pageW - margin * 2, 7, 'F');
    }
    doc.setTextColor(...DARK);
    const name = doc.splitTextToSize(String(l.description || ''), 105)[0] || '';
    doc.text(name, 17, y + 4.8);
    doc.text(fmtNum(l.unit_price), 130, y + 4.8, { align: 'right' });
    const qtyStr = `${fmtNum(l.qty)}${l.unit ? ' ' + l.unit : ''}`;
    doc.text(qtyStr, 158, y + 4.8, { align: 'right' });
    doc.text(fmtKr(l.amount), 193, y + 4.8, { align: 'right' });
    y += 7;
  });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, y + 1, pageW - margin, y + 1);
  y += 5;

  if (description && description.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.text('Beskrivning:', margin, y + 3);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(description, pageW - margin * 2);
    wrapped.forEach((line: string) => {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text(line, margin, y + 3);
      y += 4;
    });
    y += 2;
  }

  // SUMMERING right
  let sy = Math.max(y + 8, 220);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text('Summa ex moms:', 150, sy, { align: 'right' });
  doc.text(fmtKr(subtotal), pageW - margin, sy, { align: 'right' });
  sy += 5;

  if (vatMode === 'vanlig') {
    doc.text('Moms 25%:', 150, sy, { align: 'right' });
    doc.text(fmtKr(vatAmount), pageW - margin, sy, { align: 'right' });
    sy += 5;
  } else {
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    const note = doc.splitTextToSize('Omvänd betalningsskyldighet för moms gäller enl 1 kap 2§ punkt 4b ML', 90);
    note.forEach((ln: string) => { doc.text(ln, pageW - margin, sy, { align: 'right' }); sy += 3.5; });
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text('Moms:', 150, sy, { align: 'right' });
    doc.text('0 kr', pageW - margin, sy, { align: 'right' });
    sy += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Att betala:', 150, sy + 2, { align: 'right' });
  doc.text(fmtKr(total), pageW - margin, sy + 2, { align: 'right' });

  // FOOTER left
  const fy = 260;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('BANKGIRO: 5032-4573', margin, fy);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('SmartKlimat N3prenad AB | 559026-6630', margin, fy + 5);
  doc.text('Betalningsvillkor: 10 dagar netto.', margin, fy + 10);
  doc.text('Momsreg. nr SE559026663001  Godkänd för F-skatt', margin, fy + 15);

  // Bottom bar
  const barY = 282;
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, barY, pageW, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.text(
    '\u260E 070-719 72 35    \u2709 n3prenad@smartklimat.org    \u2302 Morsstigen 3 141 71 Segeltorp',
    pageW / 2,
    barY + 7,
    { align: 'center' }
  );

  return doc;
}
