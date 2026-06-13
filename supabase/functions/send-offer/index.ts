import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const FALLBACK_APP_URL = 'https://smartklimatentreprenad.com';

function makeToken(): string {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return a + b;
}

function fmtKr(n: number | null | undefined): string {
  const v = Number(n || 0);
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);
}

function buildHtml(opts: {
  offerNumber: string;
  customerName: string;
  validUntil: string | null;
  amountRowsHtml: string;
  publicUrl: string;
  logoUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Din offert</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:40px;"><img src="${opts.logoUrl}" alt="SmartKlimat" width="36" height="36" style="display:block;border-radius:50%;background:#fff;padding:3px;"/></td>
<td style="vertical-align:middle;padding-left:12px;color:#fff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 8px;"><h1 style="margin:0;font-size:22px;color:#1a1a1a;">Din offert ${opts.offerNumber}</h1></td></tr>
<tr><td style="padding:8px 28px 12px;">
<p style="margin:0 0 12px;">Hej ${opts.customerName},</p>
<p style="margin:0 0 12px;">Tack för din förfrågan! Här kommer din offert från SmartKlimat N3prenad.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;width:160px;">Offertnummer</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${opts.offerNumber}</td></tr>
${opts.validUntil ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6b7280;">Giltig t.o.m.</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${opts.validUntil}</td></tr>` : ''}
${opts.amountRowsHtml}
</table>
</td></tr>

<tr><td style="padding:0 28px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 8px;">
<a href="${opts.publicUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 36px;background:#22C55E;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none;border-radius:6px;"><span style="color:#ffffff;text-decoration:none;">Öppna din offert</span></a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 28px 16px;">
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;word-break:break-all;">
Fungerar inte knappen? Kopiera och klistra in denna länk i webbläsaren:<br>
<a href="${opts.publicUrl}" style="color:#15803D;">${opts.publicUrl}</a>
</p></td></tr>
<tr><td style="padding:0 28px 24px;"><p style="margin:0;font-size:13px;color:#6b7280;">Har du frågor? Svara på detta mejl eller ring 070-719 72 35.</p></td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">SmartKlimat N3prenad AB · n3prenad@smartklimat.org</p></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const isUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s);

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    {
      const a = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: r } = await a.from('user_roles').select('role,is_admin').eq('user_id', claims.claims.sub).maybeSingle();
      if (!(r?.is_admin || r?.role === 'seller' || r?.role === 'coordinator')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { offer_id, origin } = body || {};
    if (!offer_id || typeof offer_id !== 'string') {
      return new Response(JSON.stringify({ error: 'offer_id krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const envUrl = Deno.env.get('PUBLIC_APP_URL');
    const base = (isUrl(origin) ? origin : (isUrl(envUrl) ? envUrl! : FALLBACK_APP_URL)).replace(/\/$/, '');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: offer, error: ofErr } = await admin.from('offers').select('*').eq('id', offer_id).maybeSingle();
    if (ofErr) throw ofErr;
    if (!offer) {
      return new Response(JSON.stringify({ error: 'Offerten hittades inte' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!offer.customer_email) {
      return new Response(JSON.stringify({ error: 'Kunden saknar e-post' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!offer.pdf_path) {
      return new Response(JSON.stringify({ error: 'Generera PDF först' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let publicToken: string = offer.public_token;
    if (!publicToken) {
      publicToken = makeToken();
    }

    // Update token + sent_at + status (never demote 'accepted')
    const updates: Record<string, unknown> = {
      public_token: publicToken,
      sent_at: new Date().toISOString(),
    };
    if (offer.status !== 'accepted') updates.status = 'sent';

    const { error: upErr } = await admin.from('offers').update(updates).eq('id', offer_id);
    if (upErr) throw upErr;

    const publicUrl = `${base}/offert/${publicToken}`;
    const logoUrl = `${base}/logo.png`;

    const totalInclVat = Number(offer.total_incl_vat || 0);
    const totalAfterRot = offer.total_after_rot != null ? Number(offer.total_after_rot) : totalInclVat;
    const rotAmount = Number(offer.rot_amount || 0);
    const handpenningPct = Number(offer.handpenning_percent ?? 25);
    const payable = offer.rot_enabled ? totalAfterRot : totalInclVat;
    const handpenning = Math.round(payable * handpenningPct / 100);
    const slutfaktura = payable - handpenning;

    const rowCell = 'padding:8px 0;border-bottom:1px solid #eee;';
    const rowLbl = `${rowCell}color:#6b7280;width:160px;`;
    const rowVal = rowCell;
    const mkRow = (label: string, value: string, opts?: { valueStyle?: string; labelStyle?: string }) =>
      `<tr><td style="${opts?.labelStyle || rowLbl}">${label}</td><td style="${opts?.valueStyle || rowVal}">${value}</td></tr>`;

    let amountRowsHtml = '';
    if (offer.rot_enabled) {
      amountRowsHtml += mkRow('Ordersumma innan avdrag', fmtKr(totalInclVat));
      amountRowsHtml += mkRow('Preliminärt ROT-avdrag', `−${fmtKr(rotAmount)}`, { valueStyle: `${rowCell}color:#16a34a;` });
      amountRowsHtml += mkRow('Total ordersumma efter ROT', fmtKr(totalAfterRot), { valueStyle: `${rowCell}font-weight:700;font-size:15px;` });
    } else {
      amountRowsHtml += mkRow('Summa inkl moms', fmtKr(totalInclVat), { valueStyle: `${rowCell}font-weight:600;` });
    }
    amountRowsHtml += mkRow(`Handpenning ${handpenningPct}%`, fmtKr(handpenning));
    amountRowsHtml += mkRow('Slutfaktura', fmtKr(slutfaktura), { valueStyle: `padding:8px 0;font-weight:600;` });

    const html = buildHtml({
      offerNumber: offer.offer_number || '—',
      customerName: offer.customer_name || 'kund',
      validUntil: offer.valid_until || null,
      amountRowsHtml,
      publicUrl,

      logoUrl,
    });

    const emailResp = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
        reply_to: 'n3prenad@smartklimat.org',
        to: [offer.customer_email],
        subject: 'Din offert från SmartKlimat N3prenad',
        html,
      }),
    });

    const emailData = await emailResp.json();
    if (!emailResp.ok) {
      console.error('Resend error', emailData);
      return new Response(JSON.stringify({ error: 'Kunde inte skicka mejl', details: emailData }), {
        status: emailResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, public_url: publicUrl, public_token: publicToken }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-offer error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
