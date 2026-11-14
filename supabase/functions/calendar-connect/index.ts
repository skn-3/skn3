// Kalenderkoppling: skicka guiden, översikt, ny länk och påminnelser. Kräver inloggning;
// rollen kontrolleras här. Tokens för andra användare skapas och läses bara här (service role)
// och skickas aldrig tillbaka till klienten.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { feedHttpsUrl, isConnected, webcalUrl } from '../_shared/calendarFeed.ts';
import { calendarGuideEmail, maskEmail } from '../_shared/calendarGuideEmail.ts';
import { wrapInTemplate } from '../_shared/mailLayout.ts';
import { sendMail } from '../_shared/sendMail.ts';
import { COORDINATOR_EMAILS, SELLER_EMAILS, teamEmailResolver } from '../_shared/mailRecipients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Kind = 'montor' | 'seller' | 'coordinator' | 'team_utan_inloggning';
interface Entry { name: string; kind: Kind; email: string | null }
// deno-lint-ignore no-explicit-any
type Admin = any;

const KIND_ORDER: Record<Kind, number> = { montor: 0, team_utan_inloggning: 1, seller: 2, coordinator: 3 };

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** En rad per användare och per aktivt team utan inloggning, med mottagaradress. */
async function directory(admin: Admin): Promise<Entry[]> {
  const [{ data: profiles }, { data: roles }, { data: teams }] = await Promise.all([
    admin.from('profiles').select('id,name'),
    admin.from('user_roles').select('user_id,role'),
    admin.from('montor_teams').select('name,email,is_active'),
  ]);
  const teamEmailOf = teamEmailResolver(teams ?? []);
  const roleOf = new Map<string, string>((roles ?? []).map((r: { user_id: string; role: string }) => [r.user_id, r.role]));
  const out: Entry[] = [];
  const names = new Set<string>();
  for (const p of (profiles ?? []) as Array<{ id: string; name: string }>) {
    const role = roleOf.get(p.id);
    if (role !== 'montor' && role !== 'seller' && role !== 'coordinator') continue;
    names.add(p.name);
    const email = role === 'montor' ? teamEmailOf(p.name) : role === 'seller' ? SELLER_EMAILS[p.name] ?? null : COORDINATOR_EMAILS[p.name] ?? null;
    out.push({ name: p.name, kind: role, email });
  }
  for (const t of (teams ?? []) as Array<{ name: string; is_active: boolean }>) {
    if (!t.is_active || names.has(t.name)) continue;
    out.push({ name: t.name, kind: 'team_utan_inloggning', email: teamEmailOf(t.name) });
  }
  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'sv'));
}

async function ensureToken(admin: Admin, userName: string): Promise<string> {
  const { data } = await admin.from('user_calendar_tokens').select('token').eq('user_name', userName).maybeSingle();
  if (data?.token) return data.token as string;
  const { data: ins, error } = await admin.from('user_calendar_tokens').insert({ user_name: userName }).select('token').single();
  if (error) throw error;
  return ins.token as string;
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type GuideResult =
  | { sent: true; to: string }
  | { sent: false; reason: 'no_email' }
  | { sent: false; skipped: 'local_backend'; to: string }
  | { sent: false; reason: 'send_failed'; to: string };

async function sendGuide(admin: Admin, entry: Entry): Promise<GuideResult> {
  if (!entry.email) return { sent: false, reason: 'no_email' };
  const token = await ensureToken(admin, entry.name);
  const webcal = webcalUrl(feedHttpsUrl(Deno.env.get('SUPABASE_URL')!, token));
  const mail = calendarGuideEmail({ name: entry.name, team: entry.kind === 'montor' || entry.kind === 'team_utan_inloggning', webcal, token });
  const res = await sendMail({ to: [entry.email], subject: mail.subject, html: wrapInTemplate(mail.heading, mail.body) });
  const to = maskEmail(entry.email);
  if (!res.ok) return { sent: false, reason: 'send_failed', to };
  if (res.skipped) return { sent: false, skipped: res.skipped, to };
  const { error } = await admin.rpc('calendar_record_guide_sent', { _user_name: entry.name });
  if (error) console.error('calendar_record_guide_sent:', error.message);
  return { sent: true, to };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAuth(req, corsHeaders);
    if (auth.response) return auth.response;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await admin.from('profiles').select('name').eq('id', auth.userId).maybeSingle();
    const callerName = (profile?.name as string | undefined) ?? '';
    if (!callerName) return json(403, { error: 'Profil saknas' });
    const staff = auth.isAdmin || auth.role === 'seller' || auth.role === 'coordinator';

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const userNameArg = typeof body?.user_name === 'string' ? body.user_name.trim().slice(0, 120) : '';

    if (action === 'send_guide') {
      const target = userNameArg || callerName;
      if (!staff && target !== callerName) return json(403, { error: 'Du kan bara skicka till ditt eget team' });
      const entry = (await directory(admin)).find((e) => e.name === target);
      if (!entry) return json(404, { error: 'Okänd användare' });
      const r = await sendGuide(admin, entry);
      if ('reason' in r && r.reason === 'send_failed') return json(502, { error: 'Mejlet kunde inte skickas', to: r.to });
      return json(200, r);
    }

    if (action === 'overview') {
      if (!staff) return json(403, { error: 'Forbidden' });
      const [entries, { data: conns }] = await Promise.all([
        directory(admin),
        admin.from('calendar_connections').select('user_name,last_fetched_at,last_client,guide_sent_at,guide_sent_count'),
      ]);
      const byName = new Map((conns ?? []).map((c: { user_name: string }) => [c.user_name, c]));
      const now = new Date();
      // deno-lint-ignore no-explicit-any
      const rows = entries.map((e) => { const c: any = byName.get(e.name) ?? null; return {
        name: e.name,
        kind: e.kind,
        has_email: !!e.email,
        connected: isConnected(c, now),
        last_fetched_at: c?.last_fetched_at ?? null,
        last_client: c?.last_client ?? null,
        guide_sent_at: c?.guide_sent_at ?? null,
        guide_sent_count: c?.guide_sent_count ?? 0,
      }; });
      return json(200, { rows });
    }

    if (action === 'rotate') {
      const target = userNameArg;
      if (!target) return json(400, { error: 'user_name krävs' });
      if (!auth.isAdmin && target !== callerName) return json(403, { error: 'Bara admin kan byta länk åt någon annan' });
      const { error } = await admin.from('user_calendar_tokens').upsert({ user_name: target, token: newToken() }, { onConflict: 'user_name' });
      if (error) throw error;
      await admin.from('calendar_connections')
        .update({ last_fetched_at: null, last_client: null, last_user_agent: null, fetch_count: 0, updated_at: new Date().toISOString() })
        .eq('user_name', target);
      return json(200, { ok: true });
    }

    if (action === 'remind_all') {
      if (!staff) return json(403, { error: 'Forbidden' });
      const [entries, { data: conns }] = await Promise.all([
        directory(admin),
        admin.from('calendar_connections').select('user_name,last_fetched_at,last_client'),
      ]);
      const byName = new Map((conns ?? []).map((c: { user_name: string }) => [c.user_name, c]));
      const now = new Date();
      const targets = entries.filter((e) => (e.kind === 'montor' || e.kind === 'team_utan_inloggning') && !isConnected(byName.get(e.name) as never, now));
      let sent = 0; let withoutEmail = 0; let skippedLocal = 0; let failed = 0;
      for (const e of targets) {
        if (!e.email) { withoutEmail++; continue; }
        const r = await sendGuide(admin, e);
        if (r.sent) sent++;
        else if ('skipped' in r) skippedLocal++;
        else failed++;
      }
      return json(200, { sent, without_email: withoutEmail, ...(skippedLocal ? { skipped: 'local_backend', skipped_count: skippedLocal } : {}), ...(failed ? { failed } : {}) });
    }

    return json(400, { error: 'Okänd åtgärd' });
  } catch (e) {
    console.error('calendar-connect error', e);
    return json(500, { error: e instanceof Error ? e.message : 'Okänt fel' });
  }
});
