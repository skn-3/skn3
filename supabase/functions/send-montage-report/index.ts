import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function esc(s: string) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
function sanitizeFilename(s: string) {
  return String(s || '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error('Email credentials missing');

    const auth = await requireStaff(req, corsHeaders);
    if (auth.response) return auth.response;

    const body = await req.json().catch(() => ({}));
    const { case_id, to, note, pdf_base64 } = body || {};
    if (!case_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'case_id och pdf_base64 krävs' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const recipient = typeof to === 'string' && to.includes('@') ? to.trim() : null;
    if (!recipient) {
      return new Response(JSON.stringify({ error: 'Ogiltig mottagaradress' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: c, error } = await admin
      .from('cases')
      .select('id, address, customer_name, order_number, montage_date')
      .eq('id', case_id)
      .maybeSingle();
    if (error || !c) {
      return new Response(JSON.stringify({ error: 'Ärendet hittades inte' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const noteHtml = note && String(note).trim()
      ? `<p style="margin:0 0 12px;white-space:pre-wrap;">${esc(String(note).trim())}</p>`
      : '';

    const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#333;max-width:640px;margin:0 auto;padding:20px;">
  <h2 style="color:#227A4A;margin:0 0 8px;">Montagerapport</h2>
  <p style="margin:0 0 4px;"><strong>${esc(c.address)}</strong></p>
  <p style="margin:0 0 16px;color:#666;font-size:13px;">
    Kund: ${esc(c.customer_name)}${c.order_number ? ` &nbsp;/&nbsp; Ordernr: ${esc(String(c.order_number))}` : ''}${c.montage_date ? ` &nbsp;/&nbsp; Montage: ${esc(c.montage_date)}` : ''}
  </p>
  ${noteHtml}
  <p style="margin:16px 0 0;">Fullständig rapport bifogas som PDF.</p>
  <p style="margin:16px 0 0;color:#666;font-size:12px;">Mvh SmartKlimat N3prenad</p>
</body></html>`;

    const filename = `Montagerapport_${sanitizeFilename(c.address)}.pdf`;
    const res = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
        reply_to: 'n3prenad@smartklimat.org',
        to: [recipient],
        cc: ['daniel@malke.se', 'mf@malke.se'],
        subject: `Montagerapport — ${c.address}`,
        html,
        attachments: [{ filename, content: pdf_base64 }],
      }),
    });
    if (!res.ok) {
      const errData = await res.text().catch(() => '');
      console.error('Montage report email failed:', errData);
      return new Response(JSON.stringify({ error: 'Email send failed', details: errData }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('case_events').insert({
      case_id: c.id,
      event_type: 'notification',
      description: `Montagerapport skickad till ${recipient}`,
      created_by: 'system',
    });

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-montage-report error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
