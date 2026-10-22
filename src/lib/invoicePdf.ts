// Handpenningsfaktura + slutfaktura för N3prenads egna uppdrag. Samma varumärkessystem som offerten
// och orderbekräftelsen (offerPdf.ts / orderConfirmationPdf.ts): pdfmake, Figtree + Bricolage Grotesque,
// mörkgrönt band, paper-kort och guldaccenter. Logotypen i bandet är den vita stämpeln (på mörkt).
import { fmtKr, type OfferLineItem } from './offerCalc';
import { fmtDateLong } from './offerText';
import { ensurePdfFonts, getPdfMake, loadLogoDataUrl } from './offerPdf';

type TDocumentDefinitions = any;
const nfc = (s: any) => (s ?? '').toString().normalize('NFC');

// Samma tokens som offerPdf.ts / orderConfirmationPdf.ts / src/index.css
const C = {
  ink: '#0B3D2E', inkDeep: '#082B21', gold: '#DCBE6E', goldInk: '#8A6A14', goldSoft: '#F6EDD0',
  sage: '#7A8A72', paper: '#F5F3EE', text: '#15211B', muted: '#5E6B64',
  border: '#E3E1DA', borderStrong: '#CFCCC2', white: '#FFFFFF', onDarkMuted: '#C9D6CE', onDarkFaint: '#9FB8AC',
  success: '#2E7D4F',
};
const PAGE_W = 595.28;
const M = 44;
const BAND_H = 124;
const SLIM_H = 34;
const TOP = 64;
const CONTENT_W = PAGE_W - 2 * M;

export const COMPANY = {
  name: 'SmartKlimat N3prenad AB',
  orgNr: '559026-6630',
  vatNr: 'SE559026663001',
  address: 'Morsstigen 3, 141 71 Segeltorp',
  phone: '070-719 72 35',
  email: 'n3prenad@smartklimat.org',
  web: 'www.n3prenad.se',
  bankgiro: '5032-4573',
};
const PAYMENT_DAYS = 10;

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
  revenue_after_rot?: number | null;
  rot_amount?: number | null;
  handpenning_amount?: number | null;
  slutfaktura_amount?: number | null;
  handpenning_invoice_no?: string | null;
}

export interface OfferForInvoice {
  offer_number?: string | null;
  line_items?: OfferLineItem[] | null;
  rot_base?: number | null;
  rot_percent?: number | null;
  vat_mode?: 'vanlig' | 'omvand' | string | null;
  handpenning_percent?: number | null;
  payment_terms?: string | null;
}

export interface InvoiceOpts {
  invoiceNo: string;
  /** Fakturadatum, default i dag. */
  invoiceDate?: Date;
}

interface PdfAssets { logoWhite?: string | null; sans: string; display: string }

function addDays(d: Date, days: number): Date { const r = new Date(d); r.setDate(r.getDate() + days); return r; }
function fmtDateIso(d: Date): string { return d.toLocaleDateString('sv-SE'); }

/** "Offert – Renovering …" → "Renovering …" */
export function cleanTitle(title: string | null | undefined): string {
  return nfc(title).replace(/^offert\s*[–-]\s*/i, '').trim();
}

/** Gemensamma delar: band, sidfot, metarad, adressblock, betalningsruta och finstilt. */
function buildShared(kind: 'handpenning' | 'slut', uppdrag: UppdragForInvoice, offer: OfferForInvoice, opts: InvoiceOpts, assets: PdfAssets) {
  const SANS = assets.sans; const DISPLAY = assets.display;
  const invoiceDate = opts.invoiceDate ?? new Date();
  const dueDate = addDays(invoiceDate, PAYMENT_DAYS);
  const invoiceNo = nfc(opts.invoiceNo) || '—';
  const kindLabel = kind === 'handpenning' ? 'HANDPENNINGSFAKTURA' : 'SLUTFAKTURA';
  const kindName = kind === 'handpenning' ? 'Handpenningsfaktura' : 'Slutfaktura';
  const isPrivate = uppdrag.customer_type === 'privat';
  const reverseVat = offer.vat_mode === 'omvand';

  const label = (t: string, extra: any = {}) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, characterSpacing: 0.9, color: C.muted, ...extra });
  const rightText = (t: string, y: number, extra: any = {}) => ({ columns: [{ width: PAGE_W - M, text: t, alignment: 'right', ...extra }], absolutePosition: { x: 0, y } });
  const sectionHead = (t: string) => ({
    stack: [
      label(t, { color: C.goldInk }),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.6, lineColor: C.border }], margin: [0, 4, 0, 0] },
    ],
    margin: [0, 14, 0, 9],
  });

  const background = (page: number) => {
    const tall = page === 1;
    const h = tall ? BAND_H : SLIM_H;
    const items: any[] = [{ canvas: [
      { type: 'rect', x: 0, y: 0, w: PAGE_W, h, color: C.inkDeep },
      { type: 'rect', x: 0, y: h, w: PAGE_W, h: 2, color: C.gold },
    ] }];
    if (tall) {
      if (assets.logoWhite) items.push({ image: assets.logoWhite, width: 50, height: 50, absolutePosition: { x: M, y: 30 } });
      items.push({ text: 'SmartKlimat', font: DISPLAY, bold: true, fontSize: 15, color: C.white, absolutePosition: { x: M + 60, y: 36 } });
      items.push({ text: 'N3PRENAD', fontSize: 8, bold: true, characterSpacing: 1.6, color: C.onDarkFaint, absolutePosition: { x: M + 61, y: 56 } });
      items.push(rightText(kindLabel, 32, { fontSize: 8, bold: true, characterSpacing: 1.8, color: C.gold }));
      items.push(rightText(invoiceNo, 44, { font: DISPLAY, bold: true, fontSize: 24, color: C.white }));
      items.push(rightText('Förfaller', 80, { fontSize: 7.5, color: C.onDarkMuted }));
      items.push(rightText(fmtDateLong(dueDate), 91, { font: DISPLAY, bold: true, fontSize: 13, color: C.gold }));
    } else {
      items.push({ text: 'SmartKlimat N3prenad', font: DISPLAY, bold: true, fontSize: 10.5, color: C.white, absolutePosition: { x: M, y: 11 } });
      items.push(rightText(`${kindName} ${invoiceNo}`, 12, { fontSize: 8.5, color: C.onDarkMuted }));
    }
    return items;
  };

  const footer = (page: number, pages: number) => ({
    columns: [
      { stack: [
        { text: `${COMPANY.name} · Org.nr ${COMPANY.orgNr} · Momsreg.nr ${COMPANY.vatNr} · Godkänd för F-skatt · ${COMPANY.address}`, fontSize: 7, color: C.muted },
        { text: `${COMPANY.email} · ${COMPANY.phone} · ${COMPANY.web} · Bankgiro ${COMPANY.bankgiro}`, fontSize: 7, color: C.muted, margin: [0, 2, 0, 0] },
      ], width: '*' },
      { text: `Sida ${page} av ${pages}`, fontSize: 7, color: C.muted, alignment: 'right', width: 70 },
    ],
    margin: [M, 22, M, 0],
  });

  // Metarad under bandet
  const metaItems: [string, string][] = [
    ['Fakturadatum', fmtDateIso(invoiceDate)],
    ['Förfallodatum', fmtDateIso(dueDate)],
    ['Betalningsvillkor', `${PAYMENT_DAYS} dagar netto`],
    ['Avser avtal', nfc(offer.offer_number) || nfc(uppdrag.uppdrag_number) || '—'],
  ];
  const metaRow = {
    columns: metaItems.map(([k, v]) => ({ width: '*', stack: [label(k), { text: v, fontSize: 9.5, bold: true, color: C.text, margin: [0, 2, 0, 0] }] })),
    columnGap: 12,
    margin: [0, 0, 0, 12],
  };

  // Adressblock
  const toStack: any[] = [
    label('Fakturamottagare', { color: C.goldInk }),
    { text: nfc(uppdrag.customer_name) || '—', fontSize: 10.5, bold: true, color: C.text, margin: [0, 4, 0, 1] },
    ...(uppdrag.customer_address ? [{ text: nfc(uppdrag.customer_address), fontSize: 9, color: C.text }] : []),
    ...(isPrivate && uppdrag.customer_personnummer && kind === 'slut' ? [{ text: `Personnr ${nfc(uppdrag.customer_personnummer)}`, fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 0] }] : []),
    ...(uppdrag.customer_email ? [{ text: nfc(uppdrag.customer_email), fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 0] }] : []),
  ];
  const fromStack: any[] = [
    label('Avsändare', { color: C.goldInk }),
    { text: COMPANY.name, fontSize: 10.5, bold: true, color: C.text, margin: [0, 4, 0, 1] },
    { text: COMPANY.address, fontSize: 9, color: C.text },
    { text: `Org.nr ${COMPANY.orgNr} · Momsreg.nr ${COMPANY.vatNr}`, fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 0] },
    { text: `${COMPANY.email} · ${COMPANY.phone}`, fontSize: 8.5, color: C.muted, margin: [0, 2, 0, 0] },
  ];
  const addressBlock = { columns: [{ width: '*', stack: toStack }, { width: '*', stack: fromStack }], columnGap: 18, margin: [0, 0, 0, 12] };

  // Betalningsruta (guld)
  const payBox = (amount: number) => ({
    table: { widths: ['*'], body: [[{
      stack: [
        { text: 'Så betalar du', bold: true, fontSize: 10.5, color: C.ink, margin: [0, 0, 0, 6] },
        { columns: [
          ['Bankgiro', COMPANY.bankgiro], ['Belopp', fmtKr(amount)], ['Senast', fmtDateIso(dueDate)], ['Meddelande', `Faktura ${invoiceNo}`],
        ].map(([k, v]) => ({ width: '*', stack: [label(k, { color: C.goldInk }), { text: v, fontSize: 10, bold: true, color: C.text, margin: [0, 2, 0, 0] }] })), columnGap: 10 },
        { text: `Ange fakturanumret som meddelande vid betalningen så att vi kan matcha inbetalningen. Frågor om fakturan besvaras på ${COMPANY.email} eller ${COMPANY.phone}.`, fontSize: 8.4, lineHeight: 1.35, color: C.text, margin: [0, 8, 0, 0] },
      ],
    }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => C.gold, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.goldSoft },
    margin: [0, 0, 0, 12],
  });

  const smallPrint = (lines: string[]) => ({
    stack: lines.map((t) => ({ text: t, fontSize: 7.6, lineHeight: 1.3, color: C.muted, margin: [0, 0, 0, 1] })),
    margin: [0, 0, 0, 0],
  });

  const amountRow = (l: string, v: string, o: { bold?: boolean; color?: string; size?: number; sub?: string } = {}) => ({
    columns: [
      { width: '*', stack: [
        { text: l, fontSize: o.size || 9, color: o.color || C.text, bold: !!o.bold },
        ...(o.sub ? [{ text: o.sub, fontSize: 7.6, color: C.muted, margin: [0, 1, 0, 0] }] : []),
      ] },
      { text: v, fontSize: o.size || 9, color: o.color || C.text, bold: !!o.bold, alignment: 'right', width: 90 },
    ],
    margin: [0, 2.5, 0, 2.5],
  });
  const totalBox = (labelText: string, amount: number) => ({
    table: { widths: ['*'], body: [[{
      stack: [
        { text: labelText, color: C.onDarkMuted, fontSize: 8 },
        { text: fmtKr(amount), font: DISPLAY, bold: true, color: C.gold, fontSize: 18, margin: [0, 2, 0, 0] },
      ],
      margin: [12, 9, 12, 9],
    }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0, fillColor: () => C.ink },
    margin: [0, 5, 0, 6],
  });
  const thinLine = (w: number) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 0.6, lineColor: C.borderStrong }], margin: [0, 3, 0, 3] });

  const docShell = (content: any[], title: string): TDocumentDefinitions => ({
    pageSize: 'A4',
    pageMargins: [M, TOP, M, 64],
    background,
    footer,
    content,
    defaultStyle: { font: SANS, fontSize: 9.5, color: C.text },
    info: { title, author: COMPANY.name },
  });

  return { SANS, DISPLAY, invoiceDate, dueDate, invoiceNo, kindName, isPrivate, reverseVat, label, sectionHead, metaRow, addressBlock, payBox, smallPrint, amountRow, totalBox, thinLine, docShell };
}

/** Numrerad cirkel (eller fylld om aktiv). Används i betalplanen. */
function stepBadge(n: number, state: 'done' | 'active' | 'todo', r: number, cellW: number) {
  const fill = state === 'todo' ? C.goldSoft : C.ink;
  const textColor = state === 'todo' ? C.goldInk : C.white;
  return {
    stack: [
      { canvas: [{ type: 'ellipse', x: cellW / 2, y: r, r1: r, r2: r, color: fill }] },
      { text: String(n), fontSize: r * 0.95, bold: true, color: textColor, alignment: 'center', relativePosition: { x: 0, y: -(r + r * 0.6) } },
    ],
  };
}

export function buildHandpenningDocDef(uppdrag: UppdragForInvoice, offer: OfferForInvoice, opts: InvoiceOpts, assets: PdfAssets): TDocumentDefinitions {
  const S = buildShared('handpenning', uppdrag, offer, opts, assets);
  const hp = Number(uppdrag.handpenning_amount || 0);
  const exVat = S.reverseVat ? hp : Math.round(hp / 1.25);
  const vat = hp - exVat;
  const revIncl = Number(uppdrag.revenue_incl_vat || 0);
  const rot = Number(uppdrag.rot_amount || 0);
  const remaining = Number(uppdrag.slutfaktura_amount ?? (revIncl - hp - rot));
  const hpPercent = Number(offer.handpenning_percent ?? 25);
  const title = cleanTitle(uppdrag.title) || 'uppdraget';
  const offerNo = nfc(offer.offer_number) || nfc(uppdrag.uppdrag_number) || '—';

  const content: any[] = [];
  content.push({ text: '', margin: [0, BAND_H - TOP + 18, 0, 0] });
  content.push(S.metaRow);
  content.push(S.addressBlock);

  // Paper-kort: vad fakturan avser (vänster) + belopp (höger)
  const leftStack: any[] = [
    S.label('Avser', { color: C.goldInk }),
    { text: title, fontSize: 10, bold: true, lineHeight: 1.25, color: C.text, margin: [0, 4, 0, 0] },
    { text: [nfc(uppdrag.customer_address)].filter(Boolean).join(' · '), fontSize: 8.8, color: C.muted, margin: [0, 3, 0, 8] },
    { text: `Handpenning ${hpPercent} % av ordersumman enligt avtal ${offerNo}.`, fontSize: 9.5, lineHeight: 1.35, color: C.text },
    { text: S.reverseVat
        ? `Ordersumma ${fmtKr(revIncl)} exkl. moms (omvänd betalningsskyldighet för byggtjänster).`
        : `Ordersumma ${fmtKr(revIncl)} inkl. moms${rot > 0 ? `, varav preliminärt ROT-avdrag ${fmtKr(rot)} dras på slutfakturan` : ''}.`,
      fontSize: 9.5, lineHeight: 1.35, color: C.text, margin: [0, 4, 0, 0] },
    { text: 'Handpenningen avräknas i sin helhet på slutfakturan efter utfört arbete.', fontSize: 7.6, color: C.muted, italics: true, margin: [0, 10, 0, 0] },
  ];
  const rightStack: any[] = [
    S.label('Belopp', { color: C.goldInk }),
    S.totalBox('Att betala', hp),
    ...(S.reverseVat
      ? [S.amountRow('Handpenning exkl. moms', fmtKr(exVat), { color: C.muted, size: 8.5 }), S.amountRow('Moms', 'Omvänd', { color: C.muted, size: 8.5 })]
      : [S.amountRow('Handpenning exkl. moms', fmtKr(exVat), { color: C.muted, size: 8.5 }), S.amountRow('Moms 25 %', fmtKr(vat), { color: C.muted, size: 8.5 })]),
    S.thinLine(187),
    S.amountRow('Att betala', fmtKr(hp), { bold: true }),
    S.amountRow('Återstår efter denna faktura', fmtKr(remaining), { size: 8.5, color: C.muted, sub: 'Faktureras som slutfaktura efter utfört arbete' + (rot > 0 ? ' · ROT dras där' : '') }),
  ];
  content.push({
    table: { widths: ['*', 215], body: [[{ stack: leftStack }, { stack: rightStack }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.paper },
    margin: [0, 0, 0, 14],
  });

  content.push(S.payBox(hp));

  // Betalplan – tre steg
  const steps: { t: string; sub: string; state: 'done' | 'active' | 'todo' }[] = [
    { t: 'Handpenning', sub: `${fmtKr(hp)} · denna faktura`, state: 'active' },
    { t: 'Arbetet utförs', sub: 'Enligt överenskommen plan', state: 'todo' },
    { t: 'Slutfaktura', sub: `${fmtKr(remaining)}${rot > 0 ? ' · efter prel. ROT' : ''}`, state: 'todo' },
  ];
  const n = steps.length; const colW = CONTENT_W / n; const r = 8;
  content.push({ ...S.sectionHead('Betalplan'), margin: [0, 4, 0, 10] });
  content.push({
    stack: [
      { canvas: [
        { type: 'line', x1: colW / 2, y1: r, x2: CONTENT_W - colW / 2, y2: r, lineWidth: 1, lineColor: C.borderStrong },
      ] },
      { columns: steps.map((s, i) => ({ width: colW, stack: [stepBadge(i + 1, s.state, r, colW)] })), relativePosition: { x: 0, y: -(r * 2) } },
      { columns: steps.map((s) => ({ width: colW, stack: [
        { text: s.t, fontSize: 8.5, bold: true, color: s.state === 'active' ? C.ink : C.muted, alignment: 'center' },
        { text: s.sub, fontSize: 7.6, color: C.muted, alignment: 'center', margin: [0, 1, 0, 0] },
      ] })), margin: [0, 6, 0, 0] },
    ],
    margin: [0, 0, 0, 16],
  });

  content.push(S.smallPrint([
    S.reverseVat
      ? 'Omvänd betalningsskyldighet för byggtjänster enligt 1 kap. 2 § första stycket 4 b mervärdesskattelagen – köparen redovisar momsen.'
      : 'Momsen på handpenningen redovisas på denna faktura och avräknas på slutfakturan.',
    `${COMPANY.name} är godkänd för F-skatt. Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen (referensränta + 8 %) samt lagstadgad påminnelseavgift.`,
    'Fullständig omfattning och villkor finns i det signerade avtalet.',
  ]));

  return S.docShell(content, `${S.kindName} ${S.invoiceNo} – ${COMPANY.name}`);
}

export function buildSlutfakturaDocDef(uppdrag: UppdragForInvoice, offer: OfferForInvoice, opts: InvoiceOpts, assets: PdfAssets): TDocumentDefinitions {
  const S = buildShared('slut', uppdrag, offer, opts, assets);
  const revEx = Number(uppdrag.revenue_ex_vat || 0);
  const revIncl = Number(uppdrag.revenue_incl_vat || 0);
  const vat = S.reverseVat ? 0 : revIncl - revEx;
  const hp = Number(uppdrag.handpenning_amount || 0);
  const rot = S.reverseVat ? 0 : Number(uppdrag.rot_amount || 0);
  const toPay = Number(uppdrag.slutfaktura_amount ?? (revIncl - hp - rot));
  const title = cleanTitle(uppdrag.title) || 'uppdraget';
  const offerNo = nfc(offer.offer_number) || nfc(uppdrag.uppdrag_number) || '—';
  const items = offer.line_items || [];
  const rotBase = Number(offer.rot_base || 0);
  const rotPercent = Number(offer.rot_percent ?? 30);

  const content: any[] = [];
  content.push({ text: '', margin: [0, BAND_H - TOP + 18, 0, 0] });
  content.push(S.metaRow);
  content.push(S.addressBlock);

  // Specifikation
  content.push({ ...S.sectionHead('Specifikation'), margin: [0, 0, 0, 8] });
  content.push({ text: title, fontSize: 10, bold: true, color: C.text, margin: [0, 0, 0, 2] });
  content.push({ text: [nfc(uppdrag.customer_address), `Avtal ${offerNo}`].filter(Boolean).join(' · '), fontSize: 8.6, color: C.muted, margin: [0, 0, 0, 8] });
  const th = (t: string, align: 'left' | 'right' = 'left') => ({ text: t.toUpperCase(), fontSize: 7, bold: true, characterSpacing: 0.8, color: C.goldInk, alignment: align, margin: [0, 2, 0, 2] });
  const td = (t: string, align: 'left' | 'right' = 'left', extra: any = {}) => ({ text: t, fontSize: 9.2, color: C.text, alignment: align, margin: [0, 3, 0, 3], ...extra });
  const body: any[][] = [[th('Benämning'), th('Antal', 'right'), { ...th('Enhet'), margin: [10, 2, 0, 2] }, th('À-pris', 'right'), th('Summa', 'right')]];
  for (const it of items) {
    const qty = Number(it.qty || 0);
    body.push([
      td(nfc(it.description) + (it.is_labor && rot > 0 ? '  (arbete, ROT)' : '')),
      td(qty ? qty.toLocaleString('sv-SE') : '', 'right', { color: C.muted }),
      td(nfc(it.unit), 'left', { color: C.muted, margin: [10, 3, 0, 3] }),
      td(qty ? fmtKr(it.unit_price) : '', 'right', { color: C.muted }),
      td(fmtKr(it.amount), 'right', { bold: true }),
    ]);
  }
  if (items.length === 0) body.push([td('Enligt avtal', 'left', { color: C.muted }), td(''), td(''), td(''), td(fmtKr(revEx), 'right', { bold: true })]);
  content.push({
    table: { headerRows: 1, widths: ['*', 40, 52, 72, 80], body },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : i === 1 ? 0.8 : 0.5),
      hLineColor: (i: number) => (i === 1 ? C.borderStrong : C.border),
      vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 3, paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 12],
  });

  // Summering (höger) + betalplan-sammanfattning (vänster) i paper-kort
  const leftStack: any[] = [
    S.label('Avräkning', { color: C.goldInk }),
    { text: `Handpenning ${fmtKr(hp)} är betald enligt faktura ${nfc(uppdrag.handpenning_invoice_no) || '—'} och avräknas nedan.`, fontSize: 9.5, lineHeight: 1.35, color: C.text, margin: [0, 4, 0, 0] },
    ...(rot > 0 ? [{ text: `Preliminärt ROT-avdrag ${fmtKr(rot)} dras direkt på fakturan. Vi ansöker om beloppet hos Skatteverket.`, fontSize: 9.5, lineHeight: 1.35, color: C.text, margin: [0, 4, 0, 0] }] : []),
    ...(rot > 0 ? [
      { text: 'UPPGIFTER FÖR ROT-AVDRAG', fontSize: 7, bold: true, characterSpacing: 0.9, color: C.goldInk, margin: [0, 10, 0, 3] },
      ...([
        ['Köpare', `${nfc(uppdrag.customer_name) || '—'}, ${nfc(uppdrag.customer_personnummer) || 'personnr saknas'}`],
        ['Fastighet', nfc(uppdrag.fastighetsbeteckning) || '—'],
        ['Arbetskostnad', `${fmtKr(rotBase)} inkl. moms`],
        ['Skattereduktion', `${rotPercent} % = ${fmtKr(rot)}`],
      ] as [string, string][]).map(([k, v]) => ({ columns: [{ width: 78, text: k, fontSize: 8.2, color: C.muted }, { width: '*', text: v, fontSize: 8.2, color: C.text }], margin: [0, 0, 0, 1.5] })),
      { text: 'Vi ansöker om utbetalningen hos Skatteverket. Avslås ansökan helt eller delvis faktureras motsvarande belopp.', fontSize: 7.4, lineHeight: 1.3, color: C.muted, margin: [0, 4, 0, 0] },
    ] : []),
    { text: 'Tack för att du valde oss. Vi hoppas att du är nöjd med arbetet.', fontSize: 7.6, color: C.muted, italics: true, margin: [0, 10, 0, 0] },
  ];
  const rightStack: any[] = [
    S.label('Belopp', { color: C.goldInk }),
    S.totalBox('Att betala', toPay),
    S.amountRow(S.reverseVat ? 'Summa exkl. moms' : 'Summa exkl. moms', fmtKr(revEx), { color: C.muted, size: 8.5 }),
    ...(S.reverseVat ? [S.amountRow('Moms', 'Omvänd', { color: C.muted, size: 8.5 })] : [S.amountRow('Moms 25 %', fmtKr(vat), { color: C.muted, size: 8.5 })]),
    S.amountRow(S.reverseVat ? 'Summa' : 'Summa inkl. moms', fmtKr(revIncl), { bold: true, size: 8.5 }),
    S.thinLine(187),
    S.amountRow(`Avgår handpenning (faktura ${nfc(uppdrag.handpenning_invoice_no) || '—'})`, '−' + fmtKr(hp), { size: 8.5 }),
    ...(rot > 0 ? [S.amountRow(`Avgår prel. ROT-avdrag`, '−' + fmtKr(rot), { size: 8.5, color: C.success, bold: true })] : []),
    S.thinLine(187),
    S.amountRow('Att betala', fmtKr(toPay), { bold: true }),
  ];
  content.push({
    table: { widths: ['*', 215], body: [[{ stack: leftStack }, { stack: rightStack }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.paper },
    margin: [0, 0, 0, 14],
  });

  content.push(S.payBox(toPay));

  content.push(S.smallPrint([
    S.reverseVat
      ? 'Omvänd betalningsskyldighet för byggtjänster enligt 1 kap. 2 § första stycket 4 b mervärdesskattelagen – köparen redovisar momsen.'
      : 'Momsen på handpenningen har redovisats på handpenningsfakturan.',
    `${COMPANY.name} är godkänd för F-skatt. Vid försenad betalning debiteras dröjsmålsränta enligt räntelagen (referensränta + 8 %) samt lagstadgad påminnelseavgift.`,
  ]));

  return S.docShell(content, `${S.kindName} ${S.invoiceNo} – ${COMPANY.name}`);
}

async function renderBlob(docDef: TDocumentDefinitions, pdfMake: any): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(docDef, undefined, pdfMake.fonts, pdfMake.vfs);
      const timer = setTimeout(() => reject(new Error('PDF-generering tog för lång tid (timeout)')), 20000);
      doc.getBlob((blob: Blob) => { clearTimeout(timer); resolve(blob); });
    } catch (e) { reject(e); }
  });
}

async function loadAssets(): Promise<PdfAssets> {
  const pdfMake = await getPdfMake();
  const [fonts, logoWhite] = await Promise.all([ensurePdfFonts(pdfMake), loadLogoDataUrl()]);
  return { logoWhite, ...fonts };
}

/** Bygger handpenningsfakturan i webbläsaren med samma pdfmake/fonter/logotyp som offerten. */
export async function buildHandpenningPdfBlob(uppdrag: UppdragForInvoice, offer: OfferForInvoice, opts: InvoiceOpts): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const assets = await loadAssets();
  return renderBlob(buildHandpenningDocDef(uppdrag, offer || {}, opts, assets), pdfMake);
}

/** Bygger slutfakturan i webbläsaren. */
export async function buildSlutfakturaPdfBlob(uppdrag: UppdragForInvoice, offer: OfferForInvoice, opts: InvoiceOpts): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const assets = await loadAssets();
  return renderBlob(buildSlutfakturaDocDef(uppdrag, offer || {}, opts, assets), pdfMake);
}
