import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const APP_URL = 'https://id-preview--6c43e886-ddf2-476f-9c1f-255522ad4ec0.lovable.app';
const LOGO_URL = `${APP_URL}/logo.png`;

const EMAIL_MAP: Record<string, string> = {
  'GVMO': 'gvmo.bygg@gmail.com',
  'Samy': 'info@smtmbygg.se',
  'Alex NBD': 'alex@nbdentreprenad.com',
  'Jerk': 'jerk.ryttman@mockfjards.se',
  'Villaspecialisten': 'Edvin@villaspecialisten.se',
  'Daniel Malke': 'daniel.malke@mockfjards.se',
  'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
};
const COORDINATOR_EMAIL = 'mirna.malke@mockfjards.se';
const COORDINATOR_CC = 'mf@malke.se';

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function buildCtaButton(text: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 16px 0;">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;border-radius:6px;">${text}</a>
</td></tr>
</table>`;
}

function wrapInTemplate(heading: string, bodyContent: string, ctaButton?: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${heading}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background-color:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="vertical-align:middle;width:40px;"><img src="${LOGO_URL}" alt="SmartKlimat" width="36" height="36" style="display:block;border-radius:50%;background:#ffffff;padding:3px;" /></td>
<td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:28px 28px 8px 28px;"><h1 style="margin:0;font-size:22px;font-weight:bold;color:#1a1a1a;">${heading}</h1></td></tr>
<tr><td style="padding:8px 28px 20px 28px;">${bodyContent}</td></tr>
${ctaButton ? `<tr><td style="padding:0 28px 8px 28px;">${ctaButton}</td></tr>` : ''}
<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Detta mail skickades automatiskt från SmartKlimat ärendehantering</p></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildListTable(headers: string[], rows: string[][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
<tr>${headers.map(h => `<th style="text-align:left;padding:8px 6px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">${h}</th>`).join('')}</tr>
${rows.map(row => `<tr>${row.map(c => `<td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;">${c}</td>`).join('')}</tr>`).join('')}
</table>`;
}

async function sendEmail(
  lovableKey: string,
  resendKey: string,
  to: string | string[],
  subject: string,
  html: string,
  cc?: string
) {
  const payload: Record<string, unknown> = {
    from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (cc) payload.cc = [cc];

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': resendKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Email send error:', JSON.stringify(data));
    throw new Error(`Email failed [${res.status}]`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: string[] = [];

  try {
    // ===================== PÅMINNELSE 1: Obokade KM (montör) =====================
    {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: cases } = await supabase
        .from('cases')
        .select('*')
        .eq('status', 'vantar_km')
        .lt('created_at', sevenDaysAgo);

      if (cases && cases.length > 0) {
        const grouped: Record<string, typeof cases> = {};
        for (const c of cases) {
          const team = c.team || 'Ej tilldelad';
          if (!grouped[team]) grouped[team] = [];
          grouped[team].push(c);
        }

        for (const [montor, items] of Object.entries(grouped)) {
          const email = EMAIL_MAP[montor];
          if (!email) continue;

          const rows = items.map(c => [
            c.address,
            c.customer_name,
            c.customer_phone,
            `${daysSince(c.created_at)} dagar`,
          ]);

          const table = buildListTable(['Adress', 'Kund', 'Telefon', 'Dagar sedan tilldelad'], rows);
          const html = wrapInTemplate(
            `PÅMINNELSE — Obokade kontrollmätningar`,
            `<p style="margin:0 0 16px 0;">Hej ${montor}! Du har <strong>${items.length}</strong> ärende(n) som väntar på kontrollmätning:</p>${table}`,
            buildCtaButton('Öppna appen och boka KM', '#22C55E')
          );

          await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, email, 'PÅMINNELSE — Obokade kontrollmätningar', html);

          // Log events
          for (const c of items) {
            await supabase.from('case_events').insert({
              case_id: c.id,
              event_type: 'reminder',
              description: `Påminnelse skickad till ${montor}: Obokad KM`,
              created_by: 'system',
            });
          }
          results.push(`Reminder 1: Sent to ${montor} (${items.length} cases)`);
        }
      }
    }

    // ===================== PÅMINNELSE 2: Återkoppla kund (säljare) =====================
    {
      const { data: visits } = await supabase
        .from('visits')
        .select('*')
        .eq('result', 'aterkoppla')
        .eq('lost', false);

      if (visits && visits.length > 0) {
        const now = Date.now();
        const toRemind = visits.filter(v => {
          if (!v.follow_up_date) return false;
          const daysPast = Math.floor((now - new Date(v.follow_up_date).getTime()) / (1000 * 60 * 60 * 24));
          return daysPast >= 7;
        });

        if (toRemind.length > 0) {
          const grouped: Record<string, typeof toRemind> = {};
          for (const v of toRemind) {
            if (!grouped[v.seller]) grouped[v.seller] = [];
            grouped[v.seller].push(v);
          }

          for (const [seller, items] of Object.entries(grouped)) {
            const email = EMAIL_MAP[seller];
            if (!email) continue;

            const rows = items.map(v => [
              v.address,
              v.customer_name,
              v.date,
              `${daysSince(v.follow_up_date!)} dagar`,
            ]);

            const table = buildListTable(['Adress', 'Kund', 'Besöksdatum', 'Dagar sedan uppföljning'], rows);
            const html = wrapInTemplate(
              `PÅMINNELSE — Kunder att återkoppla`,
              `<p style="margin:0 0 16px 0;">Hej ${seller}! Du har <strong>${items.length}</strong> kund(er) att återkoppla:</p>${table}`,
              buildCtaButton('Öppna appen', '#2563EB')
            );

            await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, email, 'PÅMINNELSE — Kunder att återkoppla', html);
            results.push(`Reminder 2: Sent to ${seller} (${items.length} visits)`);
          }
        }
      }
    }

    // ===================== PÅMINNELSE 3: Olösta reklamationer (montör) =====================
    {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: devs } = await supabase
        .from('deviations')
        .select('*, cases!deviations_case_id_fkey(address, team)')
        .eq('resolved', false)
        .lt('created_at', sevenDaysAgo);

      if (devs && devs.length > 0) {
        // Filter: send at 7, 14, 21 days (reminder_count 0, 1, 2)
        const eligible = devs.filter(d => {
          const days = daysSince(d.created_at);
          const rc = d.reminder_count || 0;
          if (rc === 0 && days >= 7) return true;
          if (rc === 1 && days >= 14) return true;
          if (rc === 2 && days >= 21) return true;
          return false;
        });

        if (eligible.length > 0) {
          const grouped: Record<string, typeof eligible> = {};
          for (const d of eligible) {
            const caseInfo = d.cases as any;
            const team = caseInfo?.team || 'Okänd';
            if (!grouped[team]) grouped[team] = [];
            grouped[team].push(d);
          }

          for (const [montor, items] of Object.entries(grouped)) {
            const email = EMAIL_MAP[montor];
            if (!email) continue;

            const rows = items.map(d => {
              const caseInfo = d.cases as any;
              return [
                caseInfo?.address || '—',
                d.type,
                d.description.substring(0, 60),
                `${daysSince(d.created_at)} dagar`,
              ];
            });

            const table = buildListTable(['Adress', 'Typ', 'Beskrivning', 'Dagar sedan skapad'], rows);
            const html = wrapInTemplate(
              `PÅMINNELSE — Olösta reklamationer (${items.length} st)`,
              `<p style="margin:0 0 16px 0;">Hej ${montor}! Du har <strong>${items.length}</strong> olöst(a) reklamation(er):</p>${table}`,
              buildCtaButton('Visa reklamationer', '#F97316')
            );

            await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, email, `PÅMINNELSE — Olösta reklamationer (${items.length} st)`, html);

            // Update reminder_count
            for (const d of items) {
              await supabase
                .from('deviations')
                .update({ reminder_count: (d.reminder_count || 0) + 1 })
                .eq('id', d.id);

              // Log in case_events
              await supabase.from('case_events').insert({
                case_id: d.case_id,
                event_type: 'reminder',
                description: `Påminnelse skickad till ${montor}: Olöst reklamation`,
                created_by: 'system',
              });
            }
            results.push(`Reminder 3: Sent to ${montor} (${items.length} deviations)`);
          }
        }
      }
    }

    // ===================== PÅMINNELSE 4: Ärenden som fastnat (koordinator) =====================
    {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const { data: stuckCases } = await supabase
        .from('cases')
        .select('*')
        .not('status', 'in', '("montage_klart","fakturerad","pausad")')
        .lt('updated_at', tenDaysAgo);

      if (stuckCases && stuckCases.length > 0) {
        const rows = stuckCases.map(c => [
          c.address,
          c.status,
          c.team || '—',
          c.seller,
          `${daysSince(c.updated_at)} dagar`,
        ]);

        const table = buildListTable(['Adress', 'Status', 'Montör', 'Säljare', 'Dagar utan aktivitet'], rows);
        const html = wrapInTemplate(
          `VARNING — ${stuckCases.length} ärenden har legat still i 10+ dagar`,
          `<p style="margin:0 0 16px 0;">Följande ärenden har inte uppdaterats på över 10 dagar:</p>${table}`,
          buildCtaButton('Öppna appen', '#DC2626')
        );

        await sendEmail(
          LOVABLE_API_KEY,
          RESEND_API_KEY,
          COORDINATOR_EMAIL,
          `VARNING — ${stuckCases.length} ärenden har legat still i 10+ dagar`,
          html,
          COORDINATOR_CC
        );

        for (const c of stuckCases) {
          await supabase.from('case_events').insert({
            case_id: c.id,
            event_type: 'reminder',
            description: `Varning: Ärende har legat still i ${daysSince(c.updated_at)} dagar`,
            created_by: 'system',
          });
        }
        results.push(`Reminder 4: Sent coordinator warning (${stuckCases.length} cases)`);
      }
    }

    console.log('Daily reminders completed:', results);
    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('daily-reminders error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
