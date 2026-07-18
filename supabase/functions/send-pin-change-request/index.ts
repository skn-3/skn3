import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { requireAdmin } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://smartklimatentreprenad.com';
const LOGO_URL = `${APP_URL}/logo.png`;

const EMAIL_MAP: Record<string, string> = {
  'GVMO': 'gvmo.bygg@gmail.com',
  'Samy': 'info@smtmbygg.se',
  'Alex NBD': 'alex@nbdentreprenad.com',
  'Jerk': 'jerk.ryttman@mockfjards.se',
  'Villaspecialisten': 'Edvin@villaspecialisten.se',
  'Daniel Malke': 'daniel@smartklimat.org',
  'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
  'Mirna Malke': 'mirna.malke@mockfjards.se',
};

function ctaButton(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 16px 0;">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:12px 32px;background-color:#22C55E;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;border-radius:6px;">${text}</a>
</td></tr></table>`;
}

function wrapInTemplate(heading: string, bodyContent: string, cta?: string): string {
  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${heading}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background-color:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:40px;"><img src="${LOGO_URL}" alt="N3prenad" width="36" height="36" style="display:block;border-radius:50%;background:#ffffff;padding:3px;" /></td>
<td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 8px 28px;"><h1 style="margin:0;font-size:22px;font-weight:bold;color:#1a1a1a;">${heading}</h1></td></tr>
<tr><td style="padding:8px 28px 20px 28px;">${bodyContent}</td></tr>
${cta ? `<tr><td style="padding:0 28px 8px 28px;">${cta}</td></tr>` : ''}
<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Detta mail skickades automatiskt från SmartKlimat N3prenad</p></td></tr>
</table></td></tr></table></body></html>`;
}

function buildBody(firstName: string): string {
  return `<p style="margin:0 0 12px 0;">Hej ${firstName}!</p>
<p style="margin:0 0 12px 0;">Vi höjer säkerheten i N3prenad. Alla användare byter nu till en personlig 6-siffrig PIN-kod som du väljer själv.</p>
<p style="margin:0 0 8px 0;"><strong>Så här gör du:</strong></p>
<ol style="margin:0 0 12px 18px;padding:0;">
<li style="margin:4px 0;">Klicka på knappen nedan (eller gå till smartklimatentreprenad.com)</li>
<li style="margin:4px 0;">Logga in som vanligt med din nuvarande kod</li>
<li style="margin:4px 0;">Du blir direkt ombedd att välja en ny 6-siffrig PIN — välj och bekräfta</li>
<li style="margin:4px 0;">Klart! Från och med nu loggar du in med din nya kod.</li>
</ol>
<p style="margin:0 0 12px 0;color:#6b7280;">Tips: undvik 123456, födelsedatum eller en kod du använder någon annanstans.</p>
<p style="margin:0;">Frågor? Hör av dig till Daniel.</p>`;
}

const GLOBAL_CC = 'mf@malke.se';

async function sendEmail(lovableKey: string, resendKey: string, to: string, subject: string, html: string) {
  const payload = {
    from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
    to: [to],
    subject,
    html,
    cc: [GLOBAL_CC],
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
  if (!res.ok) {
    const data = await res.text();
    throw new Error(`Email failed [${res.status}]: ${data}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    // Verifiera JWT + admin-roll
    const authCheck = await requireAdmin(req, corsHeaders);
    if (authCheck.response) return authCheck.response;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const test_mode: boolean = !!body.test_mode;
    const test_email: string | undefined = body.test_email;

    if (test_mode) {
      if (!test_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(test_email)) {
        return new Response(JSON.stringify({ error: 'test_email krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const html = wrapInTemplate(
        'Dags att välja en ny PIN-kod (6 siffror)',
        buildBody('Förnamn'),
        ctaButton('Öppna N3prenad'),
      );
      await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, test_email, 'Dags att välja en ny PIN-kod (6 siffror)', html);
      return new Response(JSON.stringify({ success: true, test_mode: true, sent_to: test_email }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Skarp körning: alla profiler
    const { data: profiles, error: pErr } = await admin.from('profiles').select('id, name');
    if (pErr) throw pErr;

    const sent: string[] = [];
    const missing: string[] = [];

    for (const p of profiles || []) {
      const name = p.name as string;
      const email = EMAIL_MAP[name];
      if (!email) { missing.push(name); continue; }
      const firstName = name.split(' ')[0] || name;
      const html = wrapInTemplate(
        'Dags att välja en ny PIN-kod (6 siffror)',
        buildBody(firstName),
        ctaButton('Öppna N3prenad'),
      );
      try {
        await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, email, 'Dags att välja en ny PIN-kod (6 siffror)', html);
        await admin.from('profiles').update({
          must_change_pin: true,
          pin_change_requested_at: new Date().toISOString(),
        }).eq('id', p.id);
        sent.push(name);
      } catch (e) {
        console.error('Send failed for', name, e);
        missing.push(`${name} (skickfel)`);
      }
    }

    return new Response(JSON.stringify({ success: true, sent, missing }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-pin-change-request error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
