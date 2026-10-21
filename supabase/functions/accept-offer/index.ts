import { createClient } from 'npm:@supabase/supabase-js@2';
import { offerPdfName } from '../_shared/pdfNames.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const FALLBACK_APP_URL = 'https://smartklimatentreprenad.com';
const isUrl = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\//.test(s);

function fmtKr(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const { token, name, signed_pdf_base64, origin } = body || {};
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
      const inclVat = offer.vat_mode !== 'omvand';
      const rotActive = !!offer.rot_enabled && inclVat;
      const orderSum = Number(offer.total_incl_vat || 0);
      const payable = rotActive ? (offer.total_after_rot != null ? Number(offer.total_after_rot) : orderSum - Number(offer.rot_amount || 0)) : orderSum;
      const amountStr = fmtKr(payable);
      const amountNote = rotActive ? 'efter preliminärt ROT-avdrag' : inclVat ? 'inkl. moms' : 'exkl. moms, omvänd byggmoms';
      // Samma räkneregel som offerCalc.ts: handpenning på ordersumman före ROT
      const handpenningPct = Number(offer.handpenning_percent ?? 25);
      const handpenning = Math.round(orderSum * handpenningPct / 100);
      const slutfaktura = payable - handpenning;
      const acceptedFmt = new Date(acceptedAt).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const envUrl = Deno.env.get('PUBLIC_APP_URL');
      const base = (isUrl(origin) ? origin : (isUrl(envUrl) ? envUrl! : FALLBACK_APP_URL)).replace(/\/$/, '');
      const offerUrl = `${base}/offert/${offer.public_token}`;
      const logoUrl = `${base}/brand/logo-stamp-vit-n3.png`;
      const sellerName = (offer.created_by as string | null) || null;
      const firstName = acceptName.split(/\s+/)[0] || acceptName;

      const customTerms = !!offer.payment_terms && !/^10\s*dagar\s*netto\.?$/i.test(String(offer.payment_terms).trim());
      const row = (label: string, value: string, big = false, sub?: string) => {
        const subHtml = sub ? `<div style="font-size:12px;color:#8A8F89;">${sub}</div>` : '';
        const va = sub ? 'top' : 'middle';
        return big
          ? `<tr><td style="padding:10px 0;border-top:1px solid #E3E1DA;color:#5E6B64;font-size:14px;vertical-align:middle;">${esc(label)}${subHtml}</td><td align="right" style="padding:10px 0;border-top:1px solid #E3E1DA;font-size:22px;font-weight:700;color:#0B3D2E;white-space:nowrap;vertical-align:${va};">${esc(value)}</td></tr>`
          : `<tr><td style="padding:7px 0;border-top:1px solid #E3E1DA;color:#5E6B64;font-size:14px;">${esc(label)}${subHtml}</td><td align="right" style="padding:7px 0;border-top:1px solid #E3E1DA;font-size:14px;color:#15211B;white-space:nowrap;${sub ? 'vertical-align:top;' : ''}">${esc(value)}</td></tr>`;
      };
      const rowsHtml = [
        row(`Att betala ${amountNote}`, amountStr, true),
        ...(handpenningPct > 0 ? [
          row(`Handpenning ${handpenningPct} %`, fmtKr(handpenning), false, customTerms ? esc(offer.payment_terms) : 'Faktureras i samband med beställningen'),
          row('Slutfaktura', fmtKr(slutfaktura), false, 'Efter utfört arbete' + (rotActive ? ' · ROT-avdraget dras här' : '')),
        ] : []),
        row('Signerad', acceptedFmt),
      ].join('');
      const step = (n: string, title: string, sub: string, done = false) =>
        `<tr><td style="width:40px;vertical-align:top;padding:0 0 14px;"><div style="width:28px;height:28px;border-radius:14px;background:${done ? '#0B3D2E' : '#F6EDD0'};color:${done ? '#fff' : '#8A6A14'};font-size:12px;font-weight:700;line-height:28px;text-align:center;">${done ? '&#10003;' : esc(n)}</div></td><td style="vertical-align:top;padding:3px 0 14px;"><div style="font-size:14.5px;font-weight:700;color:#15211B;">${esc(title)}</div><div style="font-size:13px;color:#5E6B64;">${esc(sub)}</div></td></tr>`;

      const customerHtml = `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Avtal ${esc(offerNumber)} signerat</title></head>
<body style="margin:0;padding:0;background:#EEECE6;font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#15211B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEECE6;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#082B21;padding:20px 28px;border-bottom:3px solid #DCBE6E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:48px;"><img src="${esc(logoUrl)}" alt="SmartKlimat" width="36" height="36" style="display:block;"/></td>
<td style="vertical-align:middle;color:#ffffff;"><div style="font-size:17px;font-weight:700;line-height:1.05;">SmartKlimat</div><div style="font-size:10px;letter-spacing:2px;color:#9FB8AC;margin-top:2px;">N3PRENAD</div></td>
<td align="right" style="vertical-align:middle;"><div style="font-size:10px;letter-spacing:1.8px;font-weight:700;color:#DCBE6E;">AVTAL SIGNERAT</div><div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:2px;">${esc(offerNumber)}</div></td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 0;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.15;color:#15211B;">Tack ${esc(firstName)}, avtalet är signerat</h1>
<p style="margin:0 0 12px;">Vi har tagit emot din signering av avtal <strong>${esc(offerNumber)}</strong>${offer.title ? ` – ${esc(offer.title)}` : ''}. Det signerade avtalet med signeringsverifikat är bifogat och finns även på din avtalssida. Spara gärna en kopia.</p>
</td></tr>
<tr><td style="padding:6px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EE;border-radius:12px;"><tr><td style="padding:18px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rowsHtml}</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#DCBE6E;border-radius:12px;">
<a href="${esc(offerUrl)}" target="_blank" rel="noopener" style="display:block;padding:16px 24px;color:#15211B;font-weight:700;font-size:16px;text-decoration:none;">Öppna ditt signerade avtal</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 28px 0;">
<div style="font-size:11px;letter-spacing:1.5px;font-weight:700;color:#8A6A14;margin-bottom:10px;">VAD HÄNDER NU</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${step('1', 'Avtalet är signerat', `${acceptedFmt} · signerat digitalt`, true)}
${step('2', 'Orderbekräftelse på väg', 'Inom kort får du en orderbekräftelse med hela processen steg för steg, från i dag till färdigt arbete.')}
${step('3', 'En koordinator kontaktar dig', 'Vi går igenom detaljerna i beställningen och bokar in nästa steg tillsammans med dig.')}
</table>
</td></tr>
<tr><td style="padding:6px 28px 24px;"><p style="margin:0;font-size:14px;">Har du frågor? Svara på det här mejlet eller ring oss på 070-719 72 35.</p></td></tr>
<tr><td style="padding:16px 28px;background:#F5F3EE;"><p style="margin:0;font-size:11.5px;color:#5E6B64;text-align:center;">SmartKlimat N3prenad AB · Org.nr 559026-6630 · Morsstigen 3, 141 71 Segeltorp · n3prenad@smartklimat.org</p></td></tr>
</table></td></tr></table></body></html>`;

      const internalHtml = `<!DOCTYPE html><html lang="sv"><body style="margin:0;padding:24px;background:#F5F3EE;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#15211B;">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#082B21;color:#fff;padding:14px 20px;font-size:16px;font-weight:700;border-bottom:3px solid #DCBE6E;">Offert ${esc(offerNumber)} accepterad</td></tr>
<tr><td style="padding:18px 20px;">
<table cellpadding="6" style="border-collapse:collapse;">
<tr><td style="color:#5E6B64;">Kund</td><td><strong>${esc(offer.customer_name || '—')}</strong></td></tr>
<tr><td style="color:#5E6B64;">Adress</td><td>${esc(offer.customer_address || '—')}</td></tr>
<tr><td style="color:#5E6B64;">Accepterad av</td><td>${esc(acceptName)}</td></tr>
<tr><td style="color:#5E6B64;">E-post</td><td>${esc(offer.customer_email || '—')}</td></tr>
<tr><td style="color:#5E6B64;">Telefon</td><td>${esc(offer.customer_phone || '—')}</td></tr>
<tr><td style="color:#5E6B64;">Belopp</td><td><strong>${esc(amountStr)}</strong> (${esc(amountNote)})</td></tr>
${handpenningPct > 0 ? `<tr><td style="color:#5E6B64;">Handpenning</td><td>${esc(fmtKr(handpenning))} (${handpenningPct} %)</td></tr>` : ''}
<tr><td style="color:#5E6B64;">Säljare</td><td>${esc(sellerName || '—')}</td></tr>
<tr><td style="color:#5E6B64;">Datum/tid</td><td>${esc(acceptedFmt)}</td></tr>
<tr><td style="color:#5E6B64;">IP</td><td>${esc(ip || '—')}</td></tr>
</table>
<p style="margin:16px 0 0;"><a href="${esc(offerUrl)}" style="display:inline-block;background:#0B3D2E;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700;">Öppna avtalet</a></p>
<p style="margin:12px 0 0;font-size:13px;color:#5E6B64;">Nästa steg: skicka orderbekräftelsen från CaseFlow (Offerter → Orderbekräftelse).</p>
</td></tr></table></body></html>`;

      const SELLER_EMAIL_MAP: Record<string, string> = {
        'Daniel Malke': 'daniel@smartklimat.org',
        'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
      };
      const sellerEmail = offer.created_by ? SELLER_EMAIL_MAP[offer.created_by as string] : undefined;

      const sendMail = async (to: string | string[], subject: string, html: string, cc?: string[], attachments?: { filename: string; content: string }[]) => {
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
              to: Array.isArray(to) ? to : [to],
              ...(cc && cc.length ? { cc } : {}),
              subject,
              html,
              ...(attachments && attachments.length ? { attachments } : {}),
            }),
          });
          if (!r.ok) console.error('mail failed', to, await r.text());
        } catch (e) {
          console.error('mail exception', to, e);
        }
      };

      if (offer.customer_email) {
        const atts = signed_pdf_base64 && typeof signed_pdf_base64 === 'string' ? [{ filename: offerPdfName(offer, 'avtal'), content: signed_pdf_base64 }] : undefined;
        await sendMail(offer.customer_email, `Tack ${firstName} – avtal ${offerNumber} är signerat`, customerHtml, undefined, atts);
      }
      const internalTo = ['n3prenad@smartklimat.org', ...(sellerEmail ? [sellerEmail] : [])];
      await sendMail(internalTo, `Offert ${offerNumber} accepterad av ${acceptName}`, internalHtml, ['daniel@malke.se']);
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
