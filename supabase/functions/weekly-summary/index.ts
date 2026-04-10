import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
const APP_URL = 'https://id-preview--6c43e886-ddf2-476f-9c1f-255522ad4ec0.lovable.app';
const LOGO_URL = `${APP_URL}/logo.png`;
const HOUR_RATE = 469;
const MONTHLY_BUDGET = 2_000_000;
const YEARLY_BUDGET = 55_000_000;

const EMAIL_MAP: Record<string, string> = {
  'GVMO': 'johannes@malke.se',
  'Samy': 'johannes@malke.se',
  'Alex NBD': 'johannes@malke.se',
  'Jerk': 'johannes@malke.se',
  'Daniel Malke': 'johannes@malke.se',
  'Gabriel Hanna': 'johannes@malke.se',
};
const SELLERS = ['Daniel Malke', 'Gabriel Hanna'];
const MONTORS = ['GVMO', 'Samy', 'Alex NBD', 'Jerk'];
const ADMIN_EMAILS = ['johannes@malke.se']; // TEST: daniel.malke@mockfjards.se
const ADMIN_CC = 'johannes@malke.se'; // TEST: mf@malke.se

function getWeekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - onejan.getTime()) / 86400000);
  return Math.ceil((days + onejan.getDay() + 1) / 7);
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(diff);
  return m;
}

function getPrevMonday(monday: Date): Date {
  const prev = new Date(monday);
  prev.setDate(prev.getDate() - 7);
  return prev;
}

function formatSEK(n: number): string {
  return n.toLocaleString('sv-SE');
}

function monthName(d: Date): string {
  return d.toLocaleDateString('sv-SE', { month: 'long' });
}

function progressBar(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = pct >= 50 ? '#22C55E' : pct >= 25 ? '#EAB308' : '#DC2626';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">
<tr><td style="background:#e5e7eb;border-radius:6px;height:18px;width:100%;position:relative;">
<div style="background:${color};border-radius:6px;height:18px;width:${clamped}%;max-width:100%;"></div>
</td><td style="padding-left:8px;font-size:13px;font-weight:bold;color:${color};white-space:nowrap;">${Math.round(pct)}%</td></tr>
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
</tr></table></td></tr>
<tr><td style="padding:28px 28px 8px 28px;"><h1 style="margin:0;font-size:22px;font-weight:bold;color:#1a1a1a;">${heading}</h1></td></tr>
<tr><td style="padding:8px 28px 20px 28px;">${bodyContent}</td></tr>
${ctaButton ? `<tr><td style="padding:0 28px 8px 28px;">${ctaButton}</td></tr>` : ''}
<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f0;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Detta mail skickades automatiskt från SmartKlimat ärendehantering</p></td></tr>
</table></td></tr></table></body></html>`;
}

function buildTable(headers: string[], rows: string[][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
<tr>${headers.map(h => `<th style="text-align:left;padding:8px 6px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600;">${h}</th>`).join('')}</tr>
${rows.map(row => `<tr>${row.map(c => `<td style="padding:8px 6px;border-bottom:1px solid #f0f0f0;">${c}</td>`).join('')}</tr>`).join('')}
</table>`;
}

function kpiRow(label: string, value: string): string {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b7280;font-size:14px;width:220px;">${label}</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;font-weight:600;color:#1a1a1a;">${value}</td></tr>`;
}

function kpiTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.map(([l, v]) => kpiRow(l, v)).join('')}</table>`;
}

function sectionHeading(text: string): string {
  return `<h2 style="margin:24px 0 8px 0;font-size:16px;font-weight:bold;color:#1a1a1a;border-bottom:2px solid #22C55E;padding-bottom:4px;">${text}</h2>`;
}

async function sendEmail(
  lovableKey: string, resendKey: string,
  to: string | string[], subject: string, html: string, cc?: string
) {
  const payload: Record<string, unknown> = {
    from: 'SmartKlimat N3prenad <noreply@smartklimat.org>',
    to: Array.isArray(to) ? to : [to],
    subject, html,
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
  if (!res.ok) { console.error('Email error:', JSON.stringify(data)); throw new Error(`Email failed [${res.status}]`); }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) throw new Error('Missing API keys');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const results: string[] = [];

  try {
    const now = new Date();
    const weekNum = getWeekNumber(now);
    const thisMonday = getMonday(now);
    const thisFriday = new Date(thisMonday); thisFriday.setDate(thisMonday.getDate() + 5);
    const prevMonday = getPrevMonday(thisMonday);
    const prevFriday = new Date(prevMonday); prevFriday.setDate(prevMonday.getDate() + 5);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const wkStart = thisMonday.toISOString();
    const wkEnd = thisFriday.toISOString();
    const prevStart = prevMonday.toISOString();
    const prevEnd = prevFriday.toISOString();
    const mStart = monthStart.toISOString();
    const yStart = yearStart.toISOString();

    // Fetch all data
    const [casesRes, visitsRes, devsRes, eventsRes] = await Promise.all([
      supabase.from('cases').select('*'),
      supabase.from('visits').select('*'),
      supabase.from('deviations').select('*'),
      supabase.from('case_events').select('*'),
    ]);
    const allCases = casesRes.data || [];
    const allVisits = visitsRes.data || [];
    const allDevs = devsRes.data || [];
    const allEvents = eventsRes.data || [];

    // Helper filters
    const inRange = (d: string, s: string, e: string) => d >= s && d < e;
    const weekCases = allCases.filter(c => inRange(c.created_at, wkStart, wkEnd));
    const prevWeekCases = allCases.filter(c => inRange(c.created_at, prevStart, prevEnd));
    const weekVisits = allVisits.filter(v => inRange(v.date, wkStart.slice(0, 10), wkEnd.slice(0, 10)));
    const prevWeekVisits = allVisits.filter(v => inRange(v.date, prevStart.slice(0, 10), prevEnd.slice(0, 10)));
    const monthCases = allCases.filter(c => c.created_at >= mStart);
    const ytdCases = allCases.filter(c => c.created_at >= yStart);
    const weekDevs = allDevs.filter(d => inRange(d.created_at, wkStart, wkEnd));
    const unresolvedDevs = allDevs.filter(d => !d.resolved);

    // Week events for montage/KM tracking
    const weekEvents = allEvents.filter(e => inRange(e.created_at, wkStart, wkEnd));

    // ===================== MAIL 1: Per säljare =====================
    for (const seller of SELLERS) {
      const email = EMAIL_MAP[seller];
      if (!email) continue;

      const myCases = weekCases.filter(c => c.seller === seller);
      const myPrevCases = prevWeekCases.filter(c => c.seller === seller);
      const myVisits = weekVisits.filter(v => v.seller === seller);
      const myMonthCases = monthCases.filter(c => c.seller === seller);
      const signedVisits = myVisits.filter(v => v.result === 'signerat');
      const hitRate = myVisits.length > 0 ? Math.round((signedVisits.length / myVisits.length) * 100) : 0;

      const weekValue = myCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
      const prevValue = myPrevCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
      const changeStr = prevValue > 0
        ? `${weekValue >= prevValue ? '+' : ''}${Math.round(((weekValue - prevValue) / prevValue) * 100)}%`
        : 'N/A (ingen data förra veckan)';
      const changeColor = weekValue >= prevValue ? '#22C55E' : '#DC2626';

      const monthValue = myMonthCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
      const monthPct = Math.round((monthValue / MONTHLY_BUDGET) * 100);

      const activePipeline = allCases.filter(c => c.seller === seller && !['fakturerad', 'montage_klart', 'pausad'].includes(c.status));

      const body = kpiTable([
        ['Nya ärenden denna vecka', `${myCases.length} st`],
        ['Ordervärde signerat', `${formatSEK(weekValue)} kr`],
        ['Jämfört med förra veckan', `<span style="color:${changeColor};font-weight:bold;">${changeStr}</span>`],
        ['Antal besök', `${myVisits.length} st`],
        ['Hit rate', `${hitRate}%`],
        ['Aktiva ärenden i pipeline', `${activePipeline.length} st`],
      ]) + sectionHeading('Månadsbudget') +
        `<p style="margin:4px 0;font-size:14px;">Du ligger på <strong>${formatSEK(monthValue)} kr</strong> av ${formatSEK(MONTHLY_BUDGET)} kr för ${monthName(now)}</p>` +
        progressBar(monthPct);

      const html = wrapInTemplate(`Din veckorapport — v.${weekNum}`, `<p style="margin:0 0 16px 0;">Hej ${seller.split(' ')[0]}, här är din vecka:</p>${body}`);
      await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, email, `SmartKlimat — Din veckorapport v.${weekNum}`, html);
      results.push(`Seller report: ${seller}`);
    }

    // ===================== MAIL 2: Per montör =====================
    for (const montor of MONTORS) {
      const email = EMAIL_MAP[montor];
      if (!email) continue;

      const montageEvents = weekEvents.filter(e => e.event_type === 'status_change' && e.description.includes('montage_klart'));
      const montorCases = allCases.filter(c => c.team === montor);
      const montorCaseIds = new Set(montorCases.map(c => c.id));
      const myMontage = montageEvents.filter(e => montorCaseIds.has(e.case_id));

      const kmEvents = weekEvents.filter(e => e.event_type === 'status_change' && e.description.includes('km_klar'));
      const myKm = kmEvents.filter(e => montorCaseIds.has(e.case_id));

      const myWeekDevs = weekDevs.filter(d => montorCaseIds.has(d.case_id));
      const myUnresolved = unresolvedDevs.filter(d => montorCaseIds.has(d.case_id));

      const weekExtraHours = montorCases
        .filter(c => inRange(c.created_at, wkStart, wkEnd) || weekEvents.some(e => e.case_id === c.id))
        .reduce((s, c) => s + (c.extra_hours_requested || 0), 0);

      const body = kpiTable([
        ['Montage utförda', `${myMontage.length} st`],
        ['KM utförda', `${myKm.length} st`],
        ['Nya reklamationer/avvikelser', `${myWeekDevs.length} st`],
        ['Olösta reklamationer totalt', `${myUnresolved.length} st`],
        ['Extra timmar begärda denna vecka', `${weekExtraHours} st`],
      ]);

      const html = wrapInTemplate(`Din veckorapport — v.${weekNum}`, `<p style="margin:0 0 16px 0;">Hej ${montor}, här är din vecka:</p>${body}`);
      await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, email, `SmartKlimat — Din veckorapport v.${weekNum}`, html);
      results.push(`Montor report: ${montor}`);
    }

    // ===================== MAIL 3: Admin/Koordinator =====================
    {
      const totalWeekValue = weekCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
      const totalVisits = weekVisits.length;
      const totalSigned = weekVisits.filter(v => v.result === 'signerat').length;
      const totalHitRate = totalVisits > 0 ? Math.round((totalSigned / totalVisits) * 100) : 0;

      // Per seller table
      const sellerRows = SELLERS.map(seller => {
        const sc = weekCases.filter(c => c.seller === seller);
        const sv = weekVisits.filter(v => v.seller === seller);
        const signed = sv.filter(v => v.result === 'signerat');
        const val = sc.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
        const hr = sv.length > 0 ? `${Math.round((signed.length / sv.length) * 100)}%` : '—';
        return [seller, `${sc.length}`, `${formatSEK(val)} kr`, `${sv.length}`, hr];
      });

      // Montage count
      const allMontageEvents = weekEvents.filter(e => e.event_type === 'status_change' && e.description.includes('montage_klart'));
      const allKmEvents = weekEvents.filter(e => e.event_type === 'status_change' && e.description.includes('km_klar'));

      // Per montor table
      const montorRows = MONTORS.map(m => {
        const mCases = allCases.filter(c => c.team === m);
        const mIds = new Set(mCases.map(c => c.id));
        const montage = allMontageEvents.filter(e => mIds.has(e.case_id)).length;
        const km = allKmEvents.filter(e => mIds.has(e.case_id)).length;
        const devs = weekDevs.filter(d => mIds.has(d.case_id)).length;
        return [m, `${montage}`, `${km}`, `${devs}`];
      });

      // Deviations
      const totalDevCost = unresolvedDevs.reduce((s, d) => s + (Number(d.cost) || 0), 0);

      // Extra hours
      const totalRequested = allCases.reduce((s, c) => s + (c.extra_hours_requested || 0), 0);
      const totalApproved = allCases.reduce((s, c) => s + (c.extra_hours_approved || 0), 0);

      // Pipeline status count
      const statusCount: Record<string, number> = {};
      for (const c of allCases) {
        if (!['fakturerad'].includes(c.status)) {
          statusCount[c.status] = (statusCount[c.status] || 0) + 1;
        }
      }
      const STATUS_LABELS: Record<string, string> = {
        ny: 'Ny', vantar_km: 'Väntar KM', km_bokad: 'KM bokad', km_klar: 'KM klar',
        vantar_godkannande: 'Väntar godkännande', godkand: 'Godkänd', i_produktion: 'I produktion',
        leverans_klar: 'Leverans klar', montage_bokat: 'Montage bokat', montage_klart: 'Montage klart',
        fakturerad: 'Fakturerad', pausad: 'Pausad',
      };
      const pipelineRows = Object.entries(statusCount)
        .sort(([, a], [, b]) => b - a)
        .map(([s, n]) => [STATUS_LABELS[s] || s, `${n}`]);

      // Budget
      const monthValue = monthCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
      const ytdValue = ytdCases.reduce((s, c) => s + (Number(c.order_value) || 0), 0);
      const monthPct = Math.round((monthValue / MONTHLY_BUDGET) * 100);
      const ytdPct = Math.round((ytdValue / YEARLY_BUDGET) * 100);

      let body = '';
      body += sectionHeading('📊 Försäljning');
      body += kpiTable([
        ['Totalt ordervärde signerat', `${formatSEK(totalWeekValue)} kr`],
        ['Antal nya ärenden', `${weekCases.length} st`],
        ['Antal besök', `${totalVisits} st`],
        ['Hit rate', `${totalHitRate}%`],
      ]);
      body += `<div style="margin-top:12px;">${buildTable(['Säljare', 'Ärenden', 'Ordervärde', 'Besök', 'Hit rate'], sellerRows)}</div>`;

      body += sectionHeading('🔧 Montage');
      body += kpiTable([
        ['Antal utförda montage', `${allMontageEvents.length} st`],
        ['Antal KM', `${allKmEvents.length} st`],
      ]);
      body += `<div style="margin-top:12px;">${buildTable(['Montör', 'Montage', 'KM', 'Avvikelser'], montorRows)}</div>`;

      body += sectionHeading('⚠️ Avvikelser');
      body += kpiTable([
        ['Nya denna vecka', `${weekDevs.length} st`],
        ['Olösta totalt', `${unresolvedDevs.length} st`],
        ['Total kostnad olösta', `${formatSEK(totalDevCost)} kr`],
      ]);

      body += sectionHeading('⏱️ Extra timmar');
      body += kpiTable([
        ['Begärda totalt', `${totalRequested} st (${formatSEK(totalRequested * HOUR_RATE)} kr)`],
        ['Godkända totalt', `${totalApproved} st (${formatSEK(totalApproved * HOUR_RATE)} kr)`],
      ]);

      body += sectionHeading('📋 Pipeline');
      body += buildTable(['Status', 'Antal'], pipelineRows);

      body += sectionHeading('💰 Budget');
      body += `<p style="margin:4px 0;">Denna månad (${monthName(now)}): <strong>${formatSEK(monthValue)} kr</strong> av ${formatSEK(MONTHLY_BUDGET)} kr</p>`;
      body += progressBar(monthPct);
      body += `<p style="margin:4px 0;">YTD: <strong>${formatSEK(ytdValue / 1_000_000).replace(/\s/g, '')} msek</strong> av 55 msek</p>`;
      body += progressBar(ytdPct);

      const html = wrapInTemplate(`Veckosammanställning v.${weekNum}`, body);
      await sendEmail(LOVABLE_API_KEY, RESEND_API_KEY, ADMIN_EMAILS, `SmartKlimat — Veckosammanställning v.${weekNum}`, html, ADMIN_CC);
      results.push('Admin summary sent');
    }

    console.log('Weekly summary completed:', results);
    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('weekly-summary error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
