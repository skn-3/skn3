import jsPDF from 'jspdf';

const DARK: [number, number, number] = [40, 40, 40];
const MUTED: [number, number, number] = [115, 115, 115];
const LINE: [number, number, number] = [200, 200, 200];

interface Measurements {
  top_mm: number; vertical_mm: number; bottom_mm: number; drip_mm: number;
  upper_angle: number | string; lower_angle: number | string; bottom_angle: number | string;
}
interface PdfProfile {
  mode: 'manual' | 'image';
  type: 'l-profil' | 'underbleck';
  color?: string;
  with_gables?: boolean;
  lengths: { length_mm: number; qty: number }[];
  measurements?: Measurements;
  image_filename?: string;
  image_description?: string;
}
export interface SheetMetalPdfArgs {
  caseAddress: string;
  montorName: string;
  montorPhone: string;
  notes?: string;
  profiles: PdfProfile[];
  createdBy: string;
}

const typeLabel = (p: PdfProfile) => (p.type === 'l-profil' ? 'L-Profil' : 'Underbleck');
const utvBredd = (m?: Measurements) =>
  m ? (Number(m.top_mm) || 0) + (Number(m.vertical_mm) || 0) + (Number(m.bottom_mm) || 0) + (Number(m.drip_mm) || 0) : null;

function drawProfileSketch(doc: jsPDF, m: Measurements, x: number, y: number, boxW: number, boxH: number) {
  const top = Number(m.top_mm) || 0, vert = Number(m.vertical_mm) || 0,
        bot = Number(m.bottom_mm) || 0, drip = Number(m.drip_mm) || 0;
  const dripDx = drip * 0.7, dripDy = drip * 0.7;
  const rawW = Math.max(top, bot + dripDx, 1);
  const rawH = Math.max(vert + dripDy, 1);
  const s = Math.min((boxW - 24) / rawW, (boxH - 14) / rawH);
  const ox = x + 12, oy = y + 7;

  const p0 = { x: ox, y: oy };
  const p1 = { x: ox + top * s, y: oy };
  const p2 = { x: p1.x, y: oy + vert * s };
  const p3 = { x: p2.x - bot * s, y: p2.y };
  const p4 = { x: p3.x - dripDx * s, y: p3.y + dripDy * s };

  doc.setDrawColor(...DARK); doc.setLineWidth(0.5);
  doc.line(p0.x, p0.y, p1.x, p1.y);
  doc.line(p1.x, p1.y, p2.x, p2.y);
  doc.line(p2.x, p2.y, p3.x, p3.y);
  doc.line(p3.x, p3.y, p4.x, p4.y);

  doc.setFontSize(7); doc.setTextColor(...DARK); doc.setFont('helvetica', 'normal');
  doc.text(`${top}`, (p0.x + p1.x) / 2, p0.y - 1.5, { align: 'center' });
  doc.text(`${vert}`, p1.x + 2, (p1.y + p2.y) / 2 + 1);
  doc.text(`${bot}`, (p2.x + p3.x) / 2, p2.y + 3, { align: 'center' });
  doc.text(`${drip}`, p4.x - 1, (p3.y + p4.y) / 2 + 1, { align: 'right' });

  doc.setTextColor(...MUTED);
  if (m.upper_angle !== undefined && m.upper_angle !== '') doc.text(`${m.upper_angle}°`, p1.x + 2, p1.y - 1);
  if (m.lower_angle !== undefined && m.lower_angle !== '') doc.text(`${m.lower_angle}°`, p2.x + 2, p2.y + 3);
  if (m.bottom_angle !== undefined && m.bottom_angle !== '') doc.text(`${m.bottom_angle}°`, p3.x - 1, p3.y + 4);
  doc.setTextColor(...DARK);
}

export function buildSheetMetalOrderPdf(args: SheetMetalPdfArgs): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 16;
  const W = 210 - M * 2;
  let y = 18;
  const ensure = (need: number) => { if (y + need > 282) { doc.addPage(); y = 18; } };

  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text('BESTÄLLNING — BYGGPLÅT', M, y);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
  doc.text(new Date().toLocaleDateString('sv-SE'), 210 - M, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.6); doc.line(M, y, M + W, y); y += 6;

  const kv = (label: string, value: string, x: number, colW: number) => {
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(label, x, y);
    doc.setFontSize(9.5); doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(value || '—', colW), x, y + 4);
    doc.setFont('helvetica', 'normal');
  };
  kv('Beställare', 'SmartKlimat N3prenad AB · 559026-6630', M, 88);
  kv('Objekt / Märkning', args.caseAddress, M + 95, 80);
  y += 11;
  kv('Kontakt (montör)', `${args.montorName}${args.montorPhone ? ' · ' + args.montorPhone : ''}`, M, 88);
  kv('Beställd av', args.createdBy, M + 95, 80);
  y += 12;

  const cols = [
    { h: 'Pos', w: 10 }, { h: 'Antal', w: 14 }, { h: 'Benämning', w: 38 },
    { h: 'Kulör', w: 30 }, { h: 'Utv. bredd', w: 22 }, { h: 'Längd', w: 20 }, { h: 'Anmärkning', w: 44 },
  ];
  const drawHeader = () => {
    ensure(9);
    doc.setFillColor(240, 240, 238); doc.rect(M, y - 4.5, W, 7, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    let cx = M + 1.5;
    for (const c of cols) { doc.text(c.h, cx, y); cx += c.w; }
    y += 5;
    doc.setFont('helvetica', 'normal');
  };
  drawHeader();

  let pos = 0;
  args.profiles.forEach((p, pi) => {
    const utv = utvBredd(p.measurements);
    const anm: string[] = [];
    if (p.with_gables) anm.push('Med gavlar');
    if (p.mode === 'image') {
      if (p.image_description) anm.push(p.image_description);
      anm.push(`Skiss: ${p.image_filename || 'bifogad bild'}`);
    }
    for (const l of p.lengths) {
      pos++;
      ensure(8);
      doc.setFontSize(8.5); doc.setTextColor(...DARK);
      const anmText = doc.splitTextToSize(anm.join('. ') || `Se skiss P${pi + 1}`, cols[6].w - 2);
      const rowH = Math.max(6, anmText.length * 3.6 + 2.5);
      ensure(rowH);
      let cx = M + 1.5;
      const cells = [
        String(pos), `${l.qty} st`, `${typeLabel(p)} (P${pi + 1})`,
        p.color || '—', utv != null ? `${utv} mm` : '—', `${l.length_mm} mm`,
      ];
      cells.forEach((c, i) => { doc.text(c, cx, y); cx += cols[i].w; });
      doc.text(anmText, cx, y);
      y += rowH;
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y - 3, M + W, y - 3);
    }
  });
  y += 4;

  ensure(12);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text('PROFILSKISSER', M, y); y += 2;
  doc.setDrawColor(...DARK); doc.setLineWidth(0.4); doc.line(M, y, M + W, y); y += 5;

  args.profiles.forEach((p, pi) => {
    const boxH = p.mode === 'manual' ? 42 : 16;
    ensure(boxH + 10);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
    doc.text(`P${pi + 1} — ${typeLabel(p)}${p.color ? ` · ${p.color}` : ''}${p.with_gables ? ' · med gavlar' : ''}`, M, y);
    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
    doc.rect(M, y, W, boxH);
    if (p.mode === 'manual' && p.measurements) {
      drawProfileSketch(doc, p.measurements, M + 4, y + 2, 100, boxH - 4);
      doc.setFontSize(8); doc.setTextColor(...MUTED);
      const m = p.measurements;
      const info = [
        `Övre kant: ${m.top_mm} mm`, `Vertikal: ${m.vertical_mm} mm`,
        `Botten: ${m.bottom_mm} mm`, `Droppläpp: ${m.drip_mm} mm`,
        `Utvecklad bredd: ${utvBredd(m)} mm`,
      ];
      info.forEach((t, i) => doc.text(t, M + 116, y + 7 + i * 5));
      doc.setTextColor(...DARK);
    } else {
      doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text(`Fotoskiss bifogas i mailet: ${p.image_filename || 'bild'}${p.image_description ? ` — ${p.image_description}` : ''}`, M + 4, y + 9);
      doc.setTextColor(...DARK);
    }
    y += boxH + 6;
  });

  if (args.notes && args.notes.trim()) {
    ensure(16);
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.text('Övrigt:', M, y); y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const lines = doc.splitTextToSize(args.notes.trim(), W);
    for (const ln of lines) { ensure(5); doc.text(ln, M, y); y += 4.3; }
  }

  ensure(14);
  y = Math.max(y + 4, 270);
  doc.setDrawColor(...LINE); doc.line(M, y, M + W, y); y += 4.5;
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text('SmartKlimat N3prenad AB · n3prenad@smartklimat.org · 070-719 72 35 · Genererad ur N3prenad', M, y);

  return doc;
}
