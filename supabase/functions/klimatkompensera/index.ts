import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMARTKLIMAT_URL = 'https://yakwdirpbwdtsdpxlbkp.supabase.co/functions/v1/inbound-mockfjards';
const SMARTKLIMAT_SECRET = Deno.env.get('SMARTKLIMAT_INBOUND_SECRET') || '';

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
    const orderId = String(body?.order_id || '');
    const treeCount = Number(body?.tree_count);
    if (!orderId) return json({ error: 'order_id krävs' }, 400);
    if (!Number.isFinite(treeCount) || treeCount < 1 || treeCount > 500) {
      return json({ error: 'tree_count måste vara 1–500' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: order, error: oErr } = await admin
      .from('a_orders')
      .select('id, order_number, customer_name, created_by, window_count, roof_window_count')
      .eq('id', orderId)
      .maybeSingle();
    if (oErr || !order) return json({ error: 'Order finns inte' }, 404);

    let sellerName: string | null = null;
    if (order.created_by) {
      const { data: prof } = await admin
        .from('profiles')
        .select('name')
        .eq('id', order.created_by)
        .maybeSingle();
      sellerName = (prof?.name as string | undefined) ?? null;
    }

    const { data: existing } = await admin
      .from('order_climate_compensation')
      .select('klimat_verification_id, klimat_tree_count, klimat_kompenserad_at')
      .eq('order_id', orderId)
      .maybeSingle();
    if (existing) {
      return json({
        error: 'Redan klimatkompenserad',
        klimat_verification_id: existing.klimat_verification_id,
        klimat_tree_count: existing.klimat_tree_count,
        klimat_kompenserad_at: existing.klimat_kompenserad_at,
      }, 409);
    }

    const upstream = await fetch(SMARTKLIMAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-smartklimat-secret': SMARTKLIMAT_SECRET,
      },
      body: JSON.stringify({
        order_number: order.order_number,
        tree_count: treeCount,
        customer_name: order.customer_name || null,
        seller_name: sellerName,
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
    const { error: insErr } = await admin.from('order_climate_compensation').insert({
      order_id: orderId,
      klimat_kompenserad_at: nowIso,
      klimat_tree_count: treeCount,
      klimat_verification_id: String(verificationId),
      created_by: userId,
    });
    if (insErr) {
      console.error('[klimatkompensera] insert failed', insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({
      klimat_verification_id: String(verificationId),
      klimat_tree_count: treeCount,
      klimat_kompenserad_at: nowIso,
      proof_url: `https://smartklimat.org/v/${verificationId}`,
    });
  } catch (err) {
    console.error('[klimatkompensera] error', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
