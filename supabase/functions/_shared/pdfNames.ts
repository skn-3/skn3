// Logiska filnamn för PDF:er som systemet genererar. Samma namn används när en
// PDF laddas ner/öppnas i appen, som bilaga i mejl och som titel i PDF:en.
// Mönster: <Typ>-<nummer>-<montör/kund>-<adress>-<datum>.pdf
// Ex: Faktura-TOMEK-003-Tomek-Bergsvagen-48-Lidingo-2026-10-20.pdf

const CHAR_MAP: Record<string, string> = {
  å: 'a', ä: 'a', ö: 'o', Å: 'A', Ä: 'A', Ö: 'O', é: 'e', É: 'E', è: 'e', ü: 'u', Ü: 'U', ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE',
};

/** Gör en textbit filnamnssäker: ASCII, bindestreck i stället för mellanslag, max `max` tecken. */
export function slugPart(value: unknown, max = 60): string {
  const s = String(value ?? '')
    .normalize('NFC')
    .replace(/[åäöÅÄÖéÉèüÜøØæÆ]/g, ch => CHAR_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return s.length > max ? s.slice(0, max).replace(/-$/, '') : s;
}

/** YYYY-MM-DD ur ett datum/tidsstämpel; tom sträng om värdet saknas eller är ogiltigt. */
export function datePart(value: unknown): string {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function join(parts: unknown[]): string {
  return parts.map(p => slugPart(p)).filter(Boolean).join('-') + '.pdf';
}

export interface AOrderNameSource {
  order_number?: number | string | null;
  invoice_number?: string | null;
  customer_address?: string | null;
  date?: string | null;
  invoice_sent_at?: string | null;
  status?: string | null;
  credited_from_order_id?: string | null;
  montor_teams?: { name?: string | null } | null;
  order_kind?: string | null;
}

const teamOf = (o: { montor_teams?: { name?: string | null } | null }) => o.montor_teams?.name ?? '';

/** A-order-1234-Samy-Bollgrand-8-Ekero-2026-07-22.pdf (Serviceorder-… för order_kind service) */
export function aOrderPdfName(o: AOrderNameSource): string {
  return join([o.order_kind === 'service' ? 'Serviceorder' : 'A-order', o.order_number ?? 'utkast', teamOf(o), o.customer_address, datePart(o.date)]);
}

/** Faktura-SAMY-039-Samy-Bollgrand-8-Ekero-2026-07-22.pdf */
export function invoicePdfName(o: AOrderNameSource): string {
  return join(['Faktura', o.invoice_number ?? o.order_number, teamOf(o), o.customer_address, datePart(o.invoice_sent_at) || datePart(o.date)]);
}

/** Kreditfaktura-SAMY-048-Samy-Dalkarrsleden-68-Vallingby-2026-08-31.pdf */
export function creditPdfName(o: AOrderNameSource): string {
  return join(['Kreditfaktura', o.invoice_number ?? o.order_number, teamOf(o), o.customer_address, datePart(o.invoice_sent_at) || datePart(o.date)]);
}

/** Rätt namn utifrån A-orderns status: kreditnota, faktura eller A-order. */
export function aOrderDocumentName(o: AOrderNameSource): string {
  if (o.status === 'credited' && o.credited_from_order_id) return creditPdfName(o);
  if (o.status === 'invoiced' || (o.status === 'credited' && o.invoice_number)) return invoicePdfName(o);
  return aOrderPdfName(o);
}

export interface MontorInvoiceNameSource {
  invoice_number?: string | null;
  kind?: string | null;            // 'self_billing' | 'debit'
  title?: string | null;
  date?: string | null;
  total?: number | string | null;
  credited_from_invoice_id?: string | null;
  montor_teams?: { name?: string | null } | null;
}

/** Sjalvfaktura-GVMO-048-GVMO-Kontrollmatningar-2026-09-18.pdf */
export function montorInvoicePdfName(inv: MontorInvoiceNameSource): string {
  const isCredit = !!inv.credited_from_invoice_id || Number(inv.total ?? 0) < 0;
  const typ = isCredit ? 'Kreditfaktura' : inv.kind === 'self_billing' ? 'Sjalvfaktura' : 'Faktura';
  return join([typ, inv.invoice_number, teamOf(inv), inv.title, datePart(inv.date)]);
}

export interface OfferNameSource {
  offer_number?: string | null;
  customer_name?: string | null;
  customer_address?: string | null;
  title?: string | null;
  created_at?: string | null;
  offer_date?: string | null;
}

/** Offert-2026-0016-Sandra-Thernelius-Fyrkloversbackarna-3-Hasselby-2026-10-13.pdf */
export function offerPdfName(o: OfferNameSource, kind: 'offert' | 'avtal' = 'offert'): string {
  return join([kind === 'avtal' ? 'Avtal' : 'Offert', o.offer_number ?? 'utkast', o.customer_name, o.customer_address || o.title, datePart(o.offer_date) || datePart(o.created_at)]);
}

export interface UppdragInvoiceNameSource {
  customer_name?: string | null;
  address?: string | null;
  title?: string | null;
}

/** Slutfaktura-2026-0012-Sandra-Thernelius-Fyrkloversbackarna-3-2026-10-20.pdf */
export function uppdragInvoicePdfName(u: UppdragInvoiceNameSource, kind: 'handpenning' | 'slutfaktura', invoiceNo: string | null | undefined, date?: string | null): string {
  return join([kind === 'handpenning' ? 'Handpenningsfaktura' : 'Slutfaktura', invoiceNo, u.customer_name, u.address || u.title, datePart(date) || datePart(new Date().toISOString())]);
}

export interface OrderConfirmationNameSource { offer_number?: string | null; customer_name?: string | null; customer_address?: string | null; title?: string | null }
/** Orderbekraftelse-2026-0017-Maria-Karolina-Willumsen-Kalvgrand-24-Jarfalla-2026-10-21.pdf */
export function orderConfirmationPdfName(o: OrderConfirmationNameSource, date?: string | null): string {
  return join(['Orderbekraftelse', o.offer_number ?? 'utkast', o.customer_name, o.customer_address || o.title, datePart(date) || datePart(new Date().toISOString())]);
}

export interface ConsultantNameSource { company_name?: string | null; name?: string | null }
/** Faktura-42-VPLG-AB-Gabriel-Hanna-2026-10-21.pdf */
export function consultantInvoicePdfName(c: ConsultantNameSource, invoiceNumber: string | number | null | undefined, date?: string | null): string {
  return join(['Faktura', invoiceNumber, c.company_name, c.name, datePart(date) || datePart(new Date().toISOString())]);
}
/** Lonespecifikation-42-Gabriel-Hanna-2026-10.pdf */
export function consultantSpecPdfName(c: ConsultantNameSource, invoiceNumber: string | number | null | undefined, payoutMonth?: string | null): string {
  const month = datePart(payoutMonth).slice(0, 7);
  return join(['Lonespecifikation', invoiceNumber, c.name, month]);
}

/** Titel att sätta i PDF-metadata (visas i flikens namn i PDF-läsare). */
export function pdfTitleFromName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '');
}
