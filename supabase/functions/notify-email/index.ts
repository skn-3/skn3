const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function wrapInTemplate(heading: string, bodyContent: string, callToAction?: string): string {
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
<td style="color:#ffffff;font-size:20px;font-weight:bold;">❄️ SmartKlimat N3prenad</td>
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

${callToAction ? `
<!-- CTA -->
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

function buildInfoTable(rows: Array<{ label: string; value: string; badge?: { color: string; bg: string } }>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${rows.map(r => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">${r.label}</td>
<td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#1a1a1a;vertical-align:top;">${
  r.badge 
    ? `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600;background-color:${r.badge.bg};color:${r.badge.color};">${r.value}</span>`
    : r.value
}</td>
</tr>`).join('\n')}
</table>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { to, cc, subject, body, heading, rows, callToAction } = await req.json();

    if (!to || !subject) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build HTML: if structured data (rows) provided, use template; otherwise wrap raw body
    let html: string;
    if (rows && Array.isArray(rows)) {
      const tableHtml = buildInfoTable(rows);
      html = wrapInTemplate(heading || subject, tableHtml, callToAction);
    } else if (body) {
      // Wrap legacy raw HTML body in the branded template
      html = wrapInTemplate(heading || subject, body, callToAction);
    } else {
      return new Response(JSON.stringify({ error: 'Missing body or rows' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailPayload: Record<string, unknown> = {
      from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    if (cc) {
      emailPayload.cc = Array.isArray(cc) ? cc : [cc];
    }

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify(emailPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', JSON.stringify(data));
      return new Response(JSON.stringify({ error: `Email send failed [${response.status}]`, details: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('notify-email error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});