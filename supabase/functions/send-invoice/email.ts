import { uppdragInvoicePdfName } from '../_shared/pdfNames.ts';

export type InvoiceKind = 'handpenning' | 'slutfaktura';
interface Assignment {
  customer_name?: string | null; customer_address?: string | null; title?: string | null;
  handpenning_amount?: number | null; slutfaktura_amount?: number | null; rot_amount?: number | null;
  handpenning_invoice_no?: string | null;
  handpenning_invoice_date?: string | null; slutfaktura_invoice_date?: string | null;
}
interface Offer { offer_number?: string | null; handpenning_percent?: number | null; vat_mode?: string | null }
const money = (value: number | null | undefined) => Number(value ?? 0).toLocaleString('sv-SE') + ' kr';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));

export function invoiceEmailData(u: Assignment, offer: Offer, kind: InvoiceKind, invoiceNo: string, now = new Date()) {
  const invoiceDate = u[`${kind}_invoice_date`] || now.toISOString().slice(0, 10);
  const due = new Date(`${invoiceDate}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 10);
  const hpPercent = offer.handpenning_percent ?? 25;
  const rot = Number(u.rot_amount ?? 0);
  const kindLabel = kind === 'handpenning' ? 'Handpenningsfaktura' : 'Slutfaktura';
  let nextText = kind === 'handpenning'
    ? `Handpenningen är ${hpPercent} % av ordersumman och dras av på slutfakturan. Återstående ${money(u.slutfaktura_amount)} faktureras efter utfört arbete${rot > 0 ? `, med det preliminära ROT-avdraget på ${money(rot)} draget` : ''}.`
    : `Handpenningen ${money(u.handpenning_amount)} (faktura ${u.handpenning_invoice_no ?? ''}) är avdragen.${rot > 0 ? ` ROT-avdraget på ${money(rot)} är draget direkt på fakturan – vi ansöker om beloppet hos Skatteverket.` : ''} Tack för att du valde oss.`;
  if (offer.vat_mode === 'omvand') nextText += ' Omvänd betalningsskyldighet för byggtjänster gäller – momsen redovisas av er.';
  return {
    kindLabel, kindUpper: kindLabel.toUpperCase(), invoiceNo, invoiceDate,
    firstName: u.customer_name?.trim().split(/\s+/)[0] || 'kund',
    title: (u.title ?? '').replace(/^Offert\s*[–—-]\s*/i, '').trim(),
    offerNo: offer.offer_number || '', amount: money(u[`${kind}_amount`]),
    dueDate: due.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    attachmentName: uppdragInvoicePdfName({ ...u, address: u.customer_address }, kind, invoiceNo, invoiceDate),
    nextText, paymentFor: kind === 'handpenning' ? 'handpenningen för' : 'slutbetalningen för',
    hpPercent, rotAmount: rot, reverseVat: offer.vat_mode === 'omvand',
  };
}

export function buildHtml(opts: ReturnType<typeof invoiceEmailData> & { logoUrl: string; downloadUrl?: string }): string {
  const o = Object.fromEntries(Object.entries(opts).map(([key, value]) => [key, escapeHtml(String(value ?? ''))])) as Record<string, string>;
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${o.kindLabel} ${o.invoiceNo}</title></head>
<body style="margin:0;padding:0;background:#EEECE6;font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#15211B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEECE6;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#082B21;padding:20px 28px;border-bottom:3px solid #DCBE6E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:48px;"><img src="${o.logoUrl}" alt="SmartKlimat" width="36" height="36" style="display:block;"/></td>
<td style="vertical-align:middle;color:#ffffff;"><div style="font-size:17px;font-weight:700;line-height:1.05;">SmartKlimat</div><div style="font-size:10px;letter-spacing:2px;color:#9FB8AC;margin-top:2px;">N3PRENAD</div></td>
<td align="right" style="vertical-align:middle;"><div style="font-size:10px;letter-spacing:1.8px;font-weight:700;color:#DCBE6E;">${o.kindUpper}</div><div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:2px;">${o.invoiceNo}</div></td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 0;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.15;color:#15211B;">Hej ${o.firstName}, här är din ${o.kindLabel.toLowerCase()}</h1>
<p style="margin:0 0 12px;">Fakturan gäller ${o.paymentFor} <strong>${o.title}</strong>${opts.offerNo ? ` enligt avtal ${o.offerNo}` : ''}. Fakturan finns som PDF i bilagan och via knappen nedan.</p>
</td></tr>
<tr><td style="padding:6px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EE;border-radius:12px;"><tr><td style="padding:16px 20px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="width:50%;padding:0 8px 12px 0;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">ATT BETALA</div><div style="font-size:22px;font-weight:700;color:#0B3D2E;line-height:1.1;">${o.amount}</div></td>
<td style="width:50%;padding:0 0 12px 8px;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">SENAST</div><div style="font-size:15px;font-weight:700;color:#15211B;">${o.dueDate}</div></td>
</tr>
<tr>
<td style="width:50%;padding:0 8px 12px 0;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">BANKGIRO</div><div style="font-size:15px;font-weight:700;color:#15211B;">5032-4573</div></td>
<td style="width:50%;padding:0 0 12px 8px;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">MEDDELANDE</div><div style="font-size:15px;font-weight:700;color:#15211B;">Faktura ${o.invoiceNo}</div></td>
</tr>
</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EDD0;border-left:3px solid #DCBE6E;border-radius:0 12px 12px 0;"><tr><td style="padding:14px 18px;">
<div style="font-size:15px;font-weight:700;color:#0B3D2E;">Vad händer sen?</div>
<div style="font-size:14px;color:#15211B;margin-top:4px;">${o.nextText}</div>
</td></tr></table>
</td></tr>
${opts.downloadUrl ? `<tr><td style="padding:22px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#DCBE6E;border-radius:12px;">
<a href="${o.downloadUrl}" style="display:block;padding:16px 24px;color:#15211B;font-weight:700;font-size:16px;text-decoration:none;">Ladda ner fakturan (PDF)</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12.5px;color:#5E6B64;text-align:center;">Länken fungerar i 30 dagar. Fakturan finns också som bilaga i det här mejlet.</p>
</td></tr>` : ''}
<tr><td style="padding:22px 28px 24px;"><p style="margin:0;font-size:14px;">Ange fakturanumret som meddelande vid betalningen. Har du frågor? Svara på det här mejlet eller ring oss på 070-719 72 35.</p></td></tr>
<tr><td style="padding:16px 28px;background:#F5F3EE;"><p style="margin:0;font-size:11.5px;color:#5E6B64;text-align:center;">SmartKlimat N3prenad AB · Org.nr 559026-6630 · Godkänd för F-skatt · Morsstigen 3, 141 71 Segeltorp · n3prenad@smartklimat.org</p></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:12px 8px 0;font-size:12px;color:#5E6B64;">Bilaga: ${o.attachmentName}</td></tr></table>
</td></tr></table></body></html>`;
}
