// ⚠️ SECURITY: internal_* fields (extra_hours, hour_rate, extra_amount) must NEVER
// appear in invoice/credit emails or PDFs sent to montör. This function does not
// read or forward those fields anywhere.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const COPY_TO = 'n3prenad@smartklimat.org';

function esc(s: string) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
function sanitizeFilename(s: string) {
  return String(s || '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
}

function buildHtml(opts: { kind: 'invoice' | 'credit'; number: string; address: string; subNote?: string }) {
  const isCredit = opts.kind === 'credit';
  const color = isCredit ? '#DC2626' : '#22C55E';
  const heading = isCredit ? `KREDITFAKTURA ${esc(opts.number)}` : `FAKTURA ${esc(opts.number)}`;
  const body = isCredit
    ? `<p style="margin:14px 0 0;">${esc(opts.subNote || '')}</p>`
    : `<p style="margin:14px 0 0;">Faktura bifogas som PDF. Betalningsvillkor 10 dagar netto.</p>`;
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="padding:24px 28px 8px;">
<h1 style="margin:0 0 8px;font-size:22px;color:${color};">${heading}</h1>
<div style="font-size:18px;font-weight:bold;color:#1a1a1a;">${esc(opts.address)}</div>
</td></tr>
<tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/></td></tr>
<tr><td style="padding:0 28px;">${body}</td></tr>
<tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/></td></tr>
<tr><td style="padding:0 28px 24px;color:#6b7280;font-size:12px;">
Mvh SmartKlimat N3prenad
</td></tr>
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
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const { a_order_id, pdf_base64, kind, invoice_number, sub_note, storage_subpath } = body || {};
    if (!a_order_id || typeof a_order_id !== 'string') {
      return new Response(JSON.stringify({ error: 'a_order_id krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'pdf_base64 krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const isCredit = kind === 'credit';
    const fileLabel = isCredit ? 'KREDITFAKTURA' : 'FAKTURA';
    const subpath = storage_subpath || (isCredit ? 'kredit' : 'faktura');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: order, error: oErr } = await admin.from('a_orders').select('*, montor_teams(*)').eq('id', a_order_id).maybeSingle();
    if (oErr) throw oErr;
    if (!order) return new Response(JSON.stringify({ error: 'A-order hittades inte' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const team = (order as any).montor_teams;
    if (!order.team_id || !team) return new Response(JSON.stringify({ error: 'Tilldela montör först' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const recipient = team.invoice_email || team.email;
    if (!recipient) return new Response(JSON.stringify({ error: 'Montörsteamet saknar e-post' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const number = String(invoice_number ?? order.invoice_number ?? '');
    const addrSafe = sanitizeFilename(order.customer_address || 'adress');
    const filename = `${fileLabel}-${number}-${addrSafe}.pdf`;

    // Save PDF to storage
    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
    const pdfPath = `a-orders/${order.id}-${subpath}.pdf`;
    await admin.storage.from('case-documents').upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    const html = buildHtml({
      kind: isCredit ? 'credit' : 'invoice',
      number,
      address: order.customer_address || '',
      subNote: sub_note || '',
    });

    const subject = isCredit
      ? `KREDITFAKTURA ${number} — ${order.customer_address || ''}`.trim()
      : `FAKTURA ${number} — ${order.customer_address || ''}`.trim();

    const payload: Record<string, unknown> = {
      from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
      reply_to: 'n3prenad@smartklimat.org',
      to: [recipient],
      cc: [COPY_TO],
      subject,
      html,
      attachments: [{ filename, content: pdf_base64 }],
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

    return new Response(JSON.stringify({ ok: true, pdf_path: pdfPath }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-a-order-invoice error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
