import { fmtKr, type OfferLineItem } from './offerCalc';
import { getPdfMake, loadLogoDataUrl, fmtDate } from './offerPdf';

const GREEN = '#22C55E';
const GREEN_DARK = '#15803D';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

export interface UppdragForInvoice {
  uppdrag_number?: string | null;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_email?: string | null;
  customer_type?: 'privat' | 'foretag' | string | null;
  customer_personnummer?: string | null;
  fastighetsbeteckning?: string | null;
  title?: string | null;
  revenue_ex_vat?: number | null;
  revenue_incl_vat?: number | null;
  rot_amount?: number | null;
  handpenning_amount?: number | null;
  slutfaktura_amount?: number | null;
  handpenning_invoice_no?: string | null;
}

export interface OfferForInvoice {
  line_items?: OfferLineItem[] | null;
  rot_base?: number | null;
}

interface InvoiceOpts {
  invoiceNo: string;
}

function addDays(d: Date, days: number): Date { const r = new Date(d); r.setDate(r.getDate() + days); return r; }

async function buildBase(uppdrag: UppdragForInvoice, title: string, invoiceNo: string) {
  const logo = await loadLogoDataUrl();
  const today = new Date();
  const due = addDays(today, 10);

  const headerRow: any = {
    columns: [
      logo ? { image: logo, width: 70, height: 70, fit: [70, 70] as any } : { text: '', width: 70 },
      {
        stack: [
          { text: title, color: GREEN_DARK, bold: true, fontSize: 22, alignment: 'right' },
          { text: `Fakturanr ${invoiceNo}`, alignment: 'right', color: MUTED, fontSize: 10 },
          { text: `Fakturadatum ${fmtDate(today)}`, alignment: 'right', color: MUTED, fontSize: 10 },
          { text: `Förfallodatum ${fmtDate(due)}`, alignment: 'right', color: MUTED, fontSize: 10 },
        ],
      },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 18],
  };

  const fromStack = [
    { text: 'Från', bold: true, color: GREEN_DARK, margin: [0, 0, 0, 4] },
    { text: 'SmartKlimat N3prenad AB' },
    { text: 'Org.nr 559026-6630', color: MUTED, fontSize: 9 },
    { text: 'Morsstigen 3, 141 71 Segeltorp', color: MUTED, fontSize: 9 },
    { text: 'VAT SE559026663001', color: MUTED, fontSize: 9 },
    { text: '070-719 72 35', color: MUTED, fontSize: 9 },
    { text: 'n3prenad@smartklimat.org', color: MUTED, fontSize: 9 },
  ];

  const toStack: any[] = [
    { text: 'Kund', bold: true, color: GREEN_DARK, margin: [0, 0, 0, 4] },
    { text: uppdrag.customer_name || '—' },
  ];
  if (uppdrag.customer_address) toStack.push({ text: uppdrag.customer_address, color: MUTED, fontSize: 9 });
  if (uppdrag.customer_type === 'privat' && uppdrag.customer_personnummer)
    toStack.push({ text: `Personnr ${uppdrag.customer_personnummer}`, color: MUTED, fontSize: 9 });

  const fromTo: any = {
    columns: [
      { stack: fromStack, width: '*' },
      { stack: toStack, width: '*' },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 16],
  };

  const refLine: any = {
    text: `Avser uppdrag ${uppdrag.uppdrag_number || '—'}${uppdrag.title ? ' · ' + uppdrag.title : ''}`,
    color: '#374151',
    margin: [0, 0, 0, 12],
  };

  const footer: any = {
    stack: [
      { text: 'Betalning till Bankgiro: 5032-4573', color: '#111827', margin: [0, 0, 0, 2] },
      { text: 'Innehar F-skattebevis.', color: MUTED, fontSize: 9 },
      { text: 'Betalningsvillkor 10 dagar netto.', color: MUTED, fontSize: 9 },
      { text: 'Vid försenad betalning utgår dröjsmålsränta enligt referensränta + 8 %.', color: MUTED, fontSize: 9 },
    ],
    margin: [0, 18, 0, 0],
  };

  return { headerRow, fromTo, refLine, footer };
}

function sumRow(label: string, value: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  return {
    columns: [
      { text: label, alignment: 'right', color: opts.color || '#374151', bold: opts.bold, fontSize: opts.size || 10 },
      { text: value, width: 130, alignment: 'right', bold: opts.bold, color: opts.color || '#111827', fontSize: opts.size || 10 },
    ],
    columnGap: 12,
    margin: [0, 2, 0, 2],
  };
}

async function renderPdf(docDef: any): Promise<Blob> {
  const pdfMake = await getPdfMake();
  return new Promise<Blob>((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(docDef);
      const timer = setTimeout(() => reject(new Error('PDF-generering tog för lång tid (timeout)')), 20000);
      doc.getBlob((blob: Blob) => { clearTimeout(timer); resolve(blob); });
    } catch (e) { reject(e); }
  });
}

const docShell = (content: any[]): any => ({
  pageSize: 'A4',
  pageMargins: [40, 50, 40, 50],
  background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 4, color: GREEN }] }),
  content,
  styles: { th: { bold: true, color: GREEN_DARK, fontSize: 10 } },
  defaultStyle: { fontSize: 10, color: '#111827' },
});

export async function buildHandpenningPdfBlob(uppdrag: UppdragForInvoice, { invoiceNo }: InvoiceOpts): Promise<Blob> {
  const { headerRow, fromTo, refLine, footer } = await buildBase(uppdrag, 'Handpenningsfaktura', invoiceNo);
  const hp = Number(uppdrag.handpenning_amount || 0);
  const exVat = Math.round(hp / 1.25);
  const vat = hp - exVat;

  const tableHeader = [
    { text: 'Benämning', style: 'th' },
    { text: 'Belopp', style: 'th', alignment: 'right' },
  ];
  const row = [
    { text: `Handpenning 25 % avseende ${uppdrag.title || 'uppdraget'}` },
    { text: fmtKr(exVat), alignment: 'right' },
  ];

  const itemsTable: any = {
    table: { headerRows: 1, widths: ['*', 110], body: [tableHeader, row] },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === 1 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => BORDER,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F0FDF4' : null),
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 12],
  };

  const summary: any = {
    columns: [
      { text: '', width: '*' },
      {
        stack: [
          sumRow('Belopp ex moms', fmtKr(exVat)),
          sumRow('Moms 25 %', fmtKr(vat)),
          sumRow('ATT BETALA', fmtKr(hp), { bold: true, color: GREEN_DARK, size: 12 }),
        ],
        width: 320,
      },
    ],
    margin: [0, 0, 0, 16],
  };

  return renderPdf(docShell([headerRow, fromTo, refLine, itemsTable, summary, footer]));
}

export async function buildSlutfakturaPdfBlob(
  uppdrag: UppdragForInvoice,
  offer: OfferForInvoice,
  { invoiceNo }: InvoiceOpts,
): Promise<Blob> {
  const { headerRow, fromTo, refLine, footer } = await buildBase(uppdrag, 'Slutfaktura', invoiceNo);

  const revEx = Number(uppdrag.revenue_ex_vat || 0);
  const revIncl = Number(uppdrag.revenue_incl_vat || 0);
  const vat = revIncl - revEx;
  const hp = Number(uppdrag.handpenning_amount || 0);
  const rot = Number(uppdrag.rot_amount || 0);
  const toPay = Number(uppdrag.slutfaktura_amount || (revIncl - hp - rot));

  const tableHeader = [
    { text: 'Benämning', style: 'th' },
    { text: 'Antal', style: 'th', alignment: 'right' },
    { text: 'Enhet', style: 'th' },
    { text: 'À-pris', style: 'th', alignment: 'right' },
    { text: 'Summa', style: 'th', alignment: 'right' },
  ];
  const itemRows = (offer.line_items || []).map(it => [
    { text: it.description || '' },
    { text: String(Number(it.qty || 0).toLocaleString('sv-SE')), alignment: 'right' },
    { text: it.unit || '' },
    { text: fmtKr(it.unit_price), alignment: 'right' },
    { text: fmtKr(it.amount), alignment: 'right' },
  ]);

  const itemsTable: any = {
    table: { headerRows: 1, widths: ['*', 50, 60, 70, 80], body: [tableHeader, ...itemRows] },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === 1 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => BORDER,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? '#F0FDF4' : null),
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 12],
  };

  const summaryStack: any[] = [
    sumRow('Delsumma ex moms', fmtKr(revEx)),
    sumRow('Moms 25 %', fmtKr(vat)),
    sumRow('Summa inkl moms', fmtKr(revIncl), { bold: true }),
    { text: '', margin: [0, 4, 0, 0] },
    sumRow(
      `Avgår: tidigare fakturerad handpenning (faktura nr ${uppdrag.handpenning_invoice_no || '—'}), inkl moms`,
      `− ${fmtKr(hp)}`,
      { color: MUTED },
    ),
    sumRow('Avgår: ROT-avdrag (skattereduktion arbete, se nedan)', `− ${fmtKr(rot)}`, { color: GREEN_DARK }),
    sumRow('ATT BETALA', fmtKr(toPay), { bold: true, color: GREEN_DARK, size: 12 }),
  ];

  const summary: any = {
    columns: [{ text: '', width: '*' }, { stack: summaryStack, width: 360 }],
    margin: [0, 0, 0, 16],
  };

  const rotBase = Number(offer.rot_base || 0);
  const rotBox: any = {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: 'ROT-avdrag', bold: true, color: GREEN_DARK, margin: [0, 0, 0, 4] },
          { text: `Rotberättigad arbetskostnad ${fmtKr(rotBase)} inkl moms · Skattereduktion 30 % = ${fmtKr(rot)} · Köpare ${uppdrag.customer_name || '—'}, personnr ${uppdrag.customer_personnummer || '—'}, fastighet ${uppdrag.fastighetsbeteckning || '—'}.`, fontSize: 9, color: '#374151' },
          { text: 'SmartKlimat N3prenad AB ansöker om utbetalning av skattereduktionen hos Skatteverket.', fontSize: 9, color: MUTED, margin: [0, 4, 0, 0] },
        ],
      }]],
    },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5,
      hLineColor: () => BORDER, vLineColor: () => BORDER,
      paddingTop: () => 8, paddingBottom: () => 8, paddingLeft: () => 10, paddingRight: () => 10,
      fillColor: () => '#F0FDF4',
    },
    margin: [0, 0, 0, 8],
  };

  const note: any = { text: 'Moms på handpenningen har redovisats på handpenningsfakturan.', color: MUTED, fontSize: 9 };

  return renderPdf(docShell([headerRow, fromTo, refLine, itemsTable, summary, rotBox, note, footer]));
}
