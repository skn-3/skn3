import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const APP_URL = 'https://smart-caseflow.lovable.app';
const LOGO_URL = `${APP_URL}/logo.png`;

const SELLERS = ['Daniel Malke', 'Gabriel Hanna'] as const;

const EMAIL_MAP: Record<string, string> = {
  'Daniel Malke': 'daniel.malke@mockfjards.se',
  'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
};

const GLOBAL_CC = 'mf@malke.se';

function wrapInTemplate(heading: string, bodyContent: string, ctaButton?: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${heading}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background-color:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="vertical-align:middle;width:40px;"><img src="${LOGO_URL}" alt="SmartKlimat" width="36" height="36" style="display:block;border-radius:50%;background:#ffffff;padding:3px;" /></td>
<td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:28px 28px 8px 28px;"><h1 style="margin:0;font-size:22px;font-weight:bold;color:#1a1a1a;">${heading}</h1></td></tr>
<tr><td style="padding:8px 28px 20px 28px;">${bodyContent}</td></tr>
${ctaButton ? `<tr><td style="padding:0 28px 8px 28px;">${ctaButton}</td></tr>` : ''}
<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Detta mail skickades automatiskt från SmartKlimat ärendehantering</p></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildCtaButton(text: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 16px 0;">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;border-radius:6px;">${text}</a>
</td></tr>
</table>`;
}

async function sendEmail(
  lovableKey: string,
  resendKey: string,
  to: string | string[],
  subject: string,
  html: string,
  cc?: string | string[]
) {
  const ccList = Array.from(new Set([
    ...(cc ? (Array.isArray(cc) ? cc : [cc]) : []),
    GLOBAL_CC,
  ].filter(Boolean)));
  const payload: Record<string, unknown> = {
    from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    cc: ccList,
  };

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': resendKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Email send error:', JSON.stringify(data));
    throw new Error(`Email failed [${res.status}]`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: string[] = [];
  const errors: string[] = [];

  // Skip weekends (Sat=6, Sun=0) — use Stockholm time
  const nowStockholm = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  const dow = nowStockholm.getDay();
  if (dow === 0 || dow === 6) {
    return new Response(JSON.stringify({ skipped: 'weekend', dow }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const todayISO = nowStockholm.toISOString().slice(0, 10);

  for (const seller of SELLERS) {
    try {
      const email = EMAIL_MAP[seller];
      if (!email) {
        results.push(`Skipped ${seller}: no email mapped`);
        continue;
      }

      const { data: visits, error } = await supabase
        .from('visits')
        .select('id')
        .eq('seller', seller)
        .eq('date', todayISO)
        .limit(1);

      if (error) throw error;

      if (visits && visits.length > 0) {
        results.push(`${seller}: already registered today, skipping`);
        continue;
      }

      const firstName = seller.split(' ')[0];
      const body = `<p style="margin:0 0 12px 0;">Hej ${firstName}! 👋</p>
<p style="margin:0 0 12px 0;">Har du varit på kundbesök idag? Kom ihåg att registrera dem i SmartKlimat så att din statistik och uppföljning blir rätt.</p>
<p style="margin:0 0 8px 0;color:#6b7280;">Det tar bara någon minut — och gör stor skillnad för pipelinen. 💪</p>`;

      const html = wrapInTemplate(
        'Glöm inte registrera dagens besök 📝',
        body,
        buildCtaButton('Registrera besök', '#22C55E')
      );

      await sendEmail(
        LOVABLE_API_KEY,
        RESEND_API_KEY,
        email,
        'Glöm inte registrera dagens besök 📝',
        html
      );
      results.push(`Sent to ${seller} (${email})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`visit-reminder error for ${seller}:`, msg);
      errors.push(`${seller}: ${msg}`);
    }
  }

  console.log('visit-reminder completed:', { results, errors });
  return new Response(JSON.stringify({ success: true, results, errors }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
