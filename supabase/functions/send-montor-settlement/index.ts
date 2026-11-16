// Skickar en utbetalningsspecifikation (UTB-serien) till montörsteamet.
// Personal-JWT (admin eller koordinator, samma som send-montor-debit-invoice).
// PDF:en hämtas från den sparade filen (byggd från de sparade värdena); klienten
// skickar bara settlement_id. Sätter status 'sent' (en betald specifikation behåller
// 'paid'), sent_at och sent_to. På utkastets lokala backend skickas inget mejl.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCoordinator } from '../_shared/auth.ts';
import { settlementPdfName } from '../_shared/pdfNames.ts';
import { isLocalBackend, LOCAL_BACKEND_SKIP } from '../_shared/localBackend.ts';
import { buildSettlementEmailHtml, settlementRecipients, settlementSubject } from './email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireCoordinator(req, corsHeaders);
    if (auth.response) return auth.response;

    const body = await req.json().catch(() => ({}));
    const id = body?.settlement_id;
    if (typeof id !== 'string' || !UUID.test(id)) return json({ error: 'settlement_id krävs' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const { data: s, error: sErr } = await admin.from('montor_settlements').select('*, montor_teams(name, email, invoice_email)').eq('id', id).maybeSingle();
    if (sErr) throw sErr;
    if (!s) return json({ error: 'Utbetalningen hittades inte' }, 404);
    if (s.status === 'cancelled') return json({ error: `${s.settlement_number} är makulerad och skickas inte` }, 409);
    if (!s.pdf_path) return json({ error: 'PDF saknas – skapa PDF:en först' }, 409);

    const recipients = settlementRecipients((s as any).montor_teams ?? {});
    if (!recipients) return json({ error: 'Montörsteamet saknar e-post' }, 400);

    const { count } = await admin.from('montor_settlement_items').select('id', { count: 'exact', head: true })
      .eq('settlement_id', id).eq('item_kind', 'deduction').eq('active', true);

    const { data: blob, error: dlErr } = await admin.storage.from('case-documents').download(s.pdf_path);
    if (dlErr || !blob) throw new Error('PDF:en kunde inte hämtas');
    const pdfBase64 = toBase64(new Uint8Array(await blob.arrayBuffer()));

    const payload = {
      from: 'SmartKlimat N3prenad <n3prenad@smartklimat.org>',
      reply_to: 'n3prenad@smartklimat.org',
      to: recipients.to,
      cc: recipients.cc,
      subject: settlementSubject(s),
      html: buildSettlementEmailHtml(s, (count ?? 0) > 0),
      attachments: [{ filename: settlementPdfName(s), content: pdfBase64 }],
    };

    let skipped: string | undefined;
    if (isLocalBackend()) {
      console.log('[local_backend] mejl skickades inte:', JSON.stringify({ to: payload.to, cc: payload.cc, subject: payload.subject }));
      skipped = LOCAL_BACKEND_SKIP;
    } else {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
      const resp = await fetch(`${GATEWAY_URL}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': RESEND_API_KEY },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        console.error('Resend error', data);
        return json({ error: 'Kunde inte skicka mejl', details: data }, resp.status);
      }
    }

    const sentAt = new Date().toISOString();
    const { error: upErr } = await admin.from('montor_settlements').update({
      status: s.status === 'created' ? 'sent' : s.status,
      sent_at: sentAt,
      sent_to: { to: recipients.to, cc: recipients.cc, at: sentAt, ...(skipped ? { skipped } : {}) },
    }).eq('id', id);
    if (upErr) throw upErr;

    return json({ ok: true, to: recipients.to, ...(skipped ? { skipped } : {}) });
  } catch (e) {
    console.error('send-montor-settlement error', e);
    return json({ error: e instanceof Error ? e.message : 'Okänt fel' }, 500);
  }
});
