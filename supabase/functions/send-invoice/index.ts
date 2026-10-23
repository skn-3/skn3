import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { buildHtml, invoiceEmailData } from './email.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const COPY_TO = 'n3prenad@smartklimat.org';
const ARCHIVE_CC = 'inbox.ver.1638171@arkivplats.se';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
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
    const { uppdrag_id, kind, to } = body || {};
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
    const override = typeof to === 'string' && /.+@.+\..+/.test(to.trim()) ? to.trim() : null;
    const recipient = override || uppdrag.customer_email;
    if (!recipient) return new Response(JSON.stringify({ error: 'Ingen mottagaradress — ange en e-post eller lägg in kundens' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    const { data: offer, error: offerErr } = uppdrag.offer_id
      ? await admin.from('offers').select('offer_number, handpenning_percent, vat_mode').eq('id', uppdrag.offer_id).maybeSingle()
      : { data: null, error: null };
    if (offerErr) throw offerErr;
    const email = invoiceEmailData(uppdrag, offer || {}, kind, invoiceNo);
    const filename = email.attachmentName;
    // Signed URL fallback (30 days), using the same logical name as the attachment.
    const { data: signed } = await admin.storage.from('case-documents').createSignedUrl(pdfPath, 60 * 60 * 24 * 30, { download: filename });
    const envUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://smartklimatentreprenad.com';
    const html = buildHtml({
      ...email,
      logoUrl: `${envUrl.replace(/\/$/, '')}/brand/logo-stamp-vit-n3.png`,
      downloadUrl: signed?.signedUrl,
    });

    const payload: Record<string, unknown> = {
      from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
      reply_to: 'n3prenad@smartklimat.org',
      to: [recipient],
      cc: [COPY_TO, ARCHIVE_CC],
      subject: `${email.kindLabel} ${invoiceNo} – SmartKlimat N3prenad`,
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

    return new Response(JSON.stringify({ ok: true, sent_to: recipient }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-invoice error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
