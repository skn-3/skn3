import { calcOfferTotals, fmtKr, type OfferLineItem } from './offerCalc';

type TDocumentDefinitions = any;

// pdfmake laddas globalt via CDN i index.html (window.pdfMake) — undviker Vites bundler/vfs-problem.
export function getPdfMake(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfMake?.createPdf) return resolve((window as any).pdfMake);
    let tries = 0;
    const iv = setInterval(() => {
      if ((window as any).pdfMake?.createPdf) { clearInterval(iv); resolve((window as any).pdfMake); }
      else if (++tries > 100) { clearInterval(iv); reject(new Error('pdfmake kunde inte laddas (CDN)')); }
    }, 100);
  });
}

const nfc = (s: any) => (s ?? '').toString().normalize('NFC');



const GREEN = '#22C55E';
const GREEN_DARK = '#15803D';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

let logoCache: string | null = null;
export async function loadLogoDataUrl(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    logoCache = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('sv-SE');
}


export interface OfferForPdf {
  offer_number?: string | null;
  created_at?: string | null;
  valid_until?: string | null;
  payment_terms?: string | null;
  customer_type: 'privat' | 'foretag';
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_personnummer?: string | null;
  fastighetsbeteckning?: string | null;
  title?: string | null;
  description?: string | null;
  line_items: OfferLineItem[];
  vat_mode: 'vanlig' | 'omvand';
  rot_enabled: boolean;
  rot_percent: number;
  handpenning_percent?: number;
  terms_text?: string | null;
}

export interface OfferPdfOptions {
  signature?: { name: string; acceptedAt: string };
}

export async function buildOfferPdfBlob(offer: OfferForPdf, opts: OfferPdfOptions = {}): Promise<Blob> {
  const logo = await loadLogoDataUrl();
  const hpPercent = Number(offer.handpenning_percent ?? 25);
  const totals = calcOfferTotals(offer.line_items || [], {
    vat_mode: offer.vat_mode,
    rot_enabled: offer.rot_enabled,
    rot_percent: offer.rot_percent,
    handpenning_percent: hpPercent,
  });

  const validDays = (() => {
    if (!offer.valid_until) return 30;
    const start = offer.created_at ? new Date(offer.created_at) : new Date();
    const end = new Date(offer.valid_until);
    const ms = end.getTime() - start.getTime();
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  })();

  // Header row: logo left, meta right
  const headerRow: any = {
    columns: [
      logo
        ? { image: logo, width: 70, height: 70, fit: [70, 70] as any }
        : { text: '', width: 70 },
      {
        stack: [
          { text: 'OFFERT', color: GREEN_DARK, bold: true, fontSize: 22, alignment: 'right' },
          { text: offer.offer_number ? `Nr ${nfc(offer.offer_number)}` : '', alignment: 'right', color: MUTED, fontSize: 10 },
          { text: `Datum ${fmtDate(offer.created_at || new Date())}`, alignment: 'right', color: MUTED, fontSize: 10 },
          offer.valid_until
            ? { text: `Giltig t.o.m. ${fmtDate(offer.valid_until)}`, alignment: 'right', color: MUTED, fontSize: 10 }
            : null,
        ].filter(Boolean) as any[],
      },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 18] as [number, number, number, number],
  };

  // From / To columns
  const fromStack = [
    { text: 'Från', bold: true, color: GREEN_DARK, margin: [0, 0, 0, 4] as [number, number, number, number] },
    { text: 'SmartKlimat N3prenad AB' },
    { text: 'Org.nr 559026-6630', color: MUTED, fontSize: 9 },
    { text: 'Morsstigen 3, 141 71 Segeltorp', color: MUTED, fontSize: 9 },
    { text: '070-719 72 35', color: MUTED, fontSize: 9 },
    { text: 'n3prenad@smartklimat.org', color: MUTED, fontSize: 9 },
    { text: 'Godkänd för F-skatt', color: MUTED, fontSize: 9, italics: true },
  ];

  const toStack: any[] = [
    { text: 'Till', bold: true, color: GREEN_DARK, margin: [0, 0, 0, 4] },
    { text: nfc(offer.customer_name) || '—' },
  ];
  if (offer.customer_address) toStack.push({ text: nfc(offer.customer_address), color: MUTED, fontSize: 9 });
  if (offer.customer_email) toStack.push({ text: nfc(offer.customer_email), color: MUTED, fontSize: 9 });
  if (offer.customer_phone) toStack.push({ text: nfc(offer.customer_phone), color: MUTED, fontSize: 9 });
  if (offer.customer_type === 'privat' && offer.customer_personnummer)
    toStack.push({ text: `Personnr: ${nfc(offer.customer_personnummer)}`, color: MUTED, fontSize: 9 });
  if (offer.customer_type === 'privat' && offer.fastighetsbeteckning)
    toStack.push({ text: `Fastighet: ${nfc(offer.fastighetsbeteckning)}`, color: MUTED, fontSize: 9 });


  const fromTo: any = {
    columns: [
      { stack: fromStack, width: '*' },
      { stack: toStack, width: '*' },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 16],
  };

  const titleBlock: any[] = [];
  if (offer.title) titleBlock.push({ text: nfc(offer.title), fontSize: 14, bold: true, margin: [0, 0, 0, 4] });
  if (offer.description) titleBlock.push({ text: nfc(offer.description), color: '#374151', margin: [0, 0, 0, 12] });

  // Items table
  const showLaborBadge = offer.rot_enabled && offer.vat_mode === 'vanlig';
  const priceFactor = offer.vat_mode === 'vanlig' ? 1.25 : 1;
  const priceSuffix = offer.vat_mode === 'vanlig' ? ' (inkl. moms)' : ' (exkl. moms)';
  const tableHeader = [
    { text: 'Benämning', style: 'th' },
    { text: 'Antal', style: 'th', alignment: 'right' },
    { text: 'Enhet', style: 'th' },
    { text: 'À-pris', style: 'th', alignment: 'right' },
    { text: 'Summa' + priceSuffix, style: 'th', alignment: 'right' },
  ];

  const itemRows = (offer.line_items || []).map(it => {
    const desc: any = showLaborBadge && it.is_labor
      ? { stack: [
          { text: nfc(it.description) },
          { text: 'arbete', fontSize: 8, color: GREEN_DARK, italics: true },
        ] }
      : { text: nfc(it.description) };
    return [
      desc,
      { text: String(Number(it.qty || 0).toLocaleString('sv-SE')), alignment: 'right' },
      { text: nfc(it.unit) },
      { text: fmtKr(Number(it.unit_price || 0) * priceFactor), alignment: 'right' },
      { text: fmtKr(Number(it.amount || 0) * priceFactor), alignment: 'right' },
    ];
  });


  const itemsTable: any = {
    table: {
      headerRows: 1,
      widths: ['*', 50, 60, 70, 80],
      body: [tableHeader, ...itemRows],
    },
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

  // Summary block right aligned
  const sumRow = (label: string, value: string, opts: { bold?: boolean; color?: string; size?: number } = {}) => ({
    columns: [
      { text: label, alignment: 'right', color: opts.color || '#374151', bold: opts.bold, fontSize: opts.size || 10 },
      { text: value, width: 110, alignment: 'right', bold: opts.bold, color: opts.color || '#111827', fontSize: opts.size || 10 },
    ],
    columnGap: 12,
    margin: [0, 2, 0, 2],
  });

  const summaryStack: any[] = [];
  const rotActive = offer.rot_enabled && offer.vat_mode === 'vanlig';

  // 1) Ordersumma innan avdrag
  summaryStack.push(sumRow('Ordersumma innan avdrag', fmtKr(totals.total_incl_vat), rotActive ? {} : { bold: true, color: GREEN_DARK, size: 12 }));
  if (offer.vat_mode === 'omvand') {
    summaryStack.push(sumRow('', 'omvänd byggmoms', { color: MUTED, size: 9 }));
  } else {
    summaryStack.push(sumRow('', `varav moms ${fmtKr(totals.total_vat)}`, { color: MUTED, size: 9 }));
  }

  // 2) ROT-block
  if (rotActive) {
    summaryStack.push({ text: '', margin: [0, 4, 0, 0] });
    summaryStack.push(sumRow('Rotberättigad arbetskostnad', fmtKr(totals.rot_base), { color: MUTED }));
    summaryStack.push(sumRow(`Preliminärt ROT-avdrag (${offer.rot_percent}%)`, `-${fmtKr(totals.rot_amount)}`, { color: GREEN_DARK }));
    summaryStack.push(sumRow('Total ordersumma efter ROT', fmtKr(totals.total_after_rot), { bold: true, color: GREEN_DARK, size: 12 }));
  }

  // 3) Handpenning + slutfaktura
  if (hpPercent > 0) {
    summaryStack.push({ text: '', margin: [0, 4, 0, 0] });
    summaryStack.push(sumRow(`Handpenning ${hpPercent}%${offer.rot_enabled ? ' (före ROT)' : ''}`, fmtKr(totals.handpenning)));
    summaryStack.push(sumRow(`Slutfaktura${rotActive ? ' (efter prel. ROT-avdrag)' : ''}`, fmtKr(totals.slutfaktura)));
  }

  const summary: any = {
    columns: [
      { text: '', width: '*' },
      { stack: summaryStack, width: 320 },
    ],
    margin: [0, 0, 0, 16],
  };

  const footer1: any = {
    text: `Giltig ${validDays} dagar. Betalningsvillkor ${nfc(offer.payment_terms) || '10 dagar netto'}. Allmänna villkor, se sida 2.`,
    color: MUTED,
    fontSize: 9,
    margin: [0, 16, 0, 0],
  };

  // Page 2 — terms
  const termsPage: any[] = [
    { text: 'Allmänna villkor', fontSize: 16, bold: true, color: GREEN_DARK, margin: [0, 0, 0, 10], pageBreak: 'before' },
    { text: nfc(offer.terms_text), fontSize: 9, color: '#374151', lineHeight: 1.35 },
  ];

  // Optional verification page
  const verificationPage: any[] = [];
  if (opts.signature) {
    const acceptedDate = new Date(opts.signature.acceptedAt);
    const acceptedFmt = isNaN(acceptedDate.getTime())
      ? opts.signature.acceptedAt
      : acceptedDate.toLocaleString('sv-SE');
    verificationPage.push(
      { text: 'Verifikat – elektroniskt accepterad', fontSize: 18, bold: true, color: GREEN_DARK, pageBreak: 'before', margin: [0, 0, 0, 16] },
      {
        table: {
          widths: [140, '*'],
          body: [
            [{ text: 'Offert nr', bold: true, color: GREEN_DARK }, { text: nfc(offer.offer_number) || '—' }],
            [{ text: 'Accepterad av', bold: true, color: GREEN_DARK }, { text: nfc(opts.signature.name) || '—' }],
            [{ text: 'Datum/tid', bold: true, color: GREEN_DARK }, { text: nfc(acceptedFmt) }],
            [{ text: 'Dokumentreferens', bold: true, color: GREEN_DARK }, { text: nfc(offer.offer_number) || '—' }],

          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => BORDER,
          paddingTop: () => 8,
          paddingBottom: () => 8,
        },
        margin: [0, 0, 0, 20],
      },
      {
        text: 'Offerten har accepterats elektroniskt via SmartKlimat N3prenads offertsystem. Accepten har loggats med tidpunkt och IP-adress.',
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.4,
      },
    );
  }

  const docDef: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 50],
    background: () => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 4, color: GREEN }],
    }) as any,
    content: [
      headerRow,
      fromTo,
      ...titleBlock,
      itemsTable,
      summary,
      footer1,
      ...termsPage,
      ...verificationPage,
    ],
    styles: {
      th: { bold: true, color: GREEN_DARK, fontSize: 10 },
    },
    defaultStyle: {
      fontSize: 10,
      color: '#111827',
    },
  };

  const pdfMake = await getPdfMake();
  return new Promise<Blob>((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(docDef);
      const timer = setTimeout(() => reject(new Error('PDF-generering tog för lång tid (timeout)')), 20000);
      doc.getBlob((blob: Blob) => { clearTimeout(timer); resolve(blob); });
    } catch (e) { reject(e); }
  });
}
