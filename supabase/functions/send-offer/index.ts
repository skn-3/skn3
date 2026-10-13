import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const FALLBACK_APP_URL = 'https://smartklimatentreprenad.com';
const COMPANY_PHONE = '070-719 72 35';

function makeToken(): string {
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return a + b;
}

function fmtKr(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';
}

function fmtDateLong(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initialsOf(name: string | null | undefined): string {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'N3';
}

// Mejlet till kunden: samma varumärke som offertsidan och PDF:en (mörkgrön header, guldknapp).
// Tabellbaserat med inline-stilar så att det ser rätt ut i Gmail/Outlook/Apple Mail.
function buildHtml(opts: {
  offerNumber: string;
  customerFirstName: string;
  title: string;
  address: string;
  rows: Array<{ label: string; value: string; big?: boolean }>;
  publicUrl: string;
  logoUrl: string;
  sellerName: string | null;
}): string {
  const rowsHtml = opts.rows.map((r) => r.big
    ? `<tr><td style="padding:10px 0;border-top:1px solid #E3E1DA;color:#5E6B64;font-size:14px;vertical-align:middle;">${esc(r.label)}</td><td align="right" style="padding:10px 0;border-top:1px solid #E3E1DA;font-size:22px;font-weight:700;color:#0B3D2E;white-space:nowrap;vertical-align:middle;">${esc(r.value)}</td></tr>`
    : `<tr><td style="padding:7px 0;border-top:1px solid #E3E1DA;color:#5E6B64;font-size:14px;">${esc(r.label)}</td><td align="right" style="padding:7px 0;border-top:1px solid #E3E1DA;font-size:14px;color:#15211B;white-space:nowrap;">${esc(r.value)}</td></tr>`,
  ).join('');
  const seller = opts.sellerName
    ? `<tr><td style="padding:22px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #E3E1DA;width:100%;"><tr>
<td style="padding-top:18px;width:54px;vertical-align:middle;"><div style="width:42px;height:42px;border-radius:21px;background:#0B3D2E;color:#fff;font-weight:700;font-size:13px;line-height:42px;text-align:center;">${esc(initialsOf(opts.sellerName))}</div></td>
<td style="padding-top:18px;vertical-align:middle;"><div style="font-size:14px;font-weight:700;color:#15211B;">${esc(opts.sellerName)}</div><div style="font-size:12.5px;color:#5E6B64;">Säljare, SmartKlimat N3prenad · ${esc(COMPANY_PHONE)} · svara på det här mejlet om du har frågor</div></td>
</tr></table></td></tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Din offert ${esc(opts.offerNumber)}</title></head>
<body style="margin:0;padding:0;background:#EEECE6;font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#15211B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEECE6;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#082B21;padding:20px 28px;border-bottom:3px solid #DCBE6E;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:48px;"><img src="${esc(opts.logoUrl)}" alt="SmartKlimat" width="36" height="36" style="display:block;"/></td>
<td style="vertical-align:middle;color:#ffffff;"><div style="font-size:17px;font-weight:700;line-height:1.05;">SmartKlimat</div><div style="font-size:10px;letter-spacing:2px;color:#9FB8AC;margin-top:2px;">N3PRENAD</div></td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 0;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.15;color:#15211B;">Hej ${esc(opts.customerFirstName)}, här är din offert</h1>
<p style="margin:0 0 12px;">Tack för att vi fick komma ut och titta. Här är vår offert${opts.address ? ` för ${esc(opts.address)}` : ''}. Öppna den, läs igenom och signera digitalt när du känner dig redo – det tar en minut.</p>
</td></tr>
<tr><td style="padding:6px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EE;border-radius:12px;"><tr><td style="padding:18px 20px;">
<div style="font-size:15px;font-weight:700;color:#15211B;margin-bottom:10px;">${esc(opts.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml}</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#DCBE6E;border-radius:12px;">
<a href="${esc(opts.publicUrl)}" target="_blank" rel="noopener" style="display:block;padding:16px 24px;color:#15211B;font-weight:700;font-size:16px;text-decoration:none;">Öppna och signera offerten</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12.5px;color:#5E6B64;text-align:center;">Offert ${esc(opts.offerNumber)} · Du får bekräftelse och det signerade avtalet som PDF direkt efter signeringen.</p>
</td></tr>
${seller}
<tr><td style="padding:18px 28px 24px;"><p style="margin:0;font-size:12px;color:#5E6B64;line-height:1.5;word-break:break-all;">Fungerar inte knappen? Kopiera länken: <a href="${esc(opts.publicUrl)}" style="color:#0B3D2E;">${esc(opts.publicUrl)}</a></p></td></tr>
<tr><td style="padding:16px 28px;background:#F5F3EE;"><p style="margin:0;font-size:11.5px;color:#5E6B64;text-align:center;">SmartKlimat N3prenad AB · Org.nr 559026-6630 · Morsstigen 3, 141 71 Segeltorp · n3prenad@smartklimat.org</p></td></tr>
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
    const logoUrl = `${base}/brand/logo-stamp-vit-n3.png`;

    // Samma räkneregler som offerCalc.ts / PDF:en / kundsidan:
    // handpenning beräknas på ordersumman FÖRE ROT, hela ROT-avdraget dras på slutfakturan.
    const inclVat = offer.vat_mode !== 'omvand';
    const rotActive = !!offer.rot_enabled && inclVat;
    const orderSum = Number(offer.total_incl_vat || 0);
    const rotAmount = Number(offer.rot_amount || 0);
    const payable = rotActive ? (offer.total_after_rot != null ? Number(offer.total_after_rot) : orderSum - rotAmount) : orderSum;
    const handpenningPct = Number(offer.handpenning_percent ?? 25);
    const handpenning = Math.round(orderSum * handpenningPct / 100);
    const slutfaktura = payable - handpenning;

    const rows: Array<{ label: string; value: string; big?: boolean }> = [];
    rows.push({ label: rotActive ? 'Att betala efter ROT-avdrag' : inclVat ? 'Att betala inkl. moms' : 'Att betala, omvänd byggmoms', value: fmtKr(payable), big: true });
    if (rotActive) {
      rows.push({ label: 'Ordersumma inkl. moms', value: fmtKr(orderSum) });
      rows.push({ label: `Preliminärt ROT-avdrag ${Number(offer.rot_percent || 30)} %`, value: `−${fmtKr(rotAmount)}` });
    }
    if (handpenningPct > 0) {
      rows.push({ label: `Handpenning ${handpenningPct} % vid beställning`, value: fmtKr(handpenning) });
      rows.push({ label: 'Slutfaktura efter utfört arbete', value: fmtKr(slutfaktura) });
    }
    if (offer.valid_until) rows.push({ label: 'Giltig till', value: fmtDateLong(offer.valid_until) });

    const offerNumber = offer.offer_number || '—';
    const customerFirstName = String(offer.customer_name || '').trim().split(/\s+/)[0] || 'kund';
    const html = buildHtml({
      offerNumber,
      customerFirstName,
      title: offer.title || `Offert ${offerNumber}`,
      address: offer.customer_address || '',
      rows,
      publicUrl,
      logoUrl,
      sellerName: offer.created_by || null,
    });

    const subject = `Din offert ${offerNumber} från SmartKlimat N3prenad${offer.title ? ` – ${offer.title}` : ''}`.slice(0, 150);

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
        subject,
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
