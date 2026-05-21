// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const SELLERS = ['Daniel Malke', 'Gabriel Hanna'];
const MONTORS = ['GVMO', 'Samy', 'Alex NBD', 'Jerk'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatLocalDateTime(dateStr: string, timeStr: string | null): string {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM(:SS) or null
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!timeStr) return `${y}${pad(m)}${pad(d)}T000000`;
  const [hh, mm] = timeStr.split(':').map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

function formatDateOnly(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}${pad(m)}${pad(d)}`;
}

function addHoursLocal(dateStr: string, timeStr: string, hours: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm));
  dt.setUTCHours(dt.getUTCHours() + hours);
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

function nowStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// ISO week: returns Monday of ISO week + year
function isoWeekMonday(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return ISOweekStart;
}

function escapeText(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function fmtAmount(v: number | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('sv-SE').format(Number(v)) + ' kr';
}

function buildCaseEvents(c: any, stamp: string, isSeller: boolean): string[] {
  const events: string[] = [];
  const desc = (extra = '') => {
    const lines = [
      `Kund: ${c.customer_name || ''}`,
      `Telefon: ${c.customer_phone || ''}`,
      c.team ? `Team: ${c.team}` : null,
      isSeller ? `Ordervärde: ${fmtAmount(c.order_value)} ex moms` : null,
      extra || null,
    ].filter(Boolean);
    return escapeText(lines.join('\n'));
  };

  if (c.km_date) {
    const allDay = !c.km_time;
    const start = allDay ? formatDateOnly(c.km_date) : formatLocalDateTime(c.km_date, c.km_time);
    const end = allDay ? null : addHoursLocal(c.km_date, c.km_time, 2);
    events.push(buildEvent({
      uid: `${c.id}-km@smartklimat`, stamp, allDay, start, end,
      summary: `KM — ${c.address}`,
      description: desc(),
      location: c.address,
    }));
  }
  if (c.montage_date) {
    const allDay = !c.montage_time;
    const start = allDay ? formatDateOnly(c.montage_date) : formatLocalDateTime(c.montage_date, c.montage_time);
    const end = allDay ? null : addHoursLocal(c.montage_date, c.montage_time, 8);
    events.push(buildEvent({
      uid: `${c.id}-montage@smartklimat`, stamp, allDay, start, end,
      summary: `Montage — ${c.address}`,
      description: desc(),
      location: c.address,
    }));
  }
  if (c.delivery_date) {
    const allDay = !c.delivery_time;
    const start = allDay ? formatDateOnly(c.delivery_date) : formatLocalDateTime(c.delivery_date, c.delivery_time);
    const end = allDay ? null : addHoursLocal(c.delivery_date, c.delivery_time, 1);
    events.push(buildEvent({
      uid: `${c.id}-leverans@smartklimat`, stamp, allDay, start, end,
      summary: `Leverans — ${c.address}`,
      description: desc(),
      location: c.address,
    }));
  } else if (c.delivery_week && c.delivery_year) {
    const monday = isoWeekMonday(c.delivery_year, c.delivery_week);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 7);
    const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    events.push(buildWeekEvent({
      uid: `${c.id}-leverans-w@smartklimat`, stamp,
      start: fmt(monday), end: fmt(sunday),
      summary: `Leverans v${c.delivery_week} — ${c.address}`,
      description: desc('Ungefärlig leveransvecka'),
      location: c.address,
    }));
  }
  return events;
}

function buildEvent(o: { uid: string; stamp: string; allDay: boolean; start: string; end: string | null; summary: string; description: string; location: string }): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${o.uid}`,
    `DTSTAMP:${o.stamp}`,
  ];
  if (o.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${o.start}`);
  } else {
    lines.push(`DTSTART:${o.start}`);
    if (o.end) lines.push(`DTEND:${o.end}`);
  }
  lines.push(`SUMMARY:${escapeText(o.summary)}`);
  lines.push(`DESCRIPTION:${o.description}`);
  if (o.location) lines.push(`LOCATION:${escapeText(o.location)}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

function buildWeekEvent(o: { uid: string; stamp: string; start: string; end: string; summary: string; description: string; location: string }): string {
  return [
    'BEGIN:VEVENT',
    `UID:${o.uid}`,
    `DTSTAMP:${o.stamp}`,
    `DTSTART;VALUE=DATE:${o.start}`,
    `DTEND;VALUE=DATE:${o.end}`,
    `SUMMARY:${escapeText(o.summary)}`,
    `DESCRIPTION:${o.description}`,
    o.location ? `LOCATION:${escapeText(o.location)}` : null,
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Missing token', { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tokenRow, error: tErr } = await supabase
      .from('user_calendar_tokens')
      .select('user_name')
      .eq('token', token)
      .maybeSingle();

    if (tErr || !tokenRow) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    const userName = tokenRow.user_name as string;
    const isSeller = SELLERS.includes(userName);
    const isMontor = MONTORS.includes(userName);

    let query = supabase.from('cases').select('*');
    if (isMontor) query = query.eq('team', userName);
    else if (isSeller) query = query.eq('seller', userName);
    else return new Response('Unknown user', { status: 404, headers: corsHeaders });

    const { data: cases, error: cErr } = await query;
    if (cErr) throw cErr;

    const stamp = nowStamp();
    const events: string[] = [];
    for (const c of cases || []) {
      events.push(...buildCaseEvents(c, stamp, isSeller));
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SmartKlimat//Caseflow//SV',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:SmartKlimat — ${userName}`,
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');

    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (e) {
    return new Response('Error: ' + (e as Error).message, { status: 500, headers: corsHeaders });
  }
});
