// Orderbekräftelse + "Processen efter beställning" – PDF:en kunden får när en N3prenad-offert signeras
// (gäller bara våra egna offerter, inte Mockfjärds-ärenden). Samma varumärkessystem som offerten
// (offerPdf.ts): pdfmake, Figtree + Bricolage Grotesque, mörkgrönt band, paper-kort och guldaccenter.
import { calcOfferTotals, fmtKr } from './offerCalc';
import { fmtDateLong } from './offerText';
import { ensurePdfFonts, getPdfMake, loadLogoDataUrl, type OfferForPdf } from './offerPdf';

type TDocumentDefinitions = any;
const nfc = (s: any) => (s ?? '').toString().normalize('NFC');

// Samma tokens som offerPdf.ts / src/index.css
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
const COMPANY_PHONE = '070-719 72 35';
const COMPANY_EMAIL = 'n3prenad@smartklimat.org';
/** Koordinatorn som står som kundens kontakt på orderbekräftelsen (oberoende av vem som sålde). */
const CONTACT_NAME = 'Johannes Klum';

export interface OrderConfirmationSignature { name: string; acceptedAt: string }
interface PdfAssets { logoWhite?: string | null; sans: string; display: string }

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** Letar efter ett planerat utförande i beskrivning/villkor, t.ex. "Arbetet utförs preliminärt april 2027". */
export function plannedExecution(offer: Pick<OfferForPdf, 'description' | 'payment_terms'>): string | null {
  const text = `${nfc(offer.description)}\n${nfc(offer.payment_terms)}`;
  const re = new RegExp(`(?:utför|påbörja|start|planera)[a-zåäö]*[^.\\n]{0,40}?(?:(prelimin[äa]rt|cirka|ca\\.?|omkring)\\s+)?(${MONTHS.join('|')})\\s+(20\\d{2})`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const month = m[2].toLowerCase();
  return `${m[1] ? 'Preliminärt ' : ''}${month} ${m[3]}`;
}

/** "20 oktober 2026 kl. 20:42" */
export function fmtSignedAt(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  const hm = dt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return `${fmtDateLong(dt)} kl. ${hm}`;
}

export function firstName(name: string | null | undefined): string {
  const n = nfc(name).trim();
  return n.split(/\s+/)[0] || '';
}

/** "10 dagar netto" (standardvillkoret) → false, allt annat är egna villkor som visas ordagrant. */
export function hasCustomTerms(terms: string | null | undefined): boolean {
  const t = nfc(terms).trim();
  return !!t && !/^10\s*dagar\s*netto\.?$/i.test(t);
}

export function buildOrderConfirmationDocDef(offer: OfferForPdf, signature: OrderConfirmationSignature, assets: PdfAssets): TDocumentDefinitions {
  const SANS = assets.sans; const DISPLAY = assets.display;
  const hpPercent = Number(offer.handpenning_percent ?? 25);
  const totals = calcOfferTotals(offer.line_items || [], {
    vat_mode: offer.vat_mode, rot_enabled: offer.rot_enabled, rot_percent: offer.rot_percent, handpenning_percent: hpPercent,
    rot_persons: offer.rot_persons, rot_cap_per_person: offer.rot_cap_per_person, rot_used: offer.rot_used,
  });
  const inclVat = offer.vat_mode === 'vanlig';
  const rotActive = !!offer.rot_enabled && inclVat;
  const payAmount = rotActive ? totals.total_after_rot : totals.total_incl_vat;
  const payLabel = rotActive ? 'Att betala efter prel. ROT-avdrag' : inclVat ? 'Att betala inkl. moms' : 'Att betala, omvänd byggmoms';
  const orderNo = nfc(offer.offer_number) || '—';
  const signedDate = fmtDateLong(signature.acceptedAt);
  const planned = plannedExecution(offer);
  const name = firstName(signature.name) || firstName(offer.customer_name);
  const title = nfc(offer.title).replace(/^offert\s*[–-]\s*/i, '');
  const customTerms = hasCustomTerms(offer.payment_terms);
  const hasHp = hpPercent > 0 && totals.handpenning > 0;

  const label = (t: string, extra: any = {}) => ({ text: t.toUpperCase(), fontSize: 7, bold: true, characterSpacing: 0.9, color: C.muted, ...extra });
  const rightText = (t: string, y: number, extra: any = {}) => ({ columns: [{ width: PAGE_W - M, text: t, alignment: 'right', ...extra }], absolutePosition: { x: 0, y } });
  const sectionHead = (t: string) => ({
    stack: [
      label(t, { color: C.goldInk }),
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.6, lineColor: C.border }], margin: [0, 4, 0, 0] },
    ],
    margin: [0, 14, 0, 9],
  });
  // Bock ritad som linje (fonten saknar ✓-tecknet)
  const check = (cx: number, cy: number, s: number, color: string) => ({
    type: 'polyline', lineWidth: s * 0.19, lineColor: color, closePath: false,
    points: [{ x: cx - s * 0.42, y: cy + s * 0.02 }, { x: cx - s * 0.12, y: cy + s * 0.32 }, { x: cx + s * 0.44, y: cy - s * 0.3 }],
  });
  /** Numrerad cirkel (eller bock om klart). Ritas som canvas + text ovanpå. */
  const badge = (n: number, done: boolean, r: number, cellW: number) => ({
    stack: [
      { canvas: [
        { type: 'ellipse', x: cellW / 2, y: r, r1: r, r2: r, color: done ? C.ink : C.goldSoft },
        ...(done ? [check(cellW / 2, r, r * 1.5, C.white)] : []),
      ] },
      ...(done ? [] : [{ text: String(n), fontSize: r * 0.95, bold: true, color: C.goldInk, alignment: 'center', relativePosition: { x: 0, y: -(r + r * 0.6) } }]),
    ],
  });

  // ---------- Band ----------
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
      items.push(rightText('ORDERBEKRÄFTELSE', 32, { fontSize: 8, bold: true, characterSpacing: 1.8, color: C.gold }));
      items.push(rightText(orderNo, 44, { font: DISPLAY, bold: true, fontSize: 24, color: C.white }));
      items.push(rightText('Avtal signerat', 80, { fontSize: 7.5, color: C.onDarkMuted }));
      items.push(rightText(signedDate, 91, { font: DISPLAY, bold: true, fontSize: 13, color: C.gold }));
    } else {
      items.push({ text: 'SmartKlimat N3prenad', font: DISPLAY, bold: true, fontSize: 10.5, color: C.white, absolutePosition: { x: M, y: 11 } });
      items.push(rightText(`Orderbekräftelse ${orderNo}`, 12, { fontSize: 8.5, color: C.onDarkMuted }));
    }
    return items;
  };

  const footer = (page: number, pages: number) => ({
    columns: [
      { stack: [
        { text: 'SmartKlimat N3prenad AB · Org.nr 559026-6630 · Godkänd för F-skatt · Morsstigen 3, 141 71 Segeltorp', fontSize: 7, color: C.muted },
        { text: `${COMPANY_EMAIL} · ${COMPANY_PHONE} · www.n3prenad.se`, fontSize: 7, color: C.muted, margin: [0, 2, 0, 0] },
      ], width: '*' },
      { text: `Sida ${page} av ${pages}`, fontSize: 7, color: C.muted, alignment: 'right', width: 70 },
    ],
    margin: [M, 22, M, 0],
  });

  // ---------- Sida 1: Tack för din order ----------
  const content: any[] = [];
  content.push({ text: '', margin: [0, BAND_H - TOP + 22, 0, 0] });
  content.push({ text: name ? `Tack för din order, ${name}!` : 'Tack för din order!', font: DISPLAY, bold: true, fontSize: 22, lineHeight: 1.1, color: C.text, margin: [0, 0, 0, 8] });
  content.push({
    text: `Tack för förtroendet. Vi har tagit emot din signering av avtal ${orderNo} och din beställning är nu registrerad hos oss. Här är en sammanfattning av din order och en beskrivning av hur det går till fram till färdigt arbete.`,
    fontSize: 10, lineHeight: 1.42, color: C.text, margin: [0, 0, 0, 16],
  });

  const meta: [string, string][] = [
    ['Ordernummer', orderNo],
    ['Signerad', signedDate],
    ['Er kontakt', CONTACT_NAME],
    ['Planerat utförande', planned || 'Bokas tillsammans med dig'],
  ];
  content.push({
    columns: meta.map(([k, v]) => ({ width: '*', stack: [label(k), { text: v, fontSize: 9.5, bold: true, color: C.text, margin: [0, 2, 0, 0] }] })),
    columnGap: 12,
    margin: [0, 0, 0, 14],
  });

  // Beställningen: vad + var (vänster) · belopp och betalplan (höger)
  const items = (offer.line_items || []).map((it) => nfc(it.description).trim()).filter(Boolean);
  const shownItems = items.slice(0, 6);
  const leftStack: any[] = [
    label('Din beställning', { color: C.goldInk }),
    ...(title ? [{ text: title, fontSize: 10, bold: true, lineHeight: 1.25, color: C.text, margin: [0, 4, 0, 0] }] : []),
    { text: [nfc(offer.customer_name) || '—', nfc(offer.customer_address)].filter(Boolean).join(' · '), fontSize: 8.8, color: C.muted, margin: [0, title ? 3 : 4, 0, 8] },
    ...shownItems.map((t) => ({
      columns: [{ width: 9, text: '–', color: C.sage, fontSize: 9.5 }, { width: '*', text: t, fontSize: 9.5, lineHeight: 1.3, color: C.text }],
      margin: [0, 0, 0, 2],
    })),
    ...(items.length > shownItems.length ? [{ text: `+ ${items.length - shownItems.length} ytterligare poster, se avtalet`, fontSize: 8, color: C.muted, margin: [9, 2, 0, 0] }] : []),
    { text: 'Fullständig omfattning och villkor finns i det signerade avtalet.', fontSize: 7.6, color: C.muted, italics: true, margin: [0, 8, 0, 0] },
  ];

  const amountRow = (l: string, v: string, o: { bold?: boolean; color?: string; size?: number; sub?: string } = {}) => ({
    columns: [
      { width: '*', stack: [
        { text: l, fontSize: o.size || 9, color: o.color || C.text, bold: !!o.bold },
        ...(o.sub ? [{ text: o.sub, fontSize: 7.6, color: C.muted, margin: [0, 1, 0, 0] }] : []),
      ] },
      { text: v, fontSize: o.size || 9, color: o.color || C.text, bold: !!o.bold, alignment: 'right', width: 78 },
    ],
    margin: [0, 2.5, 0, 2.5],
  });
  const rotLabel = totals.rot_capped ? `Prel. ROT-avdrag (max ${fmtKr(totals.rot_room)})` : `Prel. ROT-avdrag ${offer.rot_percent} %`;
  const rightStack: any[] = [
    label('Belopp', { color: C.goldInk }),
    {
      table: { widths: ['*'], body: [[{
        stack: [
          { text: payLabel, color: C.onDarkMuted, fontSize: 8 },
          { text: fmtKr(payAmount), font: DISPLAY, bold: true, color: C.gold, fontSize: 18, margin: [0, 2, 0, 0] },
        ],
        margin: [12, 9, 12, 9],
      }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0, fillColor: () => C.ink },
      margin: [0, 5, 0, 6],
    },
    amountRow(inclVat ? 'Ordersumma inkl. moms' : 'Ordersumma exkl. moms', fmtKr(totals.total_incl_vat), { color: C.muted, size: 8.5 }),
    ...(rotActive ? [amountRow(rotLabel, '−' + fmtKr(totals.rot_amount), { color: C.success, bold: true, size: 8.5 })] : []),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 187, y2: 0, lineWidth: 0.6, lineColor: C.borderStrong }], margin: [0, 3, 0, 3] },
    ...(hasHp ? [
      amountRow(`Handpenning ${hpPercent} %`, fmtKr(totals.handpenning), { bold: true, sub: customTerms ? 'Enligt villkoren nedan' : 'Faktureras i samband med beställningen' }),
      amountRow('Slutfaktura', fmtKr(totals.slutfaktura), { bold: true, sub: 'Efter utfört arbete' + (rotActive ? ' · ROT dras här' : '') }),
    ] : [
      amountRow('Faktureras', fmtKr(payAmount), { bold: true, sub: 'Efter utfört arbete' + (rotActive ? ' · ROT dras här' : '') }),
    ]),
    { text: customTerms ? nfc(offer.payment_terms) : 'Betalningsvillkor 10 dagar netto från fakturadatum.', fontSize: 7.6, lineHeight: 1.32, color: C.muted, margin: [0, 5, 0, 0] },
  ];
  content.push({
    table: { widths: ['*', 215], body: [[{ stack: leftStack }, { stack: rightStack }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.paper },
    margin: [0, 0, 0, 14],
  });

  // Lugnande ruta
  content.push({
    table: { widths: ['*'], body: [[{
      stack: [
        { text: 'Du behöver inte göra något just nu', bold: true, fontSize: 10.5, color: C.ink },
        { text: `En koordinator kommer att kontakta dig inom några arbetsdagar för att gå igenom detaljerna och boka in nästa steg. Har du frågor innan dess når du oss på ${COMPANY_PHONE} eller ${COMPANY_EMAIL}.`, fontSize: 9.5, lineHeight: 1.38, color: C.text, margin: [0, 4, 0, 0] },
      ],
    }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => C.gold, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12, fillColor: () => C.goldSoft },
    margin: [0, 0, 0, 18],
  });

  // Miniöversikt av stegen – en rad cirklar med linje emellan, etiketter under
  const miniSteps = ['Avtal signerat', 'Planering', 'Material', 'Startdatum', 'Arbetet utförs', 'Klart & faktura'];
  const n = miniSteps.length;
  const colW = CONTENT_W / n;
  const r = 8;
  const cx = (i: number) => colW * (i + 0.5);
  content.push(label('Så här går det till', { color: C.goldInk, margin: [0, 0, 0, 8] }));
  content.push({
    canvas: [
      { type: 'line', x1: cx(0), y1: r, x2: cx(n - 1), y2: r, lineWidth: 1, lineColor: C.borderStrong },
      ...miniSteps.map((_, i) => ({ type: 'ellipse', x: cx(i), y: r, r1: r, r2: r, color: i === 0 ? C.ink : C.goldSoft })),
      check(cx(0), r, r * 1.5, C.white),
    ],
  });
  content.push({
    columns: miniSteps.map((_, i) => ({ width: '*', text: i === 0 ? '' : String(i + 1), fontSize: 7.5, bold: true, color: C.goldInk, alignment: 'center' })),
    columnGap: 0,
    margin: [0, -(r + 4.6), 0, 0],
  });
  content.push({
    columns: miniSteps.map((t, i) => ({ width: '*', text: t, fontSize: 7.4, bold: true, color: i === 0 ? C.ink : C.muted, alignment: 'center' })),
    columnGap: 4,
    margin: [0, 8, 0, 0],
  });
  content.push({ text: 'Varje steg beskrivs på nästa sida.', fontSize: 8, color: C.muted, alignment: 'center', margin: [0, 10, 0, 0] });

  // ---------- Sida 2: Processen efter beställning ----------
  content.push({ text: 'Processen efter beställning', font: DISPLAY, bold: true, fontSize: 18, color: C.text, pageBreak: 'before', margin: [0, 0, 0, 2] });
  content.push({ text: 'Så här går det till från signerat avtal till färdigt arbete. Vi håller dig uppdaterad vid varje steg.', fontSize: 9.5, color: C.muted, margin: [0, 0, 0, 8] });

  const hpNow = hasHp && !customTerms ? ` Handpenningen på ${fmtKr(totals.handpenning)} faktureras separat inom kort, med 10 dagars betalningstid.` : '';
  const hpLater = hasHp && customTerms ? ` Handpenningen (${fmtKr(totals.handpenning)}) faktureras enligt betalningsvillkoren i avtalet.` : '';
  const steps: { title: string; body: string; when: string; done?: boolean }[] = [
    { title: 'Avtalet är signerat', when: 'Klart', done: true,
      body: `Du signerade avtalet digitalt ${fmtSignedAt(signature.acceptedAt)}. Beställningen är registrerad och det signerade avtalet har skickats till din e-post tillsammans med den här bekräftelsen.${hpNow}` },
    { title: 'Vi planerar arbetet tillsammans', when: 'Inom några arbetsdagar',
      body: 'En koordinator kommer att kontakta dig för att gå igenom detaljerna i beställningen. Behöver något mätas eller kontrolleras på plats bokar vi ett besök.' },
    { title: 'Material beställs', when: 'Vi meddelar leveranstid',
      body: 'Vi beställer det material och de produkter som ingår i din order. Leveranstiden beror på vad som beställts – vi återkommer så snart vi har ett datum.' },
    { title: 'Startdatum bokas', when: planned || 'Bokas med dig',
      body: `När material och hantverkare är klara bokar vi startdatum tillsammans med dig.${hpLater} Passar tiden inte, hör av dig så hittar vi en annan.` },
    { title: 'Arbetet utförs', when: 'Arbetsdagarna',
      body: 'Våra hantverkare kommer på utsatt tid, skyddar omgivande ytor och utför arbetet enligt avtalet. Dyker något oväntat upp under arbetets gång stämmer vi av med dig innan vi går vidare. Checklistan nedan visar hur du förbereder dig.' },
    { title: 'Genomgång, slutfaktura och garanti', when: 'Efter utfört arbete',
      body: `Vi går igenom det färdiga arbetet tillsammans med dig. Därefter skickas slutfakturan på ${fmtKr(totals.slutfaktura)}${rotActive ? ' – ROT-avdraget är då redan draget och vi sköter ansökan hos Skatteverket' : ''}. Du har 3 års garanti på utfört arbete.` },
  ];
  const BADGE_W = 22;
  const stepRows = steps.map((s, i) => [
    { ...badge(i + 1, !!s.done, 10, BADGE_W), margin: [0, 1, 0, 0] },
    { stack: [
      { text: s.title, fontSize: 10.5, bold: true, color: C.text },
      { text: s.body, fontSize: 9, lineHeight: 1.36, color: C.muted, margin: [0, 2, 0, 0] },
    ] },
    { text: s.when.toUpperCase(), fontSize: 6.8, bold: true, characterSpacing: 0.6, lineHeight: 1.3, color: s.done ? C.success : C.goldInk, alignment: 'right', margin: [0, 4, 0, 0] },
  ]);
  content.push({
    table: { widths: [BADGE_W, '*', 104], body: stepRows, dontBreakRows: true },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 1 ? 1 : 0), vLineColor: () => C.border,
      paddingLeft: (i: number) => (i === 1 ? 14 : 0), paddingRight: (i: number) => (i === 0 ? 8 : 0), paddingTop: () => 5, paddingBottom: () => 9,
    },
    margin: [0, 0, 0, 8],
  });

  // Checklista inför arbetsstart
  const checklist = [
    'Frigör ytorna där arbetet ska utföras och flytta undan lösa föremål, gardiner och tavlor i närheten.',
    'Täck över känsliga möbler och golv i angränsande rum. Vi skyddar arbetsområdet, men damm kan sprida sig.',
    'Se till att vi kan parkera nära entrén och komma åt el och vatten.',
    'Håll barn och husdjur borta från arbetsområdet under arbetsdagarna.',
    'Vill du lägga till arbete eller ändra något? Säg till före arbetsstart, så planerar vi in det.',
  ];
  content.push({
    unbreakable: true,
    table: { widths: ['*'], body: [[{
      stack: [
        { text: 'Inför arbetsstart', bold: true, fontSize: 10.5, color: C.ink, margin: [0, 0, 0, 6] },
        ...checklist.map((t) => ({
          columns: [{ width: 13, canvas: [{ type: 'rect', x: 0, y: 2.5, w: 8, h: 8, r: 1.5, lineWidth: 0.8, lineColor: C.goldInk }] }, { width: '*', text: t, fontSize: 9, lineHeight: 1.34, color: C.text }],
          margin: [0, 0, 0, 3],
        })),
      ],
    }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => C.gold, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 11, paddingBottom: () => 8, fillColor: () => C.paper },
    margin: [0, 2, 0, 4],
  });

  // Bra att veta
  const facts: [string, string][] = [
    ...(rotActive ? [['ROT-avdraget', 'Avdraget är preliminärt och dras direkt på slutfakturan. Vi ansöker hos Skatteverket; du behöver ha avdragsutrymme kvar för året.'] as [string, string]] : []),
    ['Ändringar och tillägg', 'Vill du ändra något i beställningen eller lägga till arbete? Hör av dig före arbetsstart, så får du ett pris på tillägget innan vi börjar.'],
    ['Ombokning', 'Behöver du flytta ett bokat startdatum? Hör av dig så snart som möjligt, så hittar vi en ny tid.'],
    ['Garanti och reklamation', '3 års garanti på utfört arbete. Produktgarantier enligt respektive tillverkare. Upptäcker du något som inte stämmer, kontakta oss så åtgärdar vi det.'],
  ];
  const half = Math.ceil(facts.length / 2);
  const fact = ([h, b]: [string, string]) => ({ stack: [{ text: h, bold: true, fontSize: 8.8, color: C.ink }, { text: b, fontSize: 8.2, lineHeight: 1.32, color: C.muted, margin: [0, 1.5, 0, 0] }], margin: [0, 0, 0, 6] });
  content.push({
    unbreakable: true,
    stack: [
      { ...sectionHead('Bra att veta'), margin: [0, 8, 0, 8] },
      { columns: [{ width: '*', stack: facts.slice(0, half).map(fact) }, { width: '*', stack: facts.slice(half).map(fact) }], columnGap: 18 },
    ],
  });

  return {
    pageSize: 'A4',
    pageMargins: [M, TOP, M, 64],
    background,
    footer,
    content,
    defaultStyle: { font: SANS, fontSize: 9.5, color: C.text },
    info: { title: `Orderbekräftelse ${orderNo} – SmartKlimat N3prenad`, author: 'SmartKlimat N3prenad AB' },
  };
}

/** Bygger PDF:en i webbläsaren med samma pdfmake/fonter/logotyp som offerten. */
export async function buildOrderConfirmationPdfBlob(offer: OfferForPdf, signature: OrderConfirmationSignature): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const [fonts, logoWhite] = await Promise.all([ensurePdfFonts(pdfMake), loadLogoDataUrl()]);
  const docDef = buildOrderConfirmationDocDef(offer, signature, { logoWhite, ...fonts });
  return new Promise<Blob>((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(docDef, undefined, pdfMake.fonts, pdfMake.vfs);
      const timer = setTimeout(() => reject(new Error('PDF-generering tog för lång tid (timeout)')), 20000);
      doc.getBlob((blob: Blob) => { clearTimeout(timer); resolve(blob); });
    } catch (e) { reject(e); }
  });
}
