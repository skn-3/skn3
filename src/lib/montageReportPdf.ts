import jsPDF from 'jspdf';
import { litteraChangeLines, fmtVal } from '@/lib/litteraDiff';

const DARK: [number, number, number] = [51, 51, 51];
const MUTED: [number, number, number] = [120, 120, 120];
const GREEN: [number, number, number] = [34, 122, 74];

export interface MontageReportArgs {
  caseData: any;
  litteror: any[];
  deviations: any[];
}

export function buildMontageReportPdf({ caseData, litteror, deviations }: MontageReportArgs): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 18;
  const W = 210 - M * 2;
  let y = 20;

  const ensure = (need: number) => { if (y + need > 278) { doc.addPage(); y = 20; } };
  const h2 = (t: string) => {
    ensure(14);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GREEN);
    doc.text(t.toUpperCase(), M, y); y += 2;
    doc.setDrawColor(220); doc.line(M, y, M + W, y); y += 6;
    doc.setTextColor(...DARK);
  };
  const kv = (label: string, value: string) => {
    ensure(6);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text(label, M, y);
    doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold');
    doc.text(value || '—', M + 42, y);
    y += 5.5;
  };
  const para = (t: string, size = 9.5, bold = false) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(t, W);
    for (const ln of lines) { ensure(5.5); doc.text(ln, M, y); y += 4.8; }
  };

  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text('MONTAGERAPPORT', M, y);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text('SmartKlimat N3prenad AB', 210 - M, y, { align: 'right' });
  y += 6;
  doc.text(new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }), 210 - M, y, { align: 'right' });
  y += 10;

  h2('Ärende');
  kv('Adress', caseData.address);
  kv('Kund', caseData.customer_name);
  if (caseData.order_number) kv('Mockfjärds ordernr', String(caseData.order_number));
  if (caseData.km_date) kv('Kontrollmätning', new Date(caseData.km_date + 'T00:00:00').toLocaleDateString('sv-SE'));
  if (caseData.montage_date) kv('Montagedatum', new Date(caseData.montage_date + 'T00:00:00').toLocaleDateString('sv-SE'));
  if (caseData.team) kv('Montageteam', caseData.team);
  y += 4;

  h2('Kontrollmätning & utförande');
  if (!litteror.length) {
    para('Kontrollmätning ej registrerad i systemet för detta ärende.');
  } else {
    const changed = litteror.filter((r) => litteraChanges(r).length > 0);
    para(`${litteror.length} littera kontrollmätta. ${changed.length === 0 ? 'Samtliga bekräftade enligt säljorder.' : `${changed.length} med justeringar mot säljorder:`}`);
    y += 1;
    for (const r of litteror) {
      const ch = litteraChanges(r);
      const size = r.width || r.height ? ` (${fv(r.width)}×${fv(r.height)}${r.brostning ? ` / ${r.brostning}` : ''})` : '';
      ensure(6);
      para(`• ${r.littera || '—'}${size}${ch.length ? '' : ' — enligt order'}`, 9.5, ch.length > 0);
      for (const c of ch) { para(`   ${c}`, 9); }
    }
  }
  y += 4;

  h2('Avvikelser');
  if (!deviations.length) {
    para('Inga avvikelser rapporterade.');
  } else {
    for (const d of deviations) {
      ensure(10);
      para(`• ${new Date(d.created_at).toLocaleDateString('sv-SE')} — ${d.description}`, 9.5);
      if (d.action_type) para(`   Åtgärd: ${d.action_type}`, 9);
    }
  }
  y += 8;

  ensure(20);
  doc.setDrawColor(220); doc.line(M, y, M + W, y); y += 6;
  doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal');
  doc.text('SmartKlimat N3prenad AB · n3prenad@smartklimat.org · 070-719 72 35', M, y);
  y += 4.5;
  doc.text('Rapporten är genererad ur N3prenad. Kontakta oss vid frågor om innehållet.', M, y);

  return doc;
}
