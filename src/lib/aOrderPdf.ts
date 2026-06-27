// ⚠️ SÄKERHET: internal_* (extra_hours, hour_rate, extra_amount) får ALDRIG
// förekomma i PDF, mejl eller bilagor som skickas till montör. Denna generator
// tar EJ emot några internal-fält. Lägg aldrig till dem här.
import jsPDF from 'jspdf';
import { normalizeLines } from './aOrderLines';

export interface AOrderPdfLine {
  name: string;
  unit_price: number;
  qty: number;
  amount: number;
}

export interface AOrderPdfTeam {
  company_name?: string | null;
  org_nr?: string | null;
  bankgiro?: string | null;
  name?: string | null;
}

export type AOrderPdfVariant = 'a-order' | 'invoice' | 'credit';

export interface BuildAOrderPdfArgs {
  date: string;
  orderNumber: number | string;
  customerAddress: string;
  customerName?: string | null;
  lines: AOrderPdfLine[];
  description?: string | null;
  team?: AOrderPdfTeam | null;
  logoDataUrl?: string | null;
  variant?: AOrderPdfVariant;
  /** Optional subtitle row shown above the table (e.g. "Kreditering av faktura XXX-001") */
  subNote?: string | null;
}

const GREEN: [number, number, number] = [34, 197, 94];
const RED: [number, number, number] = [220, 38, 38];
const DARK: [number, number, number] = [51, 51, 51];
const LIGHT: [number, number, number] = [245, 245, 245];
const HEADER_BG: [number, number, number] = [55, 65, 81];
const WHITE: [number, number, number] = [255, 255, 255];

function fmtNum(n: number, dec = 0) {
  return Number(n || 0).toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: 2 });
}
function fmtKr(n: number) {
  return Math.round(n || 0).toLocaleString('sv-SE') + ' kr';
}

export async function loadAOrderLogo(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function buildAOrderPdf(args: BuildAOrderPdfArgs): jsPDF {
  const { date, orderNumber, customerAddress, lines: rawLines, description, team, logoDataUrl, variant = 'a-order', subNote } = args;
  // Defensive: normalize line items (handles camelCase / missing amount from legacy/imported rows)
  const lines = normalizeLines(rawLines);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const margin = 15;
  const pageW = 210;

  const titleText = variant === 'invoice' ? 'FAKTURA' : variant === 'credit' ? 'KREDITFAKTURA' : 'A-ORDER';
  const titleColor: [number, number, number] = variant === 'credit' ? RED : GREEN;
  const totalColor: [number, number, number] = variant === 'credit' ? RED : GREEN;

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
  doc.setFontSize(variant === 'credit' ? 28 : 36);
  doc.setTextColor(...titleColor);
  doc.text(titleText, pageW - margin, 30, { align: 'right' });
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(`#${orderNumber}`, pageW - margin, 38, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(customerAddress || '', pageW - margin, 44, { align: 'right' });

  // TABLE
  let y = 54;
  // header row
  doc.setFillColor(...HEADER_BG);
  doc.rect(margin, y, pageW - margin * 2, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BENÄMNING', 17, y + 5.4);
  doc.text('Å-PRIS', 115, y + 5.4, { align: 'right' });
  doc.text('LEV ANT', 145, y + 5.4, { align: 'right' });
  doc.text('SUM', 193, y + 5.4, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  let total = 0;
  lines.forEach((l, i) => {
    if (y > 245) {
      doc.addPage();
      y = 20;
    }
    if (i % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(margin, y, pageW - margin * 2, 7, 'F');
    }
    doc.setTextColor(...DARK);
    const name = doc.splitTextToSize(String(l.name || ''), 95)[0] || '';
    doc.text(name, 17, y + 4.8);
    doc.text(fmtNum(l.unit_price, 0), 115, y + 4.8, { align: 'right' });
    doc.text(fmtNum(l.qty, 0), 145, y + 4.8, { align: 'right' });
    doc.text(fmtKr(l.amount), 193, y + 4.8, { align: 'right' });
    total += Number(l.amount || 0);
    y += 7;
  });

  // thin grey line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, y + 1, pageW - margin, y + 1);
  y += 4;

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
  }

  if (subNote && subNote.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...(variant === 'credit' ? RED : DARK));
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text(subNote, margin, y + 4);
    y += 6;
  }

  // Fixed note
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFillColor(255, 251, 235); // light yellow
  doc.rect(margin, y + 2, pageW - margin * 2, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('OBS! Lämna skräpet någonstans där Ragnsells kan komma åt det.', margin + 2, y + 8.5);
  y += 14;

  // FOOTER block
  let fy = Math.max(y + 10, 225);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.text(customerAddress || '', margin, fy);

  doc.setFontSize(18);
  doc.setTextColor(...totalColor);
  doc.text(`Totalt: ${fmtKr(total)}`, pageW - margin, fy, { align: 'right' });
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'normal');
  doc.text('Moms: 0 kr', pageW - margin, fy + 6, { align: 'right' });

  // Bank info left
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const bg = team?.bankgiro ?? '';
  const company = team?.company_name ?? team?.name ?? '';
  const org = team?.org_nr ?? '';
  if (!team || !bg) {
    doc.text('Montör ej tilldelad', margin, fy + 10);
  } else {
    doc.text(`BANKGIRO: ${bg}`, margin, fy + 10);
  }
  doc.text(`${company || '—'} | ${org || '—'}`, margin, fy + 14);


  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('FAKTURAN HAR UTFÄRDATS AV SMARTKLIMAT N3PRENAD AB', margin, fy + 20);
  doc.setFont('helvetica', 'normal');
  doc.text('Betalningsvillkor: 10 dagar netto.', margin, fy + 24);
  doc.text('Momsreg. nr SE559026663001  Godkänd för F-skatt', margin, fy + 28);

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
