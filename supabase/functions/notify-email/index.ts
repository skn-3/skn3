import { MAIL_LINK_BASE_URL } from '../_shared/mailLinks.ts';
import { buildCtaButton, wrapInTemplate } from '../_shared/mailLayout.ts';
import { sendMail } from '../_shared/sendMail.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


function buildInfoTable(rows: Array<{ label: string; value: string; badge?: { color: string; bg: string } }>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${rows.map(r => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">${r.label}</td>
<td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#1a1a1a;vertical-align:top;">${
  r.badge 
    ? `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600;background-color:${r.badge.bg};color:${r.badge.color};">${r.value}</span>`
    : r.value
}</td>
</tr>`).join('\n')}
</table>`;
}

// Map heading keywords to CTA button config
function getCtaForHeading(heading: string): string | null {
  const h = heading.toLowerCase();
  if (h.includes('tilldelad en kontrollmätning') || h.includes('tilldelad ett montage'))
    return buildCtaButton('Öppna ärendet i appen', '#22C55E');
  if (h.includes('nytt ärende') || h.includes('tilldelat'))
    return buildCtaButton('Öppna appen och boka KM', '#22C55E');
  if (h.includes('km klar') && h.includes('extra'))
    return buildCtaButton('Granska extra timmar-begäran', '#DC2626');
  if (h.includes('km klar'))
    return buildCtaButton('Öppna appen och granska KM', '#22C55E');
  if (h.includes('montage bokat'))
    return buildCtaButton('Visa ärende i appen', '#22C55E');
  if (h.includes('montage klart'))
    return buildCtaButton('Markera som fakturerad', '#22C55E');
  if (h.includes('reklamation') || h.includes('avvikelse'))
    return buildCtaButton('Visa reklamation', '#F97316');
  return null;
}

import { requireCoordinator, requireAuth } from '../_shared/auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { wastePickupEmail, type WastePickupCase } from './wastePickupEmail.ts';
import { COORDINATOR_TO, MAIL_CC, teamEmailResolver } from '../_shared/mailRecipients.ts';
import {
  isMontorTemplate, findFreshEvent, recipientsFor, buildMontorEmail, FRESH_EVENT_MS,
  MAIL_CASE_FIELDS, MAIL_EVENT_FIELDS, MAIL_DEVIATION_FIELDS,
  type MontorTemplate, type MailCase, type MailEvent, type MailDeviation,
} from './montorEmails.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WASTE_FIELDS = 'id,address,customer_name,team,waste_pickup_requested_by,waste_pickup_note,waste_pickup_earliest,waste_pickup_requested_at';

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/**
 * Fast mall för "Skräp redo att hämtas". Får anropas av alla inloggade (även montörer),
 * men mottagare och innehåll byggs här från ärendet som anroparen själv får läsa (RLS),
 * och bara när en färsk begäran finns. Övriga anrop kräver koordinator/admin som tidigare.
 */
async function handleWastePickup(req: Request, payload: Record<string, unknown>): Promise<Response> {
  const auth = await requireAuth(req, corsHeaders);
  if (auth.response) return auth.response;
  const caseId = typeof payload.case_id === 'string' ? payload.case_id : '';
  if (!UUID_RE.test(caseId)) return json(400, { error: 'Ogiltigt ärende' });

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  });
  const { data, error } = await userClient.from('cases_montor').select(WASTE_FIELDS).eq('id', caseId).maybeSingle();
  if (error) return json(500, { error: 'Ärendet kunde inte läsas' });
  if (!data) return json(404, { error: 'Ärendet finns inte' });
  const c = data as WastePickupCase;
  const requestedAt = c.waste_pickup_requested_at ? new Date(c.waste_pickup_requested_at).getTime() : 0;
  if (!requestedAt || Date.now() - requestedAt > 15 * 60 * 1000) return json(409, { error: 'Ingen aktuell begäran om hämtning' });

  const mail = wastePickupEmail(c, MAIL_LINK_BASE_URL);
  return await sendEmail({
    to: [COORDINATOR_TO],
    subject: mail.subject,
    html: wrapInTemplate(mail.heading, mail.body),
  });
}

/**
 * Fasta mallar för flöden som montörer utlöser (montage klart, delrapport, KM, avvikelse,
 * egen bokning). Alla inloggade får anropa, men ärendet läses med anroparens JWT (RLS),
 * en färsk händelse av rätt typ skapad av anroparen krävs, och mottagare och innehåll
 * byggs här. Klienten kan inte påverka adress eller text.
 */
async function handleMontorTemplate(req: Request, template: MontorTemplate, payload: Record<string, unknown>): Promise<Response> {
  const auth = await requireAuth(req, corsHeaders);
  if (auth.response) return auth.response;
  const caseId = typeof payload.case_id === 'string' ? payload.case_id : '';
  if (!UUID_RE.test(caseId)) return json(400, { error: 'Ogiltigt ärende' });
  const deviationId = typeof payload.deviation_id === 'string' ? payload.deviation_id : null;
  if (template === 'avvikelse_rapporterad' && !(deviationId && UUID_RE.test(deviationId))) return json(400, { error: 'Ogiltig avvikelse' });

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  });
  const { data: profile } = await userClient.from('profiles').select('name').eq('id', auth.userId).maybeSingle();
  const callerName = (profile?.name as string | undefined) ?? '';
  if (!callerName) return json(403, { error: 'Profil saknas' });

  const { data: c, error: caseErr } = await userClient.from('cases_montor').select(MAIL_CASE_FIELDS).eq('id', caseId).maybeSingle();
  if (caseErr) return json(500, { error: 'Ärendet kunde inte läsas' });
  if (!c) return json(404, { error: 'Ärendet finns inte' });

  const since = new Date(Date.now() - FRESH_EVENT_MS).toISOString();
  const { data: evs, error: evErr } = await userClient.from('case_events').select(MAIL_EVENT_FIELDS)
    .eq('case_id', caseId).eq('created_by', callerName).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(50);
  if (evErr) return json(500, { error: 'Händelser kunde inte läsas' });
  const events = (evs ?? []) as MailEvent[];
  const event = findFreshEvent(template, events, callerName, Date.now(), deviationId, payload.images_only === true);
  if (!event) return json(409, { error: 'Ingen aktuell händelse för mejlet' });

  let deviation: MailDeviation | null = null;
  if (template === 'avvikelse_rapporterad') {
    const { data: d } = await userClient.from('deviations').select(MAIL_DEVIATION_FIELDS).eq('id', deviationId!).eq('case_id', caseId).maybeSingle();
    if (!d) return json(404, { error: 'Avvikelsen finns inte' });
    deviation = d as MailDeviation;
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: teamRows } = await admin.from('montor_teams').select('name,email');
  const to = recipientsFor(template, c as MailCase, teamEmailResolver(teamRows));
  if (!to) return json(200, { success: true, skipped: true, reason: 'Ingen känd mottagare' });
  const mail = buildMontorEmail({ template, c: c as MailCase, event, events, deviation, baseUrl: MAIL_LINK_BASE_URL });
  return await sendEmail({ to, cc: [MAIL_CC], subject: mail.subject, html: wrapInTemplate(mail.heading, mail.body) });
}

async function sendEmail(input: { to: string[]; cc?: string[]; subject: string; html: string }): Promise<Response> {
  const res = await sendMail(input);
  if (!res.ok) return json(res.status, { error: `Email send failed [${res.status}]`, details: res.data });
  if (res.skipped) return json(200, { skipped: res.skipped });
  return json(200, { success: true, to: input.to, data: res.data });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return json(400, { error: 'Invalid JSON body' });
    if (payload.template === 'waste_pickup_requested') return await handleWastePickup(req, payload);
    if (isMontorTemplate(payload.template)) return await handleMontorTemplate(req, payload.template, payload);
    if (payload.template !== undefined) return json(400, { error: 'Okänd mall' });

    const auth = await requireCoordinator(req, corsHeaders);
    if (auth.response) return auth.response;

    const { to, cc, subject, body, heading, rows, callToAction } = payload;

    if (!to || !subject) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectiveHeading = heading || subject;
    const ctaButton = getCtaForHeading(effectiveHeading);

    let html: string;
    if (rows && Array.isArray(rows)) {
      const tableHtml = buildInfoTable(rows);
      html = wrapInTemplate(effectiveHeading, tableHtml, callToAction, ctaButton ?? undefined);
    } else if (body) {
      html = wrapInTemplate(effectiveHeading, body, callToAction, ctaButton ?? undefined);
    } else {
      return new Response(JSON.stringify({ error: 'Missing body or rows' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingCc = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    return await sendEmail({ to: Array.isArray(to) ? to : [to], cc: existingCc, subject, html });
  } catch (error) {
    console.error('notify-email error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
