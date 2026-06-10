import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function isExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  const end = new Date(validUntil);
  end.setHours(23, 59, 59, 999);
  return Date.now() > end.getTime();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { token, name, reason } = body || {};
    if (!token || typeof token !== 'string' || token.length < 16) {
      return new Response(JSON.stringify({ error: 'Ogiltig länk' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: offer, error: ofErr } = await admin.from('offers').select('*').eq('public_token', token).maybeSingle();
    if (ofErr || !offer) {
      return new Response(JSON.stringify({ error: 'Offerten hittades inte' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Lazy expiry
    if (offer.status === 'sent' && isExpired(offer.valid_until)) {
      await admin.from('offers').update({ status: 'expired' }).eq('id', offer.id);
      return new Response(JSON.stringify({ ok: true, expired: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (offer.status !== 'sent') {
      return new Response(JSON.stringify({
        ok: true,
        already: true,
        status: offer.status,
        declined_at: offer.declined_at,
        decline_name: offer.decline_name,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const declineName = (typeof name === 'string' && name.trim()) ? name.trim() : null;
    const declineReason = (typeof reason === 'string' && reason.trim()) ? reason.trim() : null;
    const declinedAt = new Date().toISOString();

    const { error: updErr } = await admin.from('offers').update({
      status: 'declined',
      declined_at: declinedAt,
      decline_name: declineName,
      decline_reason: declineReason,
    }).eq('id', offer.id);
    if (updErr) throw updErr;

    // Internal-only notification
    if (LOVABLE_API_KEY && RESEND_API_KEY) {
      const offerNumber = offer.offer_number || '—';
      const customerName = offer.customer_name || '—';
      const html = `<!DOCTYPE html><html lang="sv"><body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<h2>Offert ${escapeHtml(offerNumber)} avböjd</h2>
<table cellpadding="6" style="border-collapse:collapse;">
<tr><td style="color:#6b7280;">Kund</td><td><strong>${escapeHtml(customerName)}</strong></td></tr>
<tr><td style="color:#6b7280;">Avböjd av</td><td>${escapeHtml(declineName || '—')}</td></tr>
<tr><td style="color:#6b7280;">E-post</td><td>${escapeHtml(offer.customer_email || '—')}</td></tr>
<tr><td style="color:#6b7280;">Telefon</td><td>${escapeHtml(offer.customer_phone || '—')}</td></tr>
<tr><td style="color:#6b7280;">Datum/tid</td><td>${escapeHtml(new Date(declinedAt).toLocaleString('sv-SE'))}</td></tr>
<tr><td style="color:#6b7280;vertical-align:top;">Orsak</td><td>${declineReason ? escapeHtml(declineReason).replace(/\n/g, '<br>') : '<em>(ingen angiven)</em>'}</td></tr>
</table></body></html>`;

      try {
        const r = await fetch(`${GATEWAY_URL}/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
            reply_to: 'n3prenad@smartklimat.org',
            to: ['n3prenad@smartklimat.org'],
            subject: `Offert ${offerNumber} avböjd – ${customerName}`,
            html,
          }),
        });
        if (!r.ok) console.error('decline mail failed', await r.text());
      } catch (e) {
        console.error('decline mail exception', e);
      }
    }

    return new Response(JSON.stringify({ ok: true, status: 'declined', declined_at: declinedAt, decline_name: declineName }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('decline-offer error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
