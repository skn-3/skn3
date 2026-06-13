import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const APP_URL = 'https://id-preview--6c43e886-ddf2-476f-9c1f-255522ad4ec0.lovable.app';
const LOGO_URL = `${APP_URL}/logo.png`;

// Recipients — HARD-CODED, do NOT change to admin/montor lists
const TO_EMAIL = 'mirna.malke@mockfjards.se';
const CC_EMAIL = 'daniel@malke.se';
const GLOBAL_CC = 'mf@malke.se';

// n3prenad orders-gateway (RLS låst — vi måste gå via gatewayen med delad secret)
const ORDERS_GATEWAY_URL = 'https://pjurpgqgqvabopoxkzja.supabase.co/functions/v1/orders-gateway';

const RELEVANT_STATUSES = new Set(['godkand', 'i_produktion', 'leverans_klar', 'montage_bokat']);

// ---------- Date helpers (ISO week) ----------

function getISOWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

// Monday of given ISO week (local time)
function isoWeekMonday(year: number, week: number): Date {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay() || 7;
  const monday = new Date(simple);
  monday.setDate(simple.getDate() - (dow - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addWeeks(iso: { year: number; week: number }, delta: number): { year: number; week: number } {
  const monday = isoWeekMonday(iso.year, iso.week);
  monday.setDate(monday.getDate() + delta * 7);
  return getISOWeek(monday);
}

function weekRange(year: number, week: number): { start: Date; end: Date; startStr: string; endStr: string } {
  const start = isoWeekMonday(year, week);
  const end = new Date(start);
  end.setDate(end.getDate() + 7); // exclusive upper bound (next Monday)
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start, end, startStr: fmt(start), endStr: fmt(end) };
}

// ---------- Formatting ----------

function formatSEK(n: number): string {
  return n.toLocaleString('sv-SE');
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} msek`;
  return `${formatSEK(Math.round(n))} kr`;
}

function montageSize(orderValue: number): { label: string; color: string } {
  if (orderValue < 50_000) return { label: 'Litet', color: '#22C55E' };
  if (orderValue <= 150_000) return { label: 'Medel', color: '#EAB308' };
  return { label: 'Stort', color: '#F97316' };
}

// ---------- HTML helpers (same look as weekly-summary) ----------

function wrapInTemplate(heading: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${heading}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
<tr><td style="background-color:#22C55E;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="vertical-align:middle;width:40px;"><img src="${LOGO_URL}" alt="SmartKlimat" width="36" height="36" style="display:block;border-radius:50%;background:#ffffff;padding:3px;" /></td>
<td style="vertical-align:middle;padding-left:12px;color:#ffffff;font-size:20px;font-weight:bold;">SmartKlimat N3prenad</td>
</tr></table></td></tr>
<tr><td style="padding:28px 28px 8px 28px;"><h1 style="margin:0;font-size:22px;font-weight:bold;color:#1a1a1a;">${heading}</h1></td></tr>
<tr><td style="padding:8px 28px 20px 28px;">${bodyContent}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Detta mail skickades automatiskt från SmartKlimat ärendehantering</p></td></tr>
</table></td></tr></table></body></html>`;
}

function sectionHeading(text: string, color = '#22C55E'): string {
  return `<h2 style="margin:24px 0 8px 0;font-size:16px;font-weight:bold;color:#1a1a1a;border-bottom:2px solid ${color};padding-bottom:4px;">${text}</h2>`;
}

function badge(text: string, bg: string, fg = '#ffffff'): string {
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;margin-right:4px;">${text}</span>`;
}

function caseUrl(id: string): string {
  return `${APP_URL}/?case=${id}`;
}

// ---------- Email send ----------

async function sendEmail(lovableKey: string, resendKey: string, subject: string, html: string) {
  const ccList = Array.from(new Set([CC_EMAIL, GLOBAL_CC].filter(Boolean)));
  const payload = {
    from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
    to: [TO_EMAIL],
    cc: ccList,
    subject,
    html,
  };
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
    console.error('Email error:', JSON.stringify(data));
    throw new Error(`Email failed [${res.status}]`);
  }
  return data;
}

// ---------- Core ----------

type CaseRow = Record<string, any>;

function deliveryInWeek(c: CaseRow, year: number, week: number, range: { startStr: string; endStr: string }): boolean {
  if (c.delivery_week && c.delivery_year) {
    return Number(c.delivery_week) === week && Number(c.delivery_year) === year;
  }
  if (c.delivery_date) {
    return c.delivery_date >= range.startStr && c.delivery_date < range.endStr;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const CRON_SECRET = Deno.env.get('BACKUP_TRIGGER_SECRET');
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Missing API keys' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const ORDERS_GATEWAY_SECRET = Deno.env.get('ORDERS_GATEWAY_SECRET');

  try {
    const now = new Date();
    const current = getISOWeek(now);
    const nextWk = addWeeks(current, 1);
    const followingWk = addWeeks(current, 2);
    const nextRange = weekRange(nextWk.year, nextWk.week);
    const followingRange = weekRange(followingWk.year, followingWk.week);

    // Fetch cases
    const { data: allCases = [], error: casesErr } = await supabase
      .from('cases')
      .select('*')
      .in('status', Array.from(RELEVANT_STATUSES));
    if (casesErr) throw casesErr;

    const nextWeekCases = (allCases || []).filter(c => deliveryInWeek(c, nextWk.year, nextWk.week, nextRange));
    const followingWeekCases = (allCases || []).filter(c => deliveryInWeek(c, followingWk.year, followingWk.week, followingRange));

    // A-order status from n3prenad — graceful fallback via gateway
    let orderUnknown = false;
    const orderedCaseIds = new Set<string>();
    try {
      if (!ORDERS_GATEWAY_SECRET) throw new Error('ORDERS_GATEWAY_SECRET saknas');
      const ids = [...new Set([...nextWeekCases, ...followingWeekCases].map(c => c.id))];
      if (ids.length > 0) {
        const res = await fetch(ORDERS_GATEWAY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-gateway-secret': ORDERS_GATEWAY_SECRET,
          },
          body: JSON.stringify({ action: 'list_by_case_ids', case_ids: ids }),
        });
        if (!res.ok) throw new Error(`gateway ${res.status}`);
        const json = await res.json();
        const orders = Array.isArray(json) ? json : (json?.data ?? json?.orders ?? []);
        for (const o of orders) {
          if (o?.case_id) orderedCaseIds.add(o.case_id);
        }
      }
    } catch (e) {
      console.warn('n3prenad gateway fetch failed, marking A-order status as unknown:', e);
      orderUnknown = true;
    }

    const hasOrder = (id: string): 'yes' | 'no' | 'unknown' =>
      orderUnknown ? 'unknown' : (orderedCaseIds.has(id) ? 'yes' : 'no');

    // ---------- Summary numbers ----------
    const totalValue = nextWeekCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
    const missingOrder = orderUnknown ? 0 : nextWeekCases.filter(c => !orderedCaseIds.has(c.id)).length;
    const missingTeam = nextWeekCases.filter(c => !c.team).length;

    // ---------- Section 1: needs action ----------
    // Action needed: missing team, missing A-order, OR scheduled_delivery without time
    const needsTime = (c: CaseRow) => c.scheduled_delivery && !c.delivery_time;
    const actionCases = nextWeekCases.filter(c =>
      !c.team || (!orderUnknown && !orderedCaseIds.has(c.id)) || needsTime(c)
    );
    const missingTime = nextWeekCases.filter(needsTime).length;

    let body = '';

    // Summary box
    body += `<div style="background:#f0fdf4;border:1px solid #22C55E;border-radius:8px;padding:14px 16px;margin-bottom:8px;font-size:14px;">
      <strong>${nextWeekCases.length}</strong> leveranser nästa vecka ·
      Totalt ordervärde <strong>${formatMoney(totalValue)}</strong> ·
      <span style="color:${missingOrder > 0 ? '#DC2626' : '#1a1a1a'};">${orderUnknown ? '?' : missingOrder} saknar A-order</span> ·
      <span style="color:${missingTeam > 0 ? '#DC2626' : '#1a1a1a'};">${missingTeam} saknar montör</span> ·
      <span style="color:${missingTime > 0 ? '#DC2626' : '#1a1a1a'};">${missingTime} tidsstyrd utan tid</span>
      ${orderUnknown ? '<div style="margin-top:6px;font-size:12px;color:#92400e;">⚠ Kunde inte hämta A-order-status från n3prenad — markerad som okänd.</div>' : ''}
    </div>`;

    if (actionCases.length > 0) {
      body += sectionHeading(`⚠ Kräver åtgärd (${actionCases.length})`, '#DC2626');
      body += actionCases.map(c => {
        const missing: string[] = [];
        if (!orderUnknown && !orderedCaseIds.has(c.id)) {
          // TODO: when n3prenad supports a deep-link to OrderForm prefilled by case_id,
          // point this link there instead. For now, the caseflow detail panel surfaces
          // the existing n3prenad connection.
          missing.push(`<a href="${caseUrl(c.id)}" style="color:#DC2626;font-weight:600;text-decoration:underline;">Skapa A-order →</a>`);
        }
        if (!c.team) {
          missing.push(`<a href="${caseUrl(c.id)}" style="color:#DC2626;font-weight:600;text-decoration:underline;">Tilldela montör →</a>`);
        }
        if (needsTime(c)) {
          missing.push(`<a href="${caseUrl(c.id)}" style="color:#DC2626;font-weight:700;text-decoration:underline;">🕐 Tidsstyrd — TID MÅSTE ANGES — Ange tid →</a>`);
        }
        return `<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:12px;margin-bottom:8px;">
          <div style="font-weight:bold;color:#1a1a1a;">${c.address}${c.city ? `, ${c.city}` : ''}</div>
          <div style="font-size:13px;color:#4b5563;margin-top:2px;">${c.customer_name} · ${c.customer_phone || '—'}</div>
          <div style="font-size:13px;color:#4b5563;margin-top:2px;">Ordervärde: ${formatMoney(Number(c.order_value) || 0)}</div>
          <div style="margin-top:8px;font-size:13px;display:flex;flex-direction:column;gap:4px;">${missing.join('<br/>')}</div>
        </div>`;
      }).join('');
    }

    // ---------- Section 2: per montor for next week ----------
    body += sectionHeading(`Leveranser nästa vecka (v${nextWk.week})`);

    const byTeam = new Map<string, CaseRow[]>();
    for (const c of nextWeekCases) {
      const key = c.team || '__none__';
      if (!byTeam.has(key)) byTeam.set(key, []);
      byTeam.get(key)!.push(c);
    }
    // Stable order: named teams alphabetically, then "Ingen montör"
    const teamKeys = Array.from(byTeam.keys()).filter(k => k !== '__none__').sort();
    if (byTeam.has('__none__')) teamKeys.push('__none__');

    if (nextWeekCases.length === 0) {
      body += `<p style="margin:8px 0;color:#6b7280;">Inga leveranser planerade nästa vecka.</p>`;
    } else {
      for (const key of teamKeys) {
        const teamLabel = key === '__none__' ? 'Ingen montör tilldelad' : key;
        const list = byTeam.get(key)!;
        body += `<h3 style="margin:18px 0 6px 0;font-size:14px;color:#22C55E;">${teamLabel} (${list.length})</h3>`;
        body += list.map(c => {
          const size = montageSize(Number(c.order_value) || 0);
          const extra = (c.extra_hours_sold || 0) > 0 ? ` +${c.extra_hours_sold}h extra` : '';
          const ord = hasOrder(c.id);
          const ordBadge = ord === 'yes'
            ? badge('✓ A-order', '#22C55E')
            : ord === 'no'
              ? badge('⚠ A-order saknas', '#DC2626')
              : badge('A-order okänd', '#9ca3af');
          const extras: string[] = [];
          if (c.scheduled_delivery) {
            if (c.delivery_time) {
              extras.push(badge(`🕐 Tidsstyrd — kl ${String(c.delivery_time).slice(0, 5)}`, '#F97316'));
            } else {
              extras.push(badge('🕐 Tidsstyrd — TID MÅSTE ANGES', '#DC2626'));
            }
          }
          if (c.carry_help_needed) extras.push(badge('💪 Bärhjälp', '#EAB308'));
          if (c.media_consent) extras.push(badge('📷 Foto OK', '#3B82F6'));
          return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">
            <div style="font-weight:bold;color:#1a1a1a;">${c.address}${c.city ? `, ${c.city}` : ''}</div>
            <div style="font-size:13px;color:#4b5563;margin-top:2px;">${c.customer_name} · ${c.customer_phone || '—'}</div>
            <div style="font-size:13px;color:#4b5563;margin-top:4px;">
              ${formatMoney(Number(c.order_value) || 0)} · ${badge(size.label + extra, size.color)}
            </div>
            <div style="margin-top:8px;">${ordBadge}${extras.join('')}</div>
            <div style="margin-top:8px;"><a href="${caseUrl(c.id)}" style="color:#22C55E;font-weight:600;text-decoration:none;">Öppna ärende →</a></div>
          </div>`;
        }).join('');
      }
    }

    // ---------- Section 3: heads-up for week after ----------
    body += sectionHeading(`🔭 Förvarning: vecka ${followingWk.week}`);
    if (followingWeekCases.length === 0) {
      body += `<p style="margin:8px 0;color:#6b7280;">Inga leveranser planerade vecka ${followingWk.week}.</p>`;
    } else {
      const rows = followingWeekCases.map(c => {
        const ord = hasOrder(c.id);
        const ordStr = ord === 'yes' ? '✓' : ord === 'no' ? '⚠ nej' : '?';
        return `<tr>
          <td style="padding:6px 6px;border-bottom:1px solid #f0f0f0;">${c.address}${c.city ? `, ${c.city}` : ''}</td>
          <td style="padding:6px 6px;border-bottom:1px solid #f0f0f0;">${c.team || '—'}</td>
          <td style="padding:6px 6px;border-bottom:1px solid #f0f0f0;">${formatMoney(Number(c.order_value) || 0)}</td>
          <td style="padding:6px 6px;border-bottom:1px solid #f0f0f0;text-align:center;">${ordStr}</td>
        </tr>`;
      }).join('');
      body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-top:6px;">
        <tr>
          <th style="text-align:left;padding:6px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Adress</th>
          <th style="text-align:left;padding:6px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Montör</th>
          <th style="text-align:left;padding:6px;border-bottom:2px solid #e5e7eb;color:#6b7280;">Värde</th>
          <th style="text-align:center;padding:6px;border-bottom:2px solid #e5e7eb;color:#6b7280;">A-order</th>
        </tr>${rows}</table>`;
    }

    const subject = `📦 Leveranser vecka ${nextWk.week} — ${nextWeekCases.length} montage`;
    const html = wrapInTemplate(subject, body);
    await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, subject, html);

    return new Response(JSON.stringify({
      ok: true,
      week: nextWk.week,
      nextWeekCount: nextWeekCases.length,
      followingWeekCount: followingWeekCases.length,
      missingOrder,
      missingTeam,
      orderUnknown,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('upcoming-deliveries failed:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
