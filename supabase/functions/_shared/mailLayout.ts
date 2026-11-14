// Projektets vanliga mejllayout (flyttad oförändrad från notify-email så att fler funktioner
// kan använda den, t.ex. calendar-connect).
import { MAIL_LINK_BASE_URL } from './mailLinks.ts';

// deno-lint-ignore no-explicit-any
const APP_URL = ((globalThis as any).Deno?.env?.get?.('APP_URL') as string | undefined) ?? 'https://smartklimatentreprenad.com';
const LOGO_URL = `${APP_URL}/logo.png`;

export function buildCtaButton(text: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 16px 0;">
<a href="${MAIL_LINK_BASE_URL}" target="_blank" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;border-radius:6px;">${text}</a>
</td></tr>
</table>`;
}

export function wrapInTemplate(heading: string, bodyContent: string, callToAction?: string, ctaButton?: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">

<!-- Card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">

<!-- Top banner -->
<tr>
<td style="background-color:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="vertical-align:middle;width:40px;">
<img src="${LOGO_URL}" alt="SmartKlimat" width="36" height="36" style="display:block;border-radius:50%;background:#ffffff;padding:3px;" />
</td>
<td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr>
</table>
</td>
</tr>

<!-- Heading -->
<tr>
<td style="padding:28px 28px 8px 28px;">
<h1 style="margin:0;font-size:22px;font-weight:bold;color:#1a1a1a;">${heading}</h1>
</td>
</tr>

<!-- Body content -->
<tr>
<td style="padding:8px 28px 20px 28px;">
${bodyContent}
</td>
</tr>

${ctaButton ? `<tr><td style="padding:0 28px 8px 28px;">${ctaButton}</td></tr>` : ''}

${callToAction ? `
<!-- CTA text -->
<tr>
<td style="padding:0 28px 24px 28px;">
<p style="margin:0;font-size:14px;color:#2563EB;font-weight:500;">${callToAction}</p>
</td>
</tr>
` : ''}

<!-- Footer -->
<tr>
<td style="padding:16px 28px;border-top:1px solid #f0f0f0;">
<p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
Detta mail skickades automatiskt från SmartKlimat ärendehantering
</p>
</td>
</tr>

</table>
<!-- /Card -->

</td></tr>
</table>
</body>
</html>`;
}

