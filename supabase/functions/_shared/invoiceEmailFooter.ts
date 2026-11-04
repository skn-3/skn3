// Company footer for every email that sends an N3prenad invoice or credit note.
// The text must match the footer in send-invoice/email.ts exactly (tested).
export const INVOICE_EMAIL_FOOTER_TEXT =
  'SmartKlimat N3prenad AB · Org.nr 559026-6630 · Godkänd för F-skatt · Morsstigen 3, 141 71 Segeltorp · n3prenad@smartklimat.org';

export const INVOICE_EMAIL_FOOTER_ROW =
  `<tr><td style="padding:16px 28px;background:#F5F3EE;"><p style="margin:0;font-size:11.5px;color:#5E6B64;text-align:center;">${INVOICE_EMAIL_FOOTER_TEXT}</p></td></tr>`;
