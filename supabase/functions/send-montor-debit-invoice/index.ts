import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const COPY_TO = ['n3prenad@smartklimat.org', 'daniel@malke.se'];

function esc(s: string) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
function sanitizeFilename(s: string) {
  return String(s || '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
}

function buildHtml(opts: { number: string; customer: string; total: string; vatMode: string; dueDate?: string | null }) {
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="padding:24px 28px 8px;">
<h1 style="margin:0 0 8px;font-size:22px;color:#1f2937;">FAKTURA ${esc(opts.number)}</h1>
<div style="font-size:16px;font-weight:bold;color:#1a1a1a;">${esc(opts.customer)}</div>
</td></tr>
<tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/></td></tr>
<tr><td style="padding:0 28px;">
<p style="margin:8px 0;">Faktura bifogas som PDF. Betalningsvillkor 10 dagar netto.</p>
<p style="margin:8px 0;color:#374151;"><strong>Att betala:</strong> ${esc(opts.total)}${opts.dueDate ? ` &middot; <strong>Förfallodatum:</strong> ${esc(opts.dueDate)}` : ''}</p>
<p style="margin:8px 0;color:#6b7280;font-size:12px;">Moms: ${opts.vatMode === 'vanlig' ? '25%' : 'Omvänd betalningsskyldighet'}</p>
</td></tr>
<tr><td style="padding:0 28px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/></td></tr>
<tr><td style="padding:0 28px 24px;color:#6b7280;font-size:12px;">
Bankgiro 5032-4573 &middot; SmartKlimat N3prenad AB &middot; 559026-6630
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

    const auth = await requireCoordinator(req, corsHeaders);
    if (auth.response) return auth.response;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);


    const body = await req.json().catch(() => ({}));
    const { debit_invoice_id, pdf_base64 } = body || {};
    if (!debit_invoice_id || typeof debit_invoice_id !== 'string') {
      return new Response(JSON.stringify({ error: 'debit_invoice_id krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'pdf_base64 krävs' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: inv, error: iErr } = await admin
      .from('montor_debit_invoices')
      .select('*, montor_teams(*)')
      .eq('id', debit_invoice_id)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!inv) return new Response(JSON.stringify({ error: 'Faktura hittades inte' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const team = (inv as any).montor_teams;
    const recipient = team?.invoice_email || team?.email;
    if (!recipient) return new Response(JSON.stringify({ error: 'Montörsteamet saknar e-post' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const number = String(inv.invoice_number);
    const companySafe = sanitizeFilename(team.company_name || team.name || 'kund');
    const filename = `FAKTURA-${number}-${companySafe}.pdf`;

    const pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
    const pdfPath = `montor-debit/${inv.id}.pdf`;
    await admin.storage.from('case-documents').upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    const totalStr = Math.round(Number(inv.total || 0)).toLocaleString('sv-SE') + ' kr';
    const html = buildHtml({
      number,
      customer: team.company_name || team.name || '',
      total: totalStr,
      vatMode: inv.vat_mode,
      dueDate: inv.due_date,
    });
    const subject = `FAKTURA ${number} — ${team.company_name || team.name || ''}`.trim();

    const payload: Record<string, unknown> = {
      from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
      reply_to: 'n3prenad@smartklimat.org',
      to: [recipient],
      cc: COPY_TO,
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

    await admin.from('montor_debit_invoices').update({
      pdf_path: pdfPath,
      sent_at: new Date().toISOString(),
    }).eq('id', inv.id);

    return new Response(JSON.stringify({ ok: true, pdf_path: pdfPath }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('send-montor-debit-invoice error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
