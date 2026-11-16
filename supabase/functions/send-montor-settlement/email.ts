// Ren mejlmall för utbetalningsspecifikationen (testas utan att skicka mejl).
// Betalningsraden står överst så att Daniel kan kopiera den direkt.
import { INVOICE_EMAIL_FOOTER_ROW } from '../_shared/invoiceEmailFooter.ts';
import { formatPaymentAmount, settlementPaymentLine } from '../_shared/montorSettlementShared.ts';

export const SETTLEMENT_CC = ['n3prenad@smartklimat.org', 'daniel@malke.se'] as const;

export interface SettlementMailSource {
  settlement_number: string | null;
  settlement_date: string;
  company_name: string | null;
  bankgiro: string | null;
  invoices_total: number | string;
  credits_total: number | string;
  deductions_total: number | string;
  net_amount: number | string;
}
export interface SettlementMailTeam { invoice_email?: string | null; email?: string | null }

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));

export function settlementSubject(s: Pick<SettlementMailSource, 'settlement_number'>): string {
  return `Utbetalningsspecifikation ${s.settlement_number ?? ''} från SmartKlimat N3prenad`.replace(/\s+/g, ' ');
}

/** Teamets fakturaadress, annars teamets e-post. Kopia alltid till n3prenad@ och daniel@malke.se. */
export function settlementRecipients(team: SettlementMailTeam): { to: string[]; cc: string[] } | null {
  const to = String(team.invoice_email || team.email || '').trim();
  if (!to) return null;
  return { to: [to], cc: [...SETTLEMENT_CC].filter(c => c.toLowerCase() !== to.toLowerCase()) };
}

export function buildSettlementEmailHtml(s: SettlementMailSource, hasDeductions: boolean): string {
  const line = settlementPaymentLine(s);
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:${strong ? '#0B3D2E' : '#374151'};${strong ? 'font-weight:bold;font-size:16px;' : ''}">${esc(label)}</td><td style="padding:4px 0;text-align:right;${strong ? 'font-weight:bold;font-size:16px;color:#0B3D2E;' : ''}">${esc(value)}</td></tr>`;
  const minus = (v: number | string) => (Math.abs(Number(v) || 0) > 0 ? `-${formatPaymentAmount(Math.abs(Number(v)))}` : formatPaymentAmount(0));
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="padding:20px 28px 0;">
<div style="font-family:'Courier New',monospace;font-size:13px;background:#F5F3EE;border:1px solid #DCBE6E;border-radius:8px;padding:10px 12px;color:#0B3D2E;">${esc(line)}</div>
</td></tr>
<tr><td style="padding:20px 28px 8px;">
<h1 style="margin:0 0 8px;font-size:22px;color:#1f2937;">UTBETALNINGSSPECIFIKATION ${esc(s.settlement_number)}</h1>
<div style="font-size:16px;font-weight:bold;color:#1a1a1a;">${esc(s.company_name)}</div>
<div style="font-size:12px;color:#6b7280;margin-top:2px;">Datum ${esc(s.settlement_date)}</div>
</td></tr>
<tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/></td></tr>
<tr><td style="padding:0 28px;">
<p style="margin:8px 0;">Här är specifikationen för vår utbetalning till er. Den bifogas som PDF. Det här är ingen faktura.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">
${row('Summa fakturor', formatPaymentAmount(s.invoices_total))}
${row('Avgår kreditfakturor', minus(s.credits_total))}
${row('Avgår kvittade fordringar', minus(s.deductions_total))}
${row('Att utbetala', formatPaymentAmount(s.net_amount), true)}
</table>
<p style="margin:8px 0;">Utbetalas till bankgiro ${esc(s.bankgiro || '—')} (${esc(s.company_name || '—')}) med referens ${esc(s.settlement_number)}.</p>
${hasDeductions ? '<p style="margin:8px 0;">Fordringarna i specifikationen har tidigare skickats till er som debetfakturor. Vi kvittar dem mot era fakturor enligt specifikationen.</p>' : ''}
<p style="margin:8px 0;color:#6b7280;font-size:12px;">Frågor: n3prenad@smartklimat.org.</p>
</td></tr>
<tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/></td></tr>
${INVOICE_EMAIL_FOOTER_ROW}
</table></td></tr></table></body></html>`;
}
