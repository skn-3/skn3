import { calcOfferTotals, fmtKr, type OfferLineItem } from './offerCalc';
import { balanceTerms, deviceLabel, fmtDateLong, fmtDateTimeSv, parseDescription, parseTerms } from './offerText';

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

export function offerFileName(o: { offer_number?: string | null; customer_address?: string | null; title?: string | null }, kind: 'offert' | 'avtal'): string {
  const addr = (o.customer_address || o.title || '')
    .normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 50);
  const prefix = kind === 'avtal' ? 'Avtal' : 'Offert';
  return `${prefix}_${o.offer_number || 'utkast'}${addr ? '_' + addr : ''}.pdf`;
}

// ---------- Varumärke (samma tokens som src/index.css) ----------
const C = {
  ink: '#0B3D2E', inkDeep: '#082B21', gold: '#DCBE6E', goldInk: '#8A6A14', goldSoft: '#F6EDD0',
  sage: '#7A8A72', paper: '#F5F3EE', text: '#15211B', muted: '#5E6B64',
  border: '#E3E1DA', borderStrong: '#CFCCC2', white: '#FFFFFF', onDarkMuted: '#C9D6CE', onDarkFaint: '#9FB8AC',
  success: '#2E7D4F',
};
const PAGE_W = 595.28;
const M = 44;        // sidmarginal
const BAND_H = 124;  // brandband sida 1
const SLIM_H = 34;   // brandband övriga sidor
const TOP = 64;      // övre marginal (rymmer slim-bandet)

// ---------- Fonter: Figtree + Bricolage Grotesque laddas in i pdfmake (Roboto som reserv) ----------
// Filerna hämtas i första hand från /fonts (public/fonts), annars från jsDelivr (samma CDN som pdfmake själv).
const FONT_FILES: Record<string, string[]> = {
  'Figtree-Regular.ttf': ['/fonts/Figtree-Regular.ttf', 'https://cdn.jsdelivr.net/gh/erikdkennedy/figtree@master/fonts/ttf/Figtree-Regular.ttf'],
  'Figtree-Bold.ttf': ['/fonts/Figtree-Bold.ttf', 'https://cdn.jsdelivr.net/gh/erikdkennedy/figtree@master/fonts/ttf/Figtree-Bold.ttf'],
  'Figtree-Italic.ttf': ['/fonts/Figtree-Italic.ttf', 'https://cdn.jsdelivr.net/gh/erikdkennedy/figtree@master/fonts/ttf/Figtree-Italic.ttf'],
  'BricolageGrotesque-Bold.ttf': ['/fonts/BricolageGrotesque-Bold.ttf', 'https://cdn.jsdelivr.net/gh/ateliertriay/bricolage@main/fonts/ttf/BricolageGrotesque-Bold.ttf'],
};
const ROBOTO = { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' };

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

async function fetchFont(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) continue; // SPA-fallback i stället för fontfil
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 10000) continue;
      return bufToBase64(buf);
    } catch { /* prova nästa */ }
  }
  return null;
}

let fontsPromise: Promise<{ sans: string; display: string }> | null = null;
/** Registrerar varumärkesfonterna i pdfmake. Returnerar vilka familjer som faktiskt finns. */
export function ensurePdfFonts(pdfMake: any): Promise<{ sans: string; display: string }> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    pdfMake.vfs = pdfMake.vfs || {};
    const loaded: Record<string, boolean> = {};
    await Promise.all(Object.entries(FONT_FILES).map(async ([file, urls]) => {
      if (pdfMake.vfs[file]) { loaded[file] = true; return; }
      const b64 = await fetchFont(urls);
      if (b64) { pdfMake.vfs[file] = b64; loaded[file] = true; }
    }));
    const sansOk = loaded['Figtree-Regular.ttf'] && loaded['Figtree-Bold.ttf'];
    const displayOk = loaded['BricolageGrotesque-Bold.ttf'];
    const fonts: Record<string, any> = { Roboto: ROBOTO, ...(pdfMake.fonts || {}) };
    if (sansOk) {
      const italic = loaded['Figtree-Italic.ttf'] ? 'Figtree-Italic.ttf' : 'Figtree-Regular.ttf';
      fonts.Figtree = { normal: 'Figtree-Regular.ttf', bold: 'Figtree-Bold.ttf', italics: italic, bolditalics: 'Figtree-Bold.ttf' };
    }
    if (displayOk) {
      fonts.Bricolage = { normal: 'BricolageGrotesque-Bold.ttf', bold: 'BricolageGrotesque-Bold.ttf', italics: 'BricolageGrotesque-Bold.ttf', bolditalics: 'BricolageGrotesque-Bold.ttf' };
    }
    pdfMake.fonts = fonts;
    if (!sansOk || !displayOk) console.warn('offerPdf: varumärkesfont saknas, använder Roboto', { sansOk, displayOk });
    return { sans: sansOk ? 'Figtree' : 'Roboto', display: displayOk ? 'Bricolage' : 'Roboto' };
  })();
  return fontsPromise;
}

// ---------- Logotyp: vit stämpel, nedskalad i webbläsaren till 240 px (liten PDF) ----------
let logoCache: string | null = null;
export async function loadLogoDataUrl(): Promise<string | null> {
  if (logoCache) return logoCache;
  try {
    const img = new Image();
    img.src = '/brand/logo-stamp-vit-n3.png';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('logo')); });
    const size = 240;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    logoCache = canvas.toDataURL('image/png');
    return logoCache;
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
  id?: string | null;
  offer_number?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
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
  rot_persons?: number | null;
  rot_cap_per_person?: number | null;
  rot_used?: number | null;
  handpenning_percent?: number;
  terms_text?: string | null;
  created_by?: string | null;
}

export interface OfferPdfOptions {
  signature?: { name: string; acceptedAt: string; userAgent?: string; imageDataUrl?: string };
}

interface PdfAssets { logoWhite?: string | null; sans: string; display: string }

const COMPANY_PHONE = '070-719 72 35';

export function buildOfferDocDef(offer: OfferForPdf, opts: OfferPdfOptions = {}, assets: PdfAssets): TDocumentDefinitions {
  const SANS = assets.sans; const DISPLAY = assets.display;
  const hpPercent = Number(offer.handpenning_percent ?? 25);
  const totals = calcOfferTotals(offer.line_items || [], {
    vat_mode: offer.vat_mode, rot_enabled: offer.rot_enabled, rot_percent: offer.rot_percent, handpenning_percent: hpPercent,
    rot_persons: offer.rot_persons, rot_cap_per_person: offer.rot_cap_per_person, rot_used: offer.rot_used,
  });
  const rotPersons = Math.max(1, Math.floor(Number(offer.rot_persons ?? 1) || 1));
  const rotActive = !!offer.rot_enabled && offer.vat_mode === 'vanlig';
  const inclVat = offer.vat_mode === 'vanlig';
  const priceFactor = inclVat ? 1.25 : 1;
  const payLabel = rotActive ? 'Att betala efter ROT-avdrag' : inclVat ? 'Att betala inkl. moms' : 'Att betala, omvänd byggmoms';
  const payAmount = rotActive ? totals.total_after_rot : totals.total_incl_vat;
  const isSigned = !!opts.signature;
  const docWord = isSigned ? 'AVTAL' : 'OFFERT';
  const docName = docWord.charAt(0) + docWord.slice(1).toLowerCase();
  const sellerName = nfc(offer.created_by);

  const label = (t: string, extra: any = {}) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, characterSpacing: 0.9, color: C.muted, ...extra });
  const sectionHead = (t: string) => ({
    stack: [
      label(t, { color: C.goldInk }),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_W - 2 * M, y2: 0, lineWidth: 0.6, lineColor: C.border }], margin: [0, 4, 0, 0] },
    ],
    margin: [0, 14, 0, 9],
  });
  const rightText = (t: string, y: number, extra: any = {}) => ({ columns: [{ width: PAGE_W - M, text: t, alignment: 'right', ...extra }], absolutePosition: { x: 0, y } });

  // ---------- Band (bakgrund) ----------
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
      items.push(rightText(docWord, 32, { fontSize: 8, bold: true, characterSpacing: 1.8, color: C.gold }));
      items.push(rightText(nfc(offer.offer_number) || 'Utkast', 44, { font: DISPLAY, bold: true, fontSize: 24, color: C.white }));
      items.push(rightText(rotActive ? 'Att betala efter prel. ROT-avdrag' : payLabel, 80, { fontSize: 7.5, color: C.onDarkMuted }));
      items.push(rightText(fmtKr(payAmount), 91, { font: DISPLAY, bold: true, fontSize: 15, color: C.gold }));
    } else {
      items.push({ text: 'SmartKlimat N3prenad', font: DISPLAY, bold: true, fontSize: 10.5, color: C.white, absolutePosition: { x: M, y: 11 } });
      items.push(rightText(`${docName} ${nfc(offer.offer_number) || ''}`.trim(), 12, { fontSize: 8.5, color: C.onDarkMuted }));
    }
    return items;
  };

  const footer = (page: number, pages: number) => ({
    columns: [
      { stack: [
        { text: 'SmartKlimat N3prenad AB · Org.nr 559026-6630 · Godkänd för F-skatt · Morsstigen 3, 141 71 Segeltorp', fontSize: 7, color: C.muted },
        { text: `n3prenad@smartklimat.org · ${COMPANY_PHONE} · www.n3prenad.se`, fontSize: 7, color: C.muted, margin: [0, 2, 0, 0] },
      ], width: '*' },
      { text: `Sida ${page} av ${pages}`, fontSize: 7, color: C.muted, alignment: 'right', width: 70 },
    ],
    margin: [M, 22, M, 0],
  });

  // ---------- Sida 1 ----------
  const content: any[] = [];
  content.push({ text: '', margin: [0, BAND_H - TOP + 22, 0, 0] }); // luft under det höga bandet
  content.push({ text: nfc(offer.title) || docName, font: DISPLAY, bold: true, fontSize: 16, lineHeight: 1.12, color: C.text, margin: [0, 0, 0, 10] });

  const meta: [string, string][] = [
    ['Datum', fmtDateLong(offer.created_at || new Date())],
    ['Giltig t.o.m.', offer.valid_until ? fmtDateLong(offer.valid_until) : '30 dagar'],
    ['Betalningsvillkor', nfc(offer.payment_terms) || '10 dagar netto'],
    ['Er kontakt', sellerName || 'SmartKlimat N3prenad'],
  ];
  content.push({
    columns: meta.map(([k, v]) => ({ width: '*', stack: [label(k), { text: v, fontSize: 9.5, bold: true, color: C.text, margin: [0, 2, 0, 0] }] })),
    columnGap: 12,
    margin: [0, 0, 0, 14],
  });

  // Parter
  const party = (head: string, lines: string[]) => ({
    stack: [label(head, { color: C.goldInk }), ...lines.filter(Boolean).map((l, i) => ({ text: l, fontSize: i === 0 ? 10 : 8.8, bold: i === 0, color: i === 0 ? C.text : C.muted, margin: [0, i === 0 ? 4 : 1.5, 0, 0] }))],
  });
  const custLines = [
    nfc(offer.customer_name) || '—',
    nfc(offer.customer_address),
    [nfc(offer.customer_email), nfc(offer.customer_phone)].filter(Boolean).join(' · '),
    offer.customer_type === 'privat' && offer.customer_personnummer ? `Personnr ${nfc(offer.customer_personnummer)}` : (offer.customer_type === 'foretag' ? 'Företag / BRF' : ''),
    offer.customer_type === 'privat' && offer.fastighetsbeteckning ? `Fastighet ${nfc(offer.fastighetsbeteckning)}` : '',
  ];
  const usLines = ['SmartKlimat N3prenad AB', 'Org.nr 559026-6630 · Godkänd för F-skatt', 'Morsstigen 3, 141 71 Segeltorp', `n3prenad@smartklimat.org · ${COMPANY_PHONE}`, 'Ansvarsförsäkrad · 3 års garanti på utfört arbete'];
  content.push({
    table: { widths: ['*', '*'], body: [[party('Kund', custLines), party('Leverantör', usLines)]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.paper },
    margin: [0, 0, 0, 4],
  });

  // Omfattning
  if (offer.description) {
    content.push(sectionHead('Omfattning'));
    for (const b of parseDescription(offer.description)) {
      if (b.type === 'heading') content.push({ text: b.text, bold: true, fontSize: 10, color: C.ink, margin: [0, 7, 0, 3] });
      else if (b.type === 'para') content.push({ text: b.text, fontSize: 9.5, lineHeight: 1.32, color: C.text, margin: [0, 0, 0, 5] });
      else content.push({
        table: { widths: [9, '*'], body: b.items.map((it) => [
          { text: '–', color: C.sage, fontSize: 9.5, lineHeight: 1.32 },
          { text: it, fontSize: 9.5, lineHeight: 1.32, color: C.text },
        ]) },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 2, paddingTop: () => 0.5, paddingBottom: () => 0.5 },
        margin: [2, 0, 0, 3],
      });
    }
  }

  // Pris
  const items = offer.line_items || [];
  const simple = items.every((it) => Number(it.qty || 1) === 1);
  const sumHead = inclVat ? 'Summa inkl. moms' : 'Summa exkl. moms';
  const th = (t: string, right?: boolean) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, characterSpacing: 0.8, color: C.muted, alignment: right ? 'right' : 'left', margin: [0, 0, 0, 2] });
  const descCell = (it: OfferLineItem) => rotActive && it.is_labor
    ? { stack: [{ text: nfc(it.description), fontSize: 9.5, color: C.text }, { text: 'ROT-berättigat arbete', fontSize: 7.2, color: C.sage, bold: true, margin: [0, 2, 0, 0] }] }
    : { text: nfc(it.description), fontSize: 9.5, color: C.text };
  const amountCell = (it: OfferLineItem) => ({ text: fmtKr(Number(it.amount || 0) * priceFactor), fontSize: 9.5, color: C.text, alignment: 'right' });
  const body = simple
    ? [[th('Benämning'), th(sumHead, true)], ...items.map((it) => [descCell(it), amountCell(it)])]
    : [[th('Benämning'), th('Antal', true), th('À-pris', true), th(sumHead, true)], ...items.map((it) => [
      descCell(it),
      { text: `${Number(it.qty || 0).toLocaleString('sv-SE')} ${nfc(it.unit)}`.trim(), fontSize: 9.5, alignment: 'right', color: C.text },
      { text: fmtKr(Number(it.unit_price || 0) * priceFactor), fontSize: 9.5, alignment: 'right', color: C.text },
      amountCell(it),
    ])];
  const specTable = {
    table: { headerRows: 1, widths: simple ? ['*', 110] : ['*', 60, 80, 100], body },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 1 ? 1 : i === 0 || i === node.table.body.length ? 0 : 0.5),
      hLineColor: (i: number) => (i === 1 ? C.ink : C.border),
      vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 7, paddingBottom: () => 7,
    },
    margin: [0, 0, 0, 10],
  };
  content.push({ unbreakable: true, stack: [sectionHead('Pris'), specTable] });

  const row = (l: string, v: string, o: { size?: number; color?: string; bold?: boolean } = {}) => ({
    columns: [
      { text: l, fontSize: o.size || 9.5, color: o.color || C.text, bold: !!o.bold, width: '*' },
      { text: v, fontSize: o.size || 9.5, color: o.color || C.text, bold: !!o.bold, alignment: 'right', width: 110 },
    ],
    margin: [0, 2, 0, 2],
  });
  const sum: any[] = [];
  sum.push(row(inclVat ? 'Ordersumma inkl. moms' : 'Ordersumma exkl. moms', fmtKr(totals.total_incl_vat)));
  sum.push(row(inclVat ? 'varav moms 25 %' : 'Omvänd byggmoms – köparen redovisar momsen', inclVat ? fmtKr(totals.total_vat) : '', { color: C.muted, size: 8.5 }));
  if (rotActive) {
    sum.push(row('ROT-berättigad arbetskostnad', fmtKr(totals.rot_base), { color: C.muted, size: 8.5 }));
    sum.push(row(`Preliminärt ROT-avdrag ${offer.rot_percent} %${totals.rot_capped ? ' (begränsat)' : ''}`, '−' + fmtKr(totals.rot_amount), { color: C.success, bold: true }));
  }
  const totalBox = {
    table: { widths: ['*', 130], body: [[
      { text: payLabel, color: C.white, fontSize: 10.5, bold: true, margin: [12, 10, 0, 10] },
      { text: fmtKr(payAmount), font: DISPLAY, bold: true, color: C.gold, fontSize: 16, alignment: 'right', margin: [0, 7, 12, 7] },
    ]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0, fillColor: () => C.ink },
    margin: [0, 6, 0, 8],
  };
  const plan: any[] = [];
  if (hpPercent > 0) {
    const step = (n: number, title: string, sub: string, amount: string) => ({
      columns: [
        { width: 16, stack: [{ canvas: [{ type: 'ellipse', x: 7, y: 7, r1: 7, r2: 7, color: C.goldSoft }], margin: [0, 1, 0, 0] }, { text: String(n), fontSize: 7.5, bold: true, color: C.goldInk, relativePosition: { x: 4.7, y: -11.5 } }] },
        { width: '*', stack: [{ text: title, fontSize: 9.5, bold: true, color: C.text }, { text: sub, fontSize: 8, color: C.muted, margin: [0, 1, 0, 0] }], margin: [6, 0, 0, 0] },
        { width: 110, text: amount, fontSize: 9.5, bold: true, alignment: 'right', color: C.text },
      ],
      margin: [0, 3, 0, 3],
    });
    plan.push(step(1, `Handpenning ${hpPercent} %`, 'Vid beställning' + (rotActive ? ' · på summan före ROT' : ''), fmtKr(totals.handpenning)));
    plan.push(step(2, 'Slutfaktura', 'Efter utfört arbete' + (rotActive ? ' · ROT dras här' : ''), fmtKr(totals.slutfaktura)));
  }
  content.push({
    unbreakable: true,
    stack: [
      { columns: [{ width: '*', text: '' }, { width: 320, stack: [...sum, totalBox, ...plan] }] },
      ...(rotActive ? [{ text: (totals.rot_capped
        ? `ROT-avdraget är begränsat till ${fmtKr(totals.rot_room)} (${rotPersons} ${rotPersons === 1 ? 'person' : 'personer'} × ${fmtKr(Number(offer.rot_cap_per_person ?? 50000))} per år${Number(offer.rot_used || 0) > 0 ? `, minus ${fmtKr(offer.rot_used)} redan utnyttjat` : ''}). ${offer.rot_percent} % av arbetskostnaden hade varit ${fmtKr(totals.rot_uncapped)}. `
        : '') + 'ROT-avdraget är preliminärt och förutsätter att du har avdragsutrymme hos Skatteverket. Endast arbetskostnad är ROT-berättigad.', fontSize: 7.8, color: C.muted, lineHeight: 1.3, margin: [0, 8, 0, 0] }] : []),
    ],
  });

  // Nästa steg
  const validTxt = offer.valid_until ? `Offerten gäller till och med ${fmtDateLong(offer.valid_until)}.` : 'Offerten gäller i 30 dagar.';
  content.push({
    unbreakable: true,
    table: { widths: ['*'], body: [[{
      stack: [
        { text: isSigned ? 'Avtalet är signerat' : 'Så accepterar du offerten', bold: true, fontSize: 10, color: C.ink },
        { text: isSigned
          ? `Offerten accepterades digitalt ${fmtDateTimeSv(opts.signature?.acceptedAt)} av ${nfc(opts.signature?.name)}. Signeringsverifikat finns på sista sidan. Vi hör av oss inom kort för att boka in nästa steg.`
          : `Öppna länken i mejlet och signera digitalt – det tar en minut. Du får en bekräftelse och det signerade avtalet på e-post direkt efteråt. ${validTxt} Frågor? Ring ${sellerName || 'oss'} på ${COMPANY_PHONE}.`,
          fontSize: 9, lineHeight: 1.35, color: C.text, margin: [0, 4, 0, 0] },
      ],
    }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => C.gold, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.paper },
    margin: [0, 16, 0, 0],
  });

  // ---------- Villkor (två spalter) ----------
  if (offer.terms_text) {
    const [left, right] = balanceTerms(parseTerms(offer.terms_text));
    const render = (b: { heading?: string; lead?: string; body: string }) => {
      const stack: any[] = [];
      if (b.heading) stack.push({ text: b.heading, bold: true, fontSize: 8, color: C.ink, margin: [0, 0, 0, 1] });
      if (b.lead) stack.push({ text: [{ text: b.lead + ' ', bold: true, color: C.ink }, { text: b.body }], fontSize: 7.2, lineHeight: 1.22, color: C.muted });
      else stack.push({ text: b.body, fontSize: 7.2, lineHeight: 1.22, color: C.muted });
      return { stack, margin: [0, 0, 0, 4.5], unbreakable: true };
    };
    content.push({ text: 'Allmänna villkor', font: DISPLAY, bold: true, fontSize: 15, color: C.text, pageBreak: 'before', margin: [0, 6, 0, 2] });
    content.push({ text: 'SmartKlimat N3prenad AB · gäller för avtal om bygg-, renoverings- och installationsarbeten', fontSize: 8.5, color: C.muted, margin: [0, 0, 0, 12] });
    content.push({ columns: [{ width: '*', stack: left.map(render) }, { width: '*', stack: right.map(render) }], columnGap: 16 });
  }

  // ---------- Signeringsverifikat ----------
  if (opts.signature) {
    const s = opts.signature;
    const kvLayout = { hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5), hLineColor: () => C.border, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 7, paddingBottom: () => 7 };
    const kv = (rows: [string, string][]) => ({
      table: { widths: [120, '*'], body: rows.map(([k, v]) => [{ text: k, fontSize: 8.5, bold: true, color: C.muted, margin: [0, 1, 0, 0] }, { text: v, fontSize: 9.5, color: C.text }]) },
      layout: kvLayout,
      margin: [0, 0, 0, 14],
    });
    content.push({ text: 'Signeringsverifikat', font: DISPLAY, bold: true, fontSize: 15, color: C.text, pageBreak: 'before', margin: [0, 6, 0, 2] });
    content.push({
      columns: [
        { width: 'auto', table: { body: [[{ text: 'ACCEPTERAD', fontSize: 7.5, bold: true, characterSpacing: 1, color: C.white, margin: [8, 3, 8, 3] }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.success, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } },
        { width: '*', text: 'Elektronisk accept via SmartKlimat N3prenads offertportal', fontSize: 8.5, color: C.muted, margin: [8, 3, 0, 0] },
      ],
      margin: [0, 0, 0, 16],
    });
    content.push(sectionHead('Dokument'));
    const docRows: [string, string][] = [
      ['Avtal', `${docName} ${nfc(offer.offer_number) || '—'}${offer.title ? ' – ' + nfc(offer.title) : ''}`],
    ];
    if (offer.id) docRows.push(['Dokument-ID', nfc(offer.id)]);
    docRows.push(
      ['Belopp', `${fmtKr(payAmount)} ${rotActive ? '(efter preliminärt ROT-avdrag)' : inclVat ? '(inkl. moms)' : '(exkl. moms)'}`],
      ['Kund', `${nfc(offer.customer_name) || '—'}${offer.customer_email ? ' · ' + nfc(offer.customer_email) : ''}`],
      ['Leverantör', 'SmartKlimat N3prenad AB · org.nr 559026-6630'],
    );
    content.push(kv(docRows));
    content.push(sectionHead('Händelser'));
    const ev = (t: string, txt: string) => [{ text: t, fontSize: 8.5, color: C.muted }, { text: txt, fontSize: 9.5, color: C.text }];
    const events = [
      ev(fmtDateTimeSv(offer.created_at), 'Offerten skapades'),
      ...(offer.sent_at ? [ev(fmtDateTimeSv(offer.sent_at), 'Offerten skickades till kundens e-post')] : []),
      ev(fmtDateTimeSv(s.acceptedAt), `Offerten accepterades och signerades av ${nfc(s.name)}`),
    ];
    content.push({ table: { widths: [120, '*'], body: events }, layout: kvLayout, margin: [0, 0, 0, 14] });
    content.push(sectionHead('Underskrift'));
    content.push({
      columns: [
        {
          width: 260,
          table: { widths: ['*'], body: [[{ stack: [
            s.imageDataUrl ? { image: s.imageDataUrl, width: 200, margin: [0, 2, 0, 4] } : { text: nfc(s.name), font: DISPLAY, bold: true, fontSize: 20, color: C.text, margin: [0, 6, 0, 8] },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 228, y2: 0, lineWidth: 0.6, lineColor: C.borderStrong }] },
            { text: nfc(s.name), fontSize: 9.5, bold: true, color: C.text, margin: [0, 6, 0, 0] },
            { text: `Signerad ${fmtDateTimeSv(s.acceptedAt)}`, fontSize: 8, color: C.muted, margin: [0, 2, 0, 0] },
          ] }]] },
          layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => C.border, vLineColor: () => C.border, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12 },
        },
        { width: '*', stack: [
          label('Enhet'), { text: deviceLabel(s.userAgent), fontSize: 9.5, color: C.text, margin: [0, 2, 0, 8] },
          label('Teknisk signatur'), { text: nfc(s.userAgent) || '—', fontSize: 7, color: C.muted, lineHeight: 1.3, margin: [0, 2, 0, 0] },
        ], margin: [16, 0, 0, 0] },
      ],
      margin: [0, 0, 0, 16],
    });
    content.push({ text: 'Tidpunkt, IP-adress och enhet registrerades vid accepttillfället och förvaras i SmartKlimat N3prenads system. Accept via offertportalen likställs med skriftlig överenskommelse enligt de allmänna villkoren (punkt 2). Verifikatet genererades automatiskt.', fontSize: 7.8, color: C.muted, lineHeight: 1.35 });
  }

  return {
    pageSize: 'A4',
    pageMargins: [M, TOP, M, 64],
    background,
    footer,
    content,
    defaultStyle: { font: SANS, fontSize: 9.5, color: C.text },
    info: { title: `${docName} ${nfc(offer.offer_number) || ''} – SmartKlimat N3prenad`.trim(), author: 'SmartKlimat N3prenad AB' },
  };
}

export async function buildOfferPdfBlob(offer: OfferForPdf, opts: OfferPdfOptions = {}): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const [fonts, logoWhite] = await Promise.all([ensurePdfFonts(pdfMake), loadLogoDataUrl()]);
  const docDef = buildOfferDocDef(offer, opts, { logoWhite, ...fonts });
  return new Promise<Blob>((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(docDef, undefined, pdfMake.fonts, pdfMake.vfs);
      const timer = setTimeout(() => reject(new Error('PDF-generering tog för lång tid (timeout)')), 20000);
      doc.getBlob((blob: Blob) => { clearTimeout(timer); resolve(blob); });
    } catch (e) { reject(e); }
  });
}
