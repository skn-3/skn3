import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMARTKLIMAT_URL = 'https://yakwdirpbwdtsdpxlbkp.supabase.co/functions/v1/inbound-mockfjards';
const SMARTKLIMAT_SECRET = Deno.env.get('SMARTKLIMAT_INBOUND_SECRET');

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: cerr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (cerr || !claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    if (!SMARTKLIMAT_SECRET) return json({ error: 'SMARTKLIMAT_INBOUND_SECRET saknas' }, 500);

    const body = await req.json().catch(() => ({}));
    const caseId = String(body?.case_id || '');
    if (!caseId) return json({ error: 'case_id krävs' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: caseRow, error: cErr } = await admin
      .from('cases')
      .select('id, customer_name, customer_email, seller, units')
      .eq('id', caseId)
      .maybeSingle();
    if (cErr || !caseRow) return json({ error: 'Case finns inte' }, 404);

    // Verifiera att caset faktiskt är signerat — dvs det finns minst ett besök med result='signerat' som pekar på caset
    const { data: signedVisit, error: vErr } = await admin
      .from('visits')
      .select('id')
      .eq('case_id', caseId)
      .eq('result', 'signerat')
      .limit(1)
      .maybeSingle();
    if (vErr) {
      console.error('[klimatkompensera] kunde inte verifiera signering', vErr);
      return json({ error: 'Kunde inte verifiera signering' }, 500);
    }
    if (!signedVisit) {
      return json({ error: 'Caset är inte signerat — kompensering nekad' }, 403);
    }

    const treeCount = Number(caseRow.units) || 0;
    if (treeCount <= 0) {
      return json({ skipped: true });
    }
    if (treeCount > 500) {
      return json({ error: 'tree_count överstiger 500' }, 400);
    }

    // Idempotens
    const { data: existing } = await admin
      .from('case_climate_compensation')
      .select('verification_id, tree_count, kompenserad_at')
      .eq('case_id', caseId)
      .maybeSingle();
    if (existing) {
      return json({
        error: 'Redan klimatkompenserad',
        verification_id: existing.verification_id,
        tree_count: existing.tree_count,
        kompenserad_at: existing.kompenserad_at,
      }, 409);
    }

    const upstream = await fetch(SMARTKLIMAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-smartklimat-secret': SMARTKLIMAT_SECRET,
      },
      body: JSON.stringify({
        order_number: `CASE-${caseId}`,
        tree_count: treeCount,
        customer_name: caseRow.customer_name || null,
        seller_name: caseRow.seller || null,
        ...(caseRow.customer_email ? { recipient_email: caseRow.customer_email } : {}),
      }),
    });

    const upText = await upstream.text();
    let upJson: any = null;
    try { upJson = JSON.parse(upText); } catch { /* keep null */ }
    if (!upstream.ok) {
      console.error('[klimatkompensera] upstream failed', upstream.status, upText);
      return json({ error: 'Smartklimat avvisade begäran', upstream_status: upstream.status, upstream: upJson ?? upText }, 502);
    }

    const verificationId = upJson?.verification_id || upJson?.id || upJson?.verificationId;
    if (!verificationId) {
      console.error('[klimatkompensera] upstream saknade verification_id', upText);
      return json({ error: 'Smartklimat svarade utan verification_id', upstream: upJson ?? upText }, 502);
    }

    const nowIso = new Date().toISOString();
    const { error: insErr } = await admin.from('case_climate_compensation').insert({
      case_id: caseId,
      kompenserad_at: nowIso,
      tree_count: treeCount,
      verification_id: String(verificationId),
      created_by: userId,
    });
    if (insErr) {
      console.error('[klimatkompensera] insert failed', insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({
      verification_id: String(verificationId),
      tree_count: treeCount,
      kompenserad_at: nowIso,
      proof_url: `https://smartklimat.org/v/${verificationId}`,
    });
  } catch (err) {
    console.error('[klimatkompensera] error', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
