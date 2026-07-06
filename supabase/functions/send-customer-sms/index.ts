import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STATUS_BASE = 'https://smartklimatentreprenad.com/status';
const SMS_FROM = 'N3prenad'; // alfanumerisk avsändare, max 11 tecken

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Normalisera svenska nummer till E.164 (+46...)
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-()]/g, '');
  if (p.startsWith('+46')) return /^\+46\d{7,10}$/.test(p) ? p : null;
  if (p.startsWith('0046')) p = '+46' + p.slice(4);
  else if (p.startsWith('46') && p.length >= 10) p = '+' + p;
  else if (p.startsWith('0')) p = '+46' + p.slice(1);
  else return null;
  return /^\+46\d{7,10}$/.test(p) ? p : null;
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const ELKS_USER = Deno.env.get('ELKS_API_USERNAME');
    const ELKS_PASS = Deno.env.get('ELKS_API_PASSWORD');
    if (!ELKS_USER || !ELKS_PASS) return json({ error: 'SMS-uppgifter saknas (ELKS_API_USERNAME/PASSWORD)' }, 500);

    // Auth: personal-JWT ELLER cron-secret (nattliga påminnelser)
    const cronSecret = Deno.env.get('BACKUP_TRIGGER_SECRET');
    const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
    if (!isCron) {
      const auth = await requireStaff(req, corsHeaders);
      if (auth.response) return auth.response;
    }

    const body = await req.json().catch(() => ({}));
    const caseId = body?.case_id;
    const kind = body?.kind;
    if (!caseId || !['montage_bokat', 'montage_paminnelse'].includes(kind)) {
      return json({ error: 'case_id och kind (montage_bokat|montage_paminnelse) krävs' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: c, error } = await admin
      .from('cases')
      .select('id, customer_name, customer_phone, address, montage_date, montage_time, public_token')
      .eq('id', caseId)
      .maybeSingle();
    if (error || !c) return json({ error: 'Ärendet hittades inte' }, 404);

    const to = normalizePhone(c.customer_phone);
    if (!to) return json({ skipped: 'no_valid_phone' });

    const firstName = (c.customer_name || '').split(' ')[0];
    const timeTxt = c.montage_time ? ` kl ${String(c.montage_time).slice(0, 5)}` : '';
    const url = `${STATUS_BASE}/${c.public_token}`;

    let message = '';
    if (kind === 'montage_bokat') {
      const dateTxt = c.montage_date ? ` ${fmtDate(c.montage_date)}` : '';
      message = `Hej ${firstName}! Ert fönstermontage på ${c.address} är bokat${dateTxt}${timeTxt}. Följ ert ärende: ${url} Frågor? Ring 070-719 72 35. Hälsningar N3prenad, på uppdrag av Mockfjärds Fönster.`;
    } else {
      message = `Påminnelse: imorgon${timeTxt} monterar vi era fönster på ${c.address}. Plocka gärna undan gardiner och möbler närmast fönstren. ${url} /N3prenad, på uppdrag av Mockfjärds Fönster`;
    }

    const smsRes = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${ELKS_USER}:${ELKS_PASS}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ from: SMS_FROM, to, message }),
    });
    if (!smsRes.ok) {
      const errText = await smsRes.text();
      console.error('46elks error:', smsRes.status, errText);
      return json({ error: `SMS misslyckades (${smsRes.status})` }, 502);
    }

    await admin.from('case_events').insert({
      case_id: c.id,
      event_type: 'notification',
      description: kind === 'montage_bokat'
        ? `SMS till kund: montage bokat (${to})`
        : `SMS till kund: påminnelse montage imorgon (${to})`,
      created_by: 'system',
    });

    return json({ sent: true });
  } catch (e) {
    console.error('send-customer-sms error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
