// Gemensam layout för SJÄLVFAKTUROR: fakturor som SmartKlimat N3prenad AB (köparen)
// utfärdar för montörsteamets (säljarens) räkning. Används av
//  - A-order → faktura/kreditfaktura (src/lib/aOrderPdf.ts, variant 'invoice' | 'credit')
//  - KM-/utbetalningsfakturor (src/lib/selfBillingPdf.ts)
// Förebild: Mockfjärds/DOVISTA självfaktura till N3prenad — säljaren står som
// avsändare, köparen som "Kund", momsfrasen under raderna och "Fakturan har
// utfärdats av <köparen>" i sidfoten.
//
// ⚠️ SÄKERHET: inga internal_*-fält (extra_hours, hour_rate, extra_amount) får
// skickas hit. Allt som ritas här hamnar i PDF:er som går till montören.
import jsPDF from 'jspdf';
import { drawRichText } from './richTextPdf';

/** Exakt samma fras som Mockfjärds använder. Ändra inte ordalydelsen. */
export const REVERSE_CHARGE_TEXT = 'Omvänd bet.skyldighet f moms gäller enl 1 kap 2§ punkt 4b ML';

export interface SelfBillingBuyer {
  name: string;
  addressLines: string[];
  orgNr: string;
  vatNr: string;
  bankgiro?: string;
  phone?: string;
  email?: string;
}

export const SELF_BILLING_BUYER: SelfBillingBuyer = {
  name: 'SmartKlimat N3prenad AB',
  addressLines: ['Morsstigen 3', '141 71 Segeltorp'],
  orgNr: '559026-6630',
  vatNr: 'SE559026663001',
  bankgiro: '5032-4573',
  phone: '070-719 72 35',
  email: 'n3prenad@smartklimat.org',
};

export interface SelfBillingSeller {
  company_name?: string | null;
  name?: string | null;
  org_nr?: string | null;
  address?: string | null;
  bankgiro?: string | null;
}

export interface SelfBillingLine {
  description: string;
  qty: number;
  unit?: string;
  unit_price: number;
  amount: number;
}

export interface SelfBillingInvoice {
  kind: 'invoice' | 'credit';
  invoiceNumber: string;
  /** Fakturadatum, YYYY-MM-DD */
  date: string;
  /** Förfallodatum, YYYY-MM-DD. Saknas → fakturadatum + 10 dagar. */
  dueDate?: string | null;
  seller: SelfBillingSeller;
  /** Vad fakturan avser, t.ex. "Montage Fyrklöversbackarna 3, Hässelby · A-order #123" */
  reference?: string | null;
  /** Rubrik i fet stil ovanför raderna (KM-fakturornas titel) */
  title?: string | null;
  lines: SelfBillingLine[];
  /** Fritext under raderna; stöder **fet** och ==röd== (src/lib/richText.ts) */
  description?: string | null;
  /** Fet notis under beskrivningen, t.ex. "Kreditering av faktura NBD-004" */
  note?: string | null;
  /** Köparen/utfärdaren. Saknas → SELF_BILLING_BUYER (SmartKlimat N3prenad AB). */
  buyer?: SelfBillingBuyer;
  vatMode: 'omvand' | 'vanlig';
  subtotal: number;
  vatAmount: number;
  total: number;
  logoDataUrl?: string | null;
}

type RGB = [number, number, number];
const DARK: RGB = [51, 51, 51];
const GREY: RGB = [120, 120, 120];
const LIGHT: RGB = [245, 245, 245];
const HEADER_BG: RGB = [55, 65, 81];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [34, 197, 94];
const RED: RGB = [220, 38, 38];

const PAGE_W = 210;
const MARGIN = 15;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_BOTTOM = 258; // under detta ritas sidfot (fast på varje sida)

// sv-SE ger U+2212 (minustecken) för negativa tal; jsPDF:s standardfonter saknar
// det tecknet och ritar skräp. Använd vanligt bindestreck i PDF:en.
function fmtNum(n: number) {
  return Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 2 }).replace(/−/g, '-');
}
export function fmtKr(n: number) {
  const v = Math.round((n || 0) * 100) / 100;
  return (Number.isInteger(v) ? v.toLocaleString('sv-SE') : v.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace(/−/g, '-') + ' kr';
}

export function vatFromOrgNr(orgNr?: string | null): string {
  const digits = String(orgNr || '').replace(/\D/g, '');
  return digits ? `SE${digits}01` : '';
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function splitAddress(address?: string | null): string[] {
  return String(address || '')
    .split(/\n|,\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function drawSelfBillingInvoice(doc: jsPDF, inv: SelfBillingInvoice): jsPDF {
  const isCredit = inv.kind === 'credit';
  doc.setProperties({ title: `${isCredit ? 'Kreditfaktura' : 'Faktura'} ${inv.invoiceNumber}` });
  const accent: RGB = isCredit ? RED : GREEN;
  const dueDate = inv.dueDate || addDays(inv.date, 10);
  const seller = inv.seller || {};
  const sellerName = seller.company_name || seller.name || '—';
  const sellerVat = vatFromOrgNr(seller.org_nr);
  const buyer = inv.buyer ?? SELF_BILLING_BUYER;

  const setText = (size: number, style: 'normal' | 'bold', color: RGB) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  // ───────────────────────── SÄLJARE (vänster, överst) ─────────────────────────
  let ly = 16;
  setText(7, 'bold', GREY);
  doc.text('SÄLJARE', MARGIN, ly);
  ly += 5;
  setText(11, 'bold', DARK);
  doc.text(doc.splitTextToSize(sellerName, 95)[0], MARGIN, ly);
  ly += 5.5;
  setText(9, 'normal', DARK);
  for (const line of splitAddress(seller.address)) {
    doc.text(doc.splitTextToSize(line, 95)[0], MARGIN, ly);
    ly += 4.4;
  }
  if (seller.org_nr) { doc.text(`Orgnr ${seller.org_nr}`, MARGIN, ly); ly += 4.4; }
  if (sellerVat) { doc.text(`Momsregnr ${sellerVat}`, MARGIN, ly); ly += 4.4; }
  doc.text('Godkänd för F-skatt', MARGIN, ly);
  ly += 4.4;

  // ───────────────────────── KÖPARE (vänster, under säljaren) ─────────────────────────
  ly += 6;
  setText(7, 'bold', GREY);
  doc.text('KÖPARE (UTFÄRDARE AV FAKTURAN)', MARGIN, ly);
  ly += 5;
  setText(11, 'bold', DARK);
  doc.text(buyer.name, MARGIN, ly);
  ly += 5.5;
  setText(9, 'normal', DARK);
  for (const line of buyer.addressLines) { doc.text(line, MARGIN, ly); ly += 4.4; }
  doc.text(`Orgnr ${buyer.orgNr}`, MARGIN, ly); ly += 4.4;
  doc.text(`Momsregnr ${buyer.vatNr}`, MARGIN, ly); ly += 4.4;

  // ───────────────────────── Titel + fakturauppgifter (höger) ─────────────────────────
  setText(isCredit ? 22 : 26, 'bold', accent);
  doc.text(isCredit ? 'KREDITFAKTURA' : 'FAKTURA', RIGHT, 24, { align: 'right' });
  setText(8, 'normal', GREY);
  doc.text('Självfakturering – utfärdad av köparen för säljarens räkning', RIGHT, 30, { align: 'right' });

  const meta: Array<[string, string, boolean]> = [
    [isCredit ? 'Kreditfakturanummer' : 'Fakturanummer', inv.invoiceNumber, true],
    ['Fakturadatum', inv.date, false],
  ];
  if (!isCredit) {
    meta.push(['Förfallodatum', dueDate, false]);
    meta.push(['Betalningsvillkor', '10 dagar netto', false]);
  }
  meta.push(['Bankgiro/konto (säljarens)', seller.bankgiro || '—', false]);

  let my = 38;
  const metaLabelX = 118;
  for (const [label, value, strong] of meta) {
    setText(8, 'normal', GREY);
    doc.text(label, metaLabelX, my);
    setText(strong ? 10 : 9, strong ? 'bold' : 'normal', DARK);
    doc.text(value, RIGHT, my, { align: 'right' });
    my += 5.2;
  }

  // ───────────────────────── Avser / rubrik ─────────────────────────
  let y = Math.max(ly, my) + 6;
  if (inv.reference && inv.reference.trim()) {
    setText(9, 'bold', DARK);
    const refLines = doc.splitTextToSize(`Avser: ${inv.reference.trim()}`, PAGE_W - MARGIN * 2);
    refLines.forEach((ln: string) => { doc.text(ln, MARGIN, y); y += 4.4; });
    y += 1;
  }
  if (inv.title && inv.title.trim()) {
    setText(11, 'bold', DARK);
    doc.text(doc.splitTextToSize(inv.title.trim(), PAGE_W - MARGIN * 2)[0], MARGIN, y);
    y += 6;
  }

  const ensure = (h: number) => {
    if (y + h > CONTENT_BOTTOM) { doc.addPage(); y = 22; }
  };

  // ───────────────────────── Rader ─────────────────────────
  const COL_NAME = 17, COL_PRICE = 128, COL_QTY = 156, COL_SUM = 193, NAME_W = 102;
  const drawTableHead = () => {
    doc.setFillColor(...HEADER_BG);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 8, 'F');
    setText(8, 'bold', WHITE);
    doc.text('BENÄMNING', COL_NAME, y + 5.4);
    doc.text('À-PRIS', COL_PRICE, y + 5.4, { align: 'right' });
    doc.text('ANTAL', COL_QTY, y + 5.4, { align: 'right' });
    doc.text('BELOPP', COL_SUM, y + 5.4, { align: 'right' });
    y += 8;
  };
  y += 2;
  ensure(30);
  drawTableHead();

  inv.lines.forEach((l, i) => {
    setText(8, 'normal', DARK);
    const nameLines: string[] = doc.splitTextToSize(String(l.description || ''), NAME_W).slice(0, 2);
    const rowH = nameLines.length > 1 ? 10.5 : 7;
    if (y + rowH > CONTENT_BOTTOM) { doc.addPage(); y = 22; drawTableHead(); setText(8, 'normal', DARK); }
    if (i % 2 === 1) {
      doc.setFillColor(...LIGHT);
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rowH, 'F');
    }
    setText(8, 'normal', DARK);
    nameLines.forEach((ln, k) => doc.text(ln, COL_NAME, y + 4.8 + k * 3.6));
    doc.text(fmtNum(l.unit_price), COL_PRICE, y + 4.8, { align: 'right' });
    doc.text(`${fmtNum(l.qty)}${l.unit ? ' ' + l.unit : ''}`, COL_QTY, y + 4.8, { align: 'right' });
    doc.text(fmtKr(l.amount), COL_SUM, y + 4.8, { align: 'right' });
    y += rowH;
  });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 1, RIGHT, y + 1);
  y += 6;

  // ───────────────────────── Beskrivning / notis ─────────────────────────
  if (inv.description && inv.description.trim()) {
    ensure(12);
    setText(8, 'bold', DARK);
    doc.text('Beskrivning:', MARGIN, y);
    y += 4.5;
    y = drawRichText(doc, inv.description, {
      x: MARGIN,
      y,
      maxWidth: PAGE_W - MARGIN * 2,
      lineHeight: 4,
      fontSize: 8,
      color: DARK,
      redColor: RED,
      pageBreakAt: CONTENT_BOTTOM,
      onPageBreak: () => { doc.addPage(); return 22; },
    });
    y += 2;
  }
  if (inv.note && inv.note.trim()) {
    ensure(8);
    setText(9, 'bold', isCredit ? RED : DARK);
    doc.text(doc.splitTextToSize(inv.note.trim(), PAGE_W - MARGIN * 2)[0], MARGIN, y);
    y += 7;
  }

  // ───────────────────────── Moms + summering ─────────────────────────
  ensure(44);
  y += 2;
  const sumTop = y;
  if (inv.vatMode === 'omvand') {
    setText(9, 'bold', DARK);
    doc.text(REVERSE_CHARGE_TEXT, MARGIN, y + 4);
    setText(8, 'normal', GREY);
    doc.text('Köparen redovisar utgående och ingående moms.', MARGIN, y + 8.5);
  }

  let sy = sumTop + 4;
  setText(10, 'normal', DARK);
  doc.text('Summa exkl. moms', 150, sy, { align: 'right' });
  doc.text(fmtKr(inv.subtotal), RIGHT, sy, { align: 'right' });
  sy += 5.5;
  doc.text(inv.vatMode === 'vanlig' ? 'Moms 25 %' : 'Moms 0 %', 150, sy, { align: 'right' });
  doc.text(fmtKr(inv.vatMode === 'vanlig' ? inv.vatAmount : 0), RIGHT, sy, { align: 'right' });
  sy += 8;
  setText(13, 'bold', accent);
  doc.text(isCredit ? 'KREDITBELOPP' : 'ATT BETALA', 150, sy, { align: 'right' });
  doc.text(fmtKr(inv.total), RIGHT, sy, { align: 'right' });
  y = sy + 8;

  // ───────────────────────── Betalningsruta ─────────────────────────
  ensure(24);
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(...LIGHT);
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 20, 'FD');
  setText(9, 'bold', DARK);
  doc.text(isCredit ? 'KREDITERING' : 'UTBETALNING', MARGIN + 4, y + 6);
  setText(8, 'normal', DARK);
  const payText = isCredit
    ? `Krediten kvittas i första hand mot kommande utbetalningar mellan parterna. Är originalfakturan redan reglerad sker återbetalning till ${buyer.name}${buyer.bankgiro ? `, bankgiro ${buyer.bankgiro}` : ''}.`
    : `${buyer.name} betalar ${fmtKr(inv.total)} till säljarens bankgiro/konto ${seller.bankgiro || '—'} (${sellerName}) senast ${dueDate}. ` +
      `Säljaren ska inte skicka någon egen faktura för detta arbete. Fakturanummer ${inv.invoiceNumber} anges vid betalningen.`;
  const payLines = doc.splitTextToSize(payText, PAGE_W - MARGIN * 2 - 8);
  let py = y + 11;
  payLines.slice(0, 2).forEach((ln: string) => { doc.text(ln, MARGIN + 4, py); py += 4; });
  y += 24;

  // ───────────────────────── Sidfot på varje sida ─────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 266, RIGHT, 266);
    let fx = MARGIN;
    if (inv.logoDataUrl) {
      try { doc.addImage(inv.logoDataUrl, 'PNG', MARGIN, 268, 9, 9); fx = MARGIN + 12; } catch { /* ignore */ }
    }
    setText(8, 'bold', DARK);
    doc.text(`Fakturan har utfärdats av ${buyer.name} (köparen) för säljarens räkning.`, fx, 272);
    setText(8, 'normal', GREY);
    doc.text('Självfakturering enligt överenskommelse mellan parterna.', fx, 276);
    if (pages > 1) doc.text(`Sida ${p} av ${pages}`, RIGHT, 276, { align: 'right' });

    doc.setFillColor(...HEADER_BG);
    doc.rect(0, 282, PAGE_W, 12, 'F');
    setText(7, 'normal', WHITE);
    doc.text(
      [buyer.name, `Orgnr ${buyer.orgNr}`, buyer.phone, buyer.email, buyer.addressLines.join(', ')].filter(Boolean).join('  ·  '),
      PAGE_W / 2,
      289,
      { align: 'center' },
    );
  }
  doc.setPage(pages);
  return doc;
}
