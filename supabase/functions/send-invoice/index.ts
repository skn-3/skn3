import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const COPY_TO = 'n3prenad@smartklimat.org';

function buildHtml(opts: { kindLabel: string; invoiceNo: string; customerName: string; title: string; logoUrl: string; downloadUrl?: string }): string {
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:40px;"><img src="${opts.logoUrl}" alt="SmartKlimat" width="36" height="36" style="display:block;border-radius:50%;background:#fff;padding:3px;"/></td>
<td style="vertical-align:middle;padding-left:12px;color:#fff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 8px;"><h1 style="margin:0;font-size:22px;color:#1a1a1a;">${opts.kindLabel} ${opts.invoiceNo}</h1></td></tr>
<tr><td style="padding:8px 28px 12px;">
<p style="margin:0 0 12px;">Hej ${opts.customerName},</p>
<p style="margin:0 0 12px;">Bifogat finner du ${opts.kindLabel.toLowerCase()} avseende <strong>${opts.title}</strong>.</p>
${opts.downloadUrl ? `<p style="margin:0 0 12px;"><a href="${opts.downloadUrl}" style="color:#15803D;">Ladda ner fakturan (PDF)</a></p>` : ''}
<p style="margin:0 0 12px;">Betalningsvillkor 10 dagar netto. Bankgiro 5032-4573.</p>
<p style="margin:0;">Har du frågor? Svara på detta mejl eller ring 070-719 72 35.</p>
</td></tr>
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
    const { uppdrag_id, kind } = body || {};
    if (!uppdrag_id || typeof uppdrag_id !== 'string') {
      return new Response(JSON.stringify({ error: 'uppdrag_id krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (kind !== 'handpenning' && kind !== 'slutfaktura') {
      return new Response(JSON.stringify({ error: 'kind måste vara handpenning eller slutfaktura' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: uppdrag, error: uErr } = await admin.from('uppdrag').select('*').eq('id', uppdrag_id).maybeSingle();
    if (uErr) throw uErr;
    if (!uppdrag) return new Response(JSON.stringify({ error: 'Uppdraget hittades inte' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!uppdrag.customer_email) return new Response(JSON.stringify({ error: 'Kunden saknar e-post' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const pdfPath = kind === 'handpenning' ? uppdrag.handpenning_pdf_path : uppdrag.slutfaktura_pdf_path;
    const invoiceNo = kind === 'handpenning' ? uppdrag.handpenning_invoice_no : uppdrag.slutfaktura_invoice_no;
    if (!pdfPath) return new Response(JSON.stringify({ error: 'Generera PDF först' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!invoiceNo) return new Response(JSON.stringify({ error: 'Fakturanummer saknas' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Download PDF
    const { data: file, error: dlErr } = await admin.storage.from('case-documents').download(pdfPath);
    if (dlErr || !file) throw dlErr || new Error('PDF kunde inte hämtas');
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    // Signed URL fallback (30 days)
    const { data: signed } = await admin.storage.from('case-documents').createSignedUrl(pdfPath, 60 * 60 * 24 * 30);

    const envUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://smartklimatentreprenad.com';
    const logoUrl = `${envUrl.replace(/\/$/, '')}/logo.png`;
    const kindLabel = kind === 'handpenning' ? 'Handpenningsfaktura' : 'Slutfaktura';
    const filename = `${kindLabel}-${invoiceNo}.pdf`;

    const html = buildHtml({
      kindLabel,
      invoiceNo,
      customerName: uppdrag.customer_name || 'kund',
      title: uppdrag.title || '',
      logoUrl,
      downloadUrl: signed?.signedUrl,
    });

    const payload: Record<string, unknown> = {
      from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
      reply_to: 'n3prenad@smartklimat.org',
      to: [uppdrag.customer_email],
      cc: [COPY_TO],
      subject: `Faktura ${invoiceNo} – ${uppdrag.title || ''}`.trim(),
      html,
      attachments: [{ filename, content: base64 }],
    };

    const emailResp = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    const emailData = await emailResp.json();
    if (!emailResp.ok) {
      console.error('Resend error', emailData);
      return new Response(JSON.stringify({ error: 'Kunde inte skicka mejl', details: emailData }), {
        status: emailResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sentField = kind === 'handpenning' ? 'handpenning_sent_at' : 'slutfaktura_sent_at';
    await admin.from('uppdrag').update({ [sentField]: new Date().toISOString() }).eq('id', uppdrag_id);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-invoice error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
