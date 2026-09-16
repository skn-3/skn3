import jsPDF from 'jspdf';

export interface SelfBillingPdfLine {
  description: string;
  qty: number;
  unit?: string;
  unit_price: number;
  amount: number;
}

export interface SelfBillingPdfTeam {
  name?: string | null;
  company_name?: string | null;
  org_nr?: string | null;
  address?: string | null;
  bankgiro?: string | null;
}

export interface BuildSelfBillingPdfArgs {
  invoiceNumber: string;
  date: string;
  dueDate?: string | null;
  team: SelfBillingPdfTeam;
  title?: string | null;
  description?: string | null;
  lines: SelfBillingPdfLine[];
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
export function vatFromOrgNr(orgNr?: string | null): string {
  const digits = String(orgNr || '').replace(/\D/g, '');
  return digits ? `SE${digits}01` : '';
}

export function buildSelfBillingPdf(args: BuildSelfBillingPdfArgs): jsPDF {
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const subTitle = doc.splitTextToSize('Självfakturering — utställd av köparen för säljarens räkning', 95);
  let hy = 35;
  subTitle.forEach((ln: string) => { doc.text(ln, pageW - margin, hy, { align: 'right' }); hy += 4; });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(`#${invoiceNumber}`, pageW - margin, hy + 2, { align: 'right' });
  hy += 2;
  if (dueDate) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Betalas senast: ${dueDate}`, pageW - margin, hy + 6, { align: 'right' });
  }

  // SÄLJARE (vänster) + KÖPARE (höger)
  let y = 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('SÄLJARE (utförare)', margin, y);
  doc.text('KÖPARE (utställare av fakturan)', 115, y);
  y += 5;

  const leftLines: string[] = [];
  leftLines.push(team.company_name || team.name || '—');
  if (team.address) leftLines.push(...String(team.address).split(/\n|,\s*/).filter(Boolean));
  if (team.org_nr) leftLines.push(`Org.nr ${team.org_nr}`);
  const vat = vatFromOrgNr(team.org_nr);
  if (vat) leftLines.push(`VAT ${vat}`);
  leftLines.push('Godkänd för F-skatt');

  const rightLines = [
    'SmartKlimat N3prenad AB',
    'Morsstigen 3',
    '141 71 Segeltorp',
    'Org.nr 559026-6630',
    'VAT SE559026663001',
  ];

  const rows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < rows; i++) {
    const bold = i === 0;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9);
    doc.setTextColor(...DARK);
    if (leftLines[i]) doc.text(doc.splitTextToSize(leftLines[i], 90)[0], margin, y);
    if (rightLines[i]) doc.text(doc.splitTextToSize(rightLines[i], 80)[0], 115, y);
    y += bold ? 6 : 4.4;
  }

  if (title) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(title, margin, y);
    y += 5;
  }

  // TABELL
  y = Math.max(y + 4, 105);
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
    if (y > 225) { doc.addPage(); y = 20; }
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
      if (y > 240) { doc.addPage(); y = 20; }
      doc.text(line, margin, y + 3);
      y += 4;
    });
    y += 2;
  }

  // SUMMERING
  let sy = y + 10;
  if (sy > 235) { doc.addPage(); sy = 30; }
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
    const note = doc.splitTextToSize(
      'Omvänd betalningsskyldighet för moms gäller enl 1 kap 2§ punkt 4b ML. Köparen redovisar utgående och ingående moms.',
      95,
    );
    note.forEach((ln: string) => { doc.text(ln, pageW - margin, sy, { align: 'right' }); sy += 3.5; });
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text('Moms:', 150, sy, { align: 'right' });
    doc.text('0 kr', pageW - margin, sy, { align: 'right' });
    sy += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Att utbetala:', 150, sy + 2, { align: 'right' });
  doc.text(fmtKr(total), pageW - margin, sy + 2, { align: 'right' });

  // BETALNINGSRUTA
  let by = sy + 12;
  if (by > 245) { doc.addPage(); by = 30; }
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(...LIGHT);
  doc.rect(margin, by, pageW - margin * 2, 18, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('UTBETALNING', margin + 4, by + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const payText = doc.splitTextToSize(
    `Betalning sker till säljarens bankgiro: ${team.bankgiro || '—'} (${team.company_name || team.name || '—'}). ` +
    `Ange fakturanummer ${invoiceNumber} vid betalning.`,
    pageW - margin * 2 - 8,
  );
  let py = by + 11;
  payText.forEach((ln: string) => { doc.text(ln, margin + 4, py); py += 4; });

  // FOOTER
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Betalningsvillkor: 10 dagar netto. Självfaktura enligt överenskommelse mellan parterna.', margin, 272);

  const barY = 282;
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, barY, pageW, 12, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.text(
    '\u260E 070-719 72 35    \u2709 n3prenad@smartklimat.org    \u2302 Morsstigen 3 141 71 Segeltorp',
    pageW / 2,
    barY + 7,
    { align: 'center' },
  );

  return doc;
}
