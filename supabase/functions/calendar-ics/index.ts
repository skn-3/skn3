// Kalenderflödet. Samma adress och samma tokens som tidigare, så befintliga prenumerationer
// fortsätter att fungera. Här görs bara uppslag, anrop och loggning; allt innehåll byggs i
// ../_shared/calendarFeed.ts. Publik via token (verify_jwt = false).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  FEED_CASE_FIELDS, buildIcs, calendarClient, feedEvents, feedInfo, isCalendarClient, stockholmToday,
  type FeedCase, type FeedRole,
} from '../_shared/calendarFeed.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ROLES: FeedRole[] = ['montor', 'seller', 'coordinator'];
const PAGE = 1000;

function text(body: string, status: number) {
  return new Response(body, { status, headers: corsHeaders });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Roll via profiles och user_roles; ett aktivt team utan inloggning räknas som montör. */
async function resolveRole(admin: Admin, userName: string): Promise<FeedRole | null> {
  const { data: profile } = await admin.from('profiles').select('id').eq('name', userName).maybeSingle();
  if (profile?.id) {
    const { data: r } = await admin.from('user_roles').select('role').eq('user_id', profile.id).maybeSingle();
    return ROLES.includes(r?.role) ? (r.role as FeedRole) : null;
  }
  const { data: team } = await admin.from('montor_teams').select('name').eq('name', userName).eq('is_active', true).maybeSingle();
  return team ? 'montor' : null;
}

async function fetchCases(admin: Admin, role: FeedRole, name: string): Promise<FeedCase[]> {
  const run = async (fields: string) => {
    const out: FeedCase[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = admin.from('cases').select(fields).neq('status', 'pausad').order('id').range(from, from + PAGE - 1);
      const quoted = `"${name.replace(/"/g, '\\"')}"`;
      if (role === 'montor') q = q.or(`team.eq.${quoted},km_team.eq.${quoted}`);
      else if (role === 'seller') q = q.eq('seller', name);
      const { data, error } = await q;
      if (error) return { error };
      out.push(...((data ?? []) as FeedCase[]));
      if (!data || data.length < PAGE) break;
    }
    return { data: out };
  };
  // montage_days finns först när utkastet med kolumnen är godkänt; utan den räknas 1 dag.
  let res = await run(`${FEED_CASE_FIELDS},montage_days`);
  if (res.error) res = await run(FEED_CASE_FIELDS);
  if (res.error) throw res.error;
  return res.data!;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return text('Missing token', 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: tokenRow, error: tErr } = await admin.from('user_calendar_tokens').select('user_name').eq('token', token).maybeSingle();
    if (tErr || !tokenRow) return text('Not found', 404);

    const userName = tokenRow.user_name as string;
    const role = await resolveRole(admin, userName);
    if (!role) return text('Unknown user', 404);

    const now = new Date();

    if (url.searchParams.get('info') === '1') {
      const { data: conn } = await admin.from('calendar_connections').select('last_fetched_at,last_client').eq('user_name', userName).maybeSingle();
      return new Response(JSON.stringify(feedInfo(userName, conn, now)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const cases = await fetchCases(admin, role, userName);
    const events = feedEvents(cases, { name: userName, role }, stockholmToday(now));
    const ics = buildIcs({ name: userName, events, now });

    // Hämtningslogg, bara för kalenderklienter. Får aldrig stoppa svaret.
    try {
      const userAgent = req.headers.get('user-agent') ?? '';
      const client = calendarClient(userAgent);
      if (isCalendarClient(client)) {
        const { error } = await admin.rpc('calendar_record_fetch', { _user_name: userName, _client: client, _user_agent: userAgent.slice(0, 200) });
        if (error) console.error('calendar_record_fetch:', error.message);
      }
    } catch (e) {
      console.error('Hämtningsloggen misslyckades:', e);
    }

    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  } catch (e) {
    console.error('calendar-ics error', e);
    return text('Error: ' + (e as Error).message, 500);
  }
});
