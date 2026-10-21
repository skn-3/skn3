import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';
import { attachmentPdfName } from '../_shared/pdfFilename.ts';
import { offerPdfName } from '../_shared/pdfNames.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const FALLBACK_APP_URL = 'https://smartklimatentreprenad.com';
const isUrl = (s: unknown): s is string => typeof s === 'string' && /^https?:\/\//.test(s);
const MONTHS = 'januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}
const fmtKr = (n: number) => Math.round(Number(n) || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 }) + ' kr';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    const auth = await requireStaff(req, corsHeaders);
    if (auth.response) return auth.response;

    const body = await req.json().catch(() => ({}));
    const { offer_id, pdf_base64, file_name, sent_by, origin } = body || {};
    if (!offer_id || typeof offer_id !== 'string') return json({ error: 'offer_id krävs' }, 400);
    if (!pdf_base64 || typeof pdf_base64 !== 'string') return json({ error: 'pdf_base64 krävs' }, 400);
    if (file_name !== undefined && typeof file_name !== 'string') return json({ error: 'file_name måste vara text' }, 400);
    if (sent_by !== undefined && sent_by !== null && typeof sent_by !== 'string') return json({ error: 'sent_by måste vara text' }, 400);
    if (origin !== undefined && typeof origin !== 'string') return json({ error: 'origin måste vara text' }, 400);
    const sentBy = (typeof sent_by === 'string' ? sent_by.trim() : '').slice(0, 80);
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) return json({ error: 'E-posttjänsten är inte konfigurerad' }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: offer, error: oErr } = await admin.from('offers').select('*').eq('id', offer_id).maybeSingle();
    if (oErr) throw oErr;
    if (!offer) return json({ error: 'Offerten hittades inte' }, 404);
    if (offer.status !== 'accepted') return json({ error: 'Offerten är inte accepterad' }, 400);
    if (!offer.customer_email) return json({ error: 'Kunden saknar e-post' }, 400);

    let pdfBytes: Uint8Array;
    try { pdfBytes = base64ToBytes(pdf_base64); } catch { return json({ error: 'pdf_base64 är ogiltig' }, 400); }
    const pdfPath = `offers/${offer.id}-orderbekraftelse.pdf`;
    const { error: upErr } = await admin.storage.from('case-documents').upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) throw new Error('Kunde inte spara PDF: ' + upErr.message);

    let signedB64: string | null = null;
    if (offer.signed_pdf_path) {
      try {
        const { data, error } = await admin.storage.from('case-documents').download(offer.signed_pdf_path);
        if (error || !data) throw error || new Error('tom fil');
        signedB64 = bytesToBase64(new Uint8Array(await data.arrayBuffer()));
      } catch (e) {
        console.error('Kunde inte hämta signerat avtal', e);
      }
    }

    const nr = offer.offer_number || '—';
    const inclVat = offer.vat_mode !== 'omvand';
    const rotActive = !!offer.rot_enabled && inclVat;
    const orderSum = Number(offer.total_incl_vat || 0);
    const payable = rotActive ? (offer.total_after_rot != null ? Number(offer.total_after_rot) : orderSum - Number(offer.rot_amount || 0)) : orderSum;
    const hpPct = Number(offer.handpenning_percent ?? 25);
    const handpenning = Math.round(orderSum * hpPct / 100);
    const slutfaktura = payable - handpenning;
    const firstName = String(offer.accept_name || offer.customer_name || '').trim().split(/\s+/)[0] || '';
    const terms = String(offer.payment_terms || '').trim();
    const customTerms = !!terms && !/^10\s*dagar\s*netto\.?$/i.test(terms);
    const re = new RegExp(`(?:utför|påbörja|start|planera)[a-zåäö]*[^.\\n]{0,40}?(?:(prelimin[äa]rt|cirka|ca\\.?|omkring)\\s+)?(${MONTHS})\\s+(20\\d{2})`, 'i');
    const pm = `${offer.description || ''}\n${offer.payment_terms || ''}`.match(re);
    const planned = pm ? `${pm[1] ? 'Preliminärt ' : ''}${pm[2].toLowerCase()} ${pm[3]}` : null;
    const signedDate = offer.accepted_at ? new Date(offer.accepted_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: 'long', day: 'numeric' }) : '—';
    const envUrl = Deno.env.get('PUBLIC_APP_URL');
    const base = (isUrl(origin) ? origin : (isUrl(envUrl) ? envUrl! : FALLBACK_APP_URL)).replace(/\/$/, '');
    const logoUrl = `${base}/brand/logo-stamp-vit-n3.png`;
    const offerUrl = `${base}/offert/${offer.public_token}`;
    const payLabel = rotActive ? 'ATT BETALA EFTER PREL. ROT' : inclVat ? 'ATT BETALA INKL. MOMS' : 'ATT BETALA EXKL. MOMS';

    const step = (n: string, title: string, sub: string, done = false) =>
      `<tr><td style="width:40px;vertical-align:top;padding:0 0 12px;"><div style="width:28px;height:28px;border-radius:14px;background:${done ? '#0B3D2E' : '#F6EDD0'};color:${done ? '#fff' : '#8A6A14'};font-size:12px;font-weight:700;line-height:28px;text-align:center;">${done ? '&#10003;' : esc(n)}</div></td><td style="vertical-align:top;padding:3px 0 12px;"><div style="font-size:14.5px;font-weight:700;color:#15211B;">${esc(title)}</div><div style="font-size:13px;color:#5E6B64;">${esc(sub)}</div></td></tr>`;
    const stepsHtml = [
      step('1', 'Avtalet är signerat', `${signedDate} · ` + (hpPct > 0 ? (customTerms ? 'handpenningen faktureras enligt avtalets betalningsvillkor.' : 'handpenningen faktureras i samband med beställningen.') : 'signerat digitalt.'), true),
      step('2', 'Vi planerar arbetet tillsammans', 'En koordinator kontaktar dig inom några arbetsdagar. Behöver något mätas på plats bokar vi ett besök.'),
      step('3', 'Material beställs', 'Vi meddelar dig så snart vi har en leveranstid.'),
      step('4', 'Startdatum bokas', planned ? `${planned}, i samråd med dig.` : 'Tillsammans med dig, när material och hantverkare är klara.'),
      step('5', 'Arbetet utförs', 'Checklistan "Inför arbetsstart" finns i bilagan.'),
      step('6', 'Genomgång, slutfaktura och garanti', `Slutfaktura ${fmtKr(hpPct > 0 ? slutfaktura : payable)} efter utfört arbete${rotActive ? ', med ROT-avdraget draget' : ''}. 3 års garanti på utfört arbete.`),
    ].join('\n');

    const html = `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Orderbekräftelse ${esc(nr)}</title></head>
<body style="margin:0;padding:0;background:#EEECE6;font-family:'Figtree',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#15211B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEECE6;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#082B21;padding:20px 28px;border-bottom:3px solid #DCBE6E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;width:48px;"><img src="${esc(logoUrl)}" alt="SmartKlimat" width="36" height="36" style="display:block;"/></td>
<td style="vertical-align:middle;color:#ffffff;"><div style="font-size:17px;font-weight:700;line-height:1.05;">SmartKlimat</div><div style="font-size:10px;letter-spacing:2px;color:#9FB8AC;margin-top:2px;">N3PRENAD</div></td>
<td align="right" style="vertical-align:middle;"><div style="font-size:10px;letter-spacing:1.8px;font-weight:700;color:#DCBE6E;">ORDERBEKRÄFTELSE</div><div style="font-size:16px;font-weight:700;color:#ffffff;margin-top:2px;">${esc(nr)}</div></td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 0;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.15;color:#15211B;">Tack för din order${firstName ? `, ${esc(firstName)}` : ''}!</h1>
<p style="margin:0 0 12px;">Här kommer din orderbekräftelse för avtal <strong>${esc(nr)}</strong>. I den bifogade PDF:en hittar du en sammanfattning av beställningen och hur processen ser ut steg för steg – från i dag till färdigt arbete.</p>
</td></tr>
<tr><td style="padding:6px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EE;border-radius:12px;"><tr><td style="padding:16px 20px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="width:50%;padding:0 8px 12px 0;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">ORDERNUMMER</div><div style="font-size:15px;font-weight:700;color:#15211B;">${esc(nr)}</div></td>
<td style="width:50%;padding:0 0 12px 8px;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">SIGNERAD</div><div style="font-size:15px;font-weight:700;color:#15211B;">${esc(signedDate)}</div></td>
</tr>
<tr>
<td style="width:50%;padding:0 8px 12px 0;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">PLANERAT UTFÖRANDE</div><div style="font-size:15px;font-weight:700;color:#15211B;">${esc(planned || 'Bokas tillsammans med dig')}</div></td>
<td style="width:50%;padding:0 0 12px 8px;vertical-align:top;"><div style="font-size:10px;letter-spacing:1.3px;font-weight:700;color:#5E6B64;">${payLabel}</div><div style="font-size:15px;font-weight:700;color:#0B3D2E;">${esc(fmtKr(payable))}</div></td>
</tr>
</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EDD0;border-left:3px solid #DCBE6E;border-radius:0 12px 12px 0;"><tr><td style="padding:14px 18px;">
<div style="font-size:15px;font-weight:700;color:#0B3D2E;">Du behöver inte göra något just nu</div>
<div style="font-size:14px;color:#15211B;margin-top:4px;">En koordinator kommer att kontakta dig inom några arbetsdagar för att gå igenom detaljerna och boka in nästa steg. Har du frågor innan dess når du oss på 070-719 72 35 eller n3prenad@smartklimat.org.</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px 28px 0;">
<div style="font-size:11px;letter-spacing:1.5px;font-weight:700;color:#8A6A14;margin-bottom:10px;">SÅ HÄR GÅR DET TILL</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${stepsHtml}
</table>
</td></tr>
<tr><td style="padding:10px 28px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#DCBE6E;border-radius:12px;">
<a href="${esc(offerUrl)}" target="_blank" rel="noopener" style="display:block;padding:16px 24px;color:#15211B;font-weight:700;font-size:16px;text-decoration:none;">Öppna din avtalssida</a>
</td></tr></table>
<p style="margin:10px 0 0;font-size:12.5px;color:#5E6B64;text-align:center;">Där hittar du orderbekräftelsen och det signerade avtalet när du behöver dem.</p>
</td></tr>
<tr><td style="padding:22px 28px 24px;"><p style="margin:0;font-size:14px;">Har du frågor? Svara på det här mejlet eller ring oss på 070-719 72 35.</p></td></tr>
<tr><td style="padding:16px 28px;background:#F5F3EE;"><p style="margin:0;font-size:11.5px;color:#5E6B64;text-align:center;">SmartKlimat N3prenad AB · Org.nr 559026-6630 · Morsstigen 3, 141 71 Segeltorp · n3prenad@smartklimat.org</p></td></tr>
</table></td></tr></table></body></html>`;

    const attachments: { filename: string; content: string }[] = [
      { filename: attachmentPdfName(file_name, `Orderbekraftelse-${offer.offer_number}.pdf`), content: pdf_base64 },
    ];
    if (signedB64) attachments.push({ filename: offerPdfName(offer, 'avtal'), content: signedB64 });

    const emailResp = await fetch(`${GATEWAY_URL}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': RESEND_API_KEY },
      body: JSON.stringify({
        from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
        to: [offer.customer_email],
        reply_to: 'n3prenad@smartklimat.org',
        bcc: ['n3prenad@smartklimat.org'],
        subject: `Orderbekräftelse ${nr} – SmartKlimat N3prenad`,
        html,
        attachments,
      }),
    });
    const emailData = await emailResp.json().catch(() => ({}));
    if (!emailResp.ok) {
      console.error('Resend error', emailData);
      return json({ error: 'Kunde inte skicka mejl', details: emailData }, emailResp.status);
    }

    const { error: updErr } = await admin.from('offers').update({
      confirmation_pdf_path: pdfPath,
      confirmation_sent_at: new Date().toISOString(),
      confirmation_sent_by: sentBy || null,
      confirmation_sent_to: offer.customer_email,
    }).eq('id', offer.id);
    if (updErr) console.error('offer update failed', updErr);
    if (offer.case_id) {
      const { error: evErr } = await admin.from('case_events').insert({
        case_id: offer.case_id, event_type: 'notification',
        description: `Orderbekräftelse ${nr} skickad till ${offer.customer_email}`,
        created_by: sentBy || 'CaseFlow',
      });
      if (evErr) console.error('case_event failed', evErr);
    }

    return json({ ok: true, pdf_path: pdfPath, sent_to: offer.customer_email });
  } catch (e) {
    console.error('send-order-confirmation error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
