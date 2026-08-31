import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireAdmin } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generatePin(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String(b % 10);
  return s;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const auth = await requireAdmin(req, corsHeaders);
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const name = String(body?.name ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const role = body?.role as 'seller' | 'montor' | 'coordinator';
    const isAdmin = !!body?.is_admin && role !== 'montor';

    if (!name) throw new Error('Namn saknas');
    if (!/.+@.+\..+/.test(email)) throw new Error('Ogiltig e-postadress');
    if (!['seller', 'montor', 'coordinator'].includes(role)) throw new Error('Ogiltig roll');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Montörer scopas via namnet (auth_user_name = team) — namnet måste motsvara ett aktivt team
    if (role === 'montor') {
      const { data: team } = await admin.from('montor_teams').select('id').eq('name', name).eq('is_active', true).maybeSingle();
      if (!team) throw new Error(`Inget aktivt montörsteam heter "${name}" — skapa teamet först`);
    }

    const { data: existing } = await admin.from('profiles').select('id').eq('login_email', email).maybeSingle();
    if (existing) throw new Error('E-postadressen används redan');

    const pin = generatePin();
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (authErr || !created.user) throw new Error(authErr?.message ?? 'Kunde inte skapa konto');
    const userId = created.user.id;

    const { error: profErr } = await admin.from('profiles').insert({ id: userId, name, login_email: email, must_change_pin: true });
    if (profErr) throw new Error(`Profil: ${profErr.message}`);

    const { error: roleErr } = await admin.from('user_roles').insert({ user_id: userId, role, is_admin: isAdmin });
    if (roleErr) throw new Error(`Roll: ${roleErr.message}`);

    return new Response(JSON.stringify({ ok: true, user_id: userId, pin }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Okänt fel' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
