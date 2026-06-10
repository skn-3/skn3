import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function fmtKr(n: number | null | undefined): string {
  const v = Number(n || 0);
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
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
    const { token, name, signed_pdf_base64 } = body || {};
    if (!token || typeof token !== 'string' || token.length < 16) {
      return new Response(JSON.stringify({ error: 'Ogiltig länk' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: offer, error: ofErr } = await admin.from('offers').select('*').eq('public_token', token).maybeSingle();
    if (ofErr || !offer) {
      return new Response(JSON.stringify({ error: 'Offerten hittades inte' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Lazy expiry: offer valid through end of valid_until day
    if (offer.status === 'sent' && offer.valid_until) {
      const end = new Date(offer.valid_until);
      end.setHours(23, 59, 59, 999);
      if (Date.now() > end.getTime()) {
        await admin.from('offers').update({ status: 'expired' }).eq('id', offer.id);
        return new Response(JSON.stringify({ ok: true, expired: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Idempotent: if not in 'sent' state, return current state without changes
    if (offer.status !== 'sent') {
      return new Response(JSON.stringify({
        ok: true,
        already: true,
        status: offer.status,
        accept_name: offer.accept_name,
        accepted_at: offer.accepted_at,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    const xff = req.headers.get('x-forwarded-for') || '';
    const ip = (xff.split(',')[0] || '').trim() || req.headers.get('cf-connecting-ip') || null;
    const ua = req.headers.get('user-agent') || null;

    const acceptName = (typeof name === 'string' && name.trim()) ? name.trim() : (offer.customer_name || 'Kund');
    const acceptedAt = new Date().toISOString();

    const updates: Record<string, unknown> = {
      accept_name: acceptName,
      accepted_at: acceptedAt,
      accept_ip: ip,
      accept_user_agent: ua,
      status: 'accepted',
    };

    // Upload signed PDF (non-blocking)
    if (signed_pdf_base64 && typeof signed_pdf_base64 === 'string') {
      try {
        const bytes = decodeBase64(signed_pdf_base64);
        const path = `offers/${offer.id}-signed.pdf`;
        const { error: upErr } = await admin.storage.from('case-documents').upload(path, bytes, {
          contentType: 'application/pdf',
          upsert: true,
        });
        if (upErr) {
          console.error('signed pdf upload failed', upErr);
        } else {
          updates.signed_pdf_path = path;
        }
      } catch (e) {
        console.error('signed pdf decode/upload exception', e);
      }
    }

    const { error: updErr } = await admin.from('offers').update(updates).eq('id', offer.id);
    if (updErr) throw updErr;

    // Send notification emails (non-blocking errors)
    if (LOVABLE_API_KEY && RESEND_API_KEY) {
      const offerNumber = offer.offer_number || '—';
      const amountValue = offer.rot_enabled && offer.total_after_rot != null ? offer.total_after_rot : offer.total_incl_vat;
      const amountStr = fmtKr(amountValue);
      const acceptedFmt = new Date(acceptedAt).toLocaleString('sv-SE');

      const customerHtml = `<!DOCTYPE html><html lang="sv"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#22C55E;padding:20px 28px;color:#fff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;">Tack ${acceptName}!</h1>
<p style="margin:0 0 12px;">Vi har tagit emot din accept av offert <strong>${offerNumber}</strong>.</p>
<p style="margin:0 0 12px;">Bekräftelse: ${acceptedFmt}</p>
<p style="margin:0 0 12px;">Vi återkommer inom kort med nästa steg. Har du frågor, svara på detta mejl eller ring 070-719 72 35.</p>
<p style="margin:24px 0 0;color:#6b7280;font-size:12px;">SmartKlimat N3prenad AB · n3prenad@smartklimat.org</p>
</td></tr></table></td></tr></table></body></html>`;

      const internalHtml = `<!DOCTYPE html><html lang="sv"><body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<h2 style="color:#15803D;">Offert ${offerNumber} accepterad</h2>
<table cellpadding="6" style="border-collapse:collapse;">
<tr><td style="color:#6b7280;">Kund</td><td><strong>${offer.customer_name || '—'}</strong></td></tr>
<tr><td style="color:#6b7280;">Accepterad av</td><td>${acceptName}</td></tr>
<tr><td style="color:#6b7280;">E-post</td><td>${offer.customer_email || '—'}</td></tr>
<tr><td style="color:#6b7280;">Telefon</td><td>${offer.customer_phone || '—'}</td></tr>
<tr><td style="color:#6b7280;">Belopp</td><td><strong>${amountStr}</strong>${offer.rot_enabled ? ' (efter ROT)' : ''}</td></tr>
<tr><td style="color:#6b7280;">Datum/tid</td><td>${acceptedFmt}</td></tr>
<tr><td style="color:#6b7280;">IP</td><td>${ip || '—'}</td></tr>
</table></body></html>`;

      const sendMail = async (to: string, subject: string, html: string) => {
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
              to: [to],
              subject,
              html,
            }),
          });
          if (!r.ok) console.error('mail failed', to, await r.text());
        } catch (e) {
          console.error('mail exception', to, e);
        }
      };

      if (offer.customer_email) {
        await sendMail(offer.customer_email, `Din offert ${offerNumber} är accepterad`, customerHtml);
      }
      await sendMail('n3prenad@smartklimat.org', `Offert ${offerNumber} accepterad av ${acceptName}`, internalHtml);
    }

    return new Response(JSON.stringify({ ok: true, accepted_at: acceptedAt, accept_name: acceptName }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('accept-offer error', e);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
