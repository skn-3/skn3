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
    const eventType = String(body?.event_type || '');
    if (eventType !== 'visit' && eventType !== 'signing') {
      return json({ error: "event_type måste vara 'visit' eller 'signing'" }, 400);
    }
    const caseId: string | null = body?.case_id ? String(body.case_id) : null;
    const visitId: string | null = body?.visit_id ? String(body.visit_id) : null;
    const upstreamKey = caseId || visitId;
    if (!upstreamKey) return json({ error: 'case_id eller visit_id krävs' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let seller: string | null = body?.seller ? String(body.seller) : null;
    let treeCount = Number(body?.tree_count);

    if (caseId) {
      const { data: caseRow, error: cErr } = await admin
        .from('cases')
        .select('id, seller, units')
        .eq('id', caseId)
        .maybeSingle();
      if (cErr || !caseRow) return json({ error: 'Case finns inte' }, 404);
      seller = caseRow.seller || seller;
      if (!Number.isFinite(treeCount)) {
        treeCount = eventType === 'visit' ? 1 : Number(caseRow.units) || 0;
      }
    }
    if (!Number.isFinite(treeCount)) treeCount = eventType === 'visit' ? 1 : 0;
    treeCount = Math.floor(treeCount);
    if (treeCount <= 0) return json({ skipped: true, reason: 'tree_count <= 0' });
    if (treeCount > 500) return json({ error: 'tree_count överstiger 500' }, 400);

    const eventRef = String(body?.event_ref || (eventType === 'signing' ? `signing-${upstreamKey}` : `visit-${upstreamKey}`));

    // Idempotens lokalt — samma event_ref skickas aldrig om
    const { data: existingEvent } = await admin
      .from('climate_events')
      .select('verification_id, claim_url, total_trees, tree_count')
      .eq('event_ref', eventRef)
      .maybeSingle();
    if (existingEvent) {
      return json({
        already_sent: true,
        verification_id: existingEvent.verification_id,
        claim_url: existingEvent.claim_url,
        total_trees: existingEvent.total_trees,
        tree_count: existingEvent.tree_count,
      });
    }

    const upstream = await fetch(SMARTKLIMAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-smartklimat-secret': SMARTKLIMAT_SECRET,
      },
      body: JSON.stringify({
        case_id: upstreamKey,
        event_type: eventType,
        tree_count: treeCount,
        seller: seller || null,
        event_ref: eventRef,
      }),
    });

    const upText = await upstream.text();
    let upJson: any = null;
    try { upJson = JSON.parse(upText); } catch { /* keep null */ }
    if (!upstream.ok) {
      console.error('[klimat] upstream failed', upstream.status, upText);
      return json({ error: 'Smartklimat avvisade begäran', upstream_status: upstream.status, upstream: upJson ?? upText }, 502);
    }

    const verificationId = upJson?.verification_id || upJson?.id || upJson?.verificationId || null;
    const claimUrl = upJson?.claim_url || null;
    const totalTrees = Number.isFinite(Number(upJson?.total_trees)) ? Number(upJson.total_trees) : null;

    const nowIso = new Date().toISOString();

    const { error: evErr } = await admin.from('climate_events').insert({
      case_id: caseId,
      visit_id: visitId,
      upstream_key: upstreamKey,
      event_type: eventType,
      tree_count: treeCount,
      seller,
      event_ref: eventRef,
      verification_id: verificationId ? String(verificationId) : null,
      claim_url: claimUrl,
      total_trees: totalTrees,
    });
    if (evErr) console.error('[klimat] event insert failed', evErr);

    if (caseId) {
      const { data: existing } = await admin
        .from('case_climate_compensation')
        .select('case_id, tree_count')
        .eq('case_id', caseId)
        .maybeSingle();

      const resolvedTotal = totalTrees ?? ((existing?.tree_count || 0) + treeCount);

      if (existing) {
        const { error: updErr } = await admin
          .from('case_climate_compensation')
          .update({
            tree_count: resolvedTotal,
            total_trees: resolvedTotal,
            claim_url: claimUrl,
            ...(verificationId ? { verification_id: String(verificationId) } : {}),
            updated_at: nowIso,
          })
          .eq('case_id', caseId);
        if (updErr) console.error('[klimat] update failed', updErr);
      } else {
        const { error: insErr } = await admin.from('case_climate_compensation').insert({
          case_id: caseId,
          kompenserad_at: nowIso,
          tree_count: resolvedTotal,
          total_trees: resolvedTotal,
          claim_url: claimUrl,
          verification_id: verificationId ? String(verificationId) : '',
          created_by: userId,
        });
        if (insErr) console.error('[klimat] insert failed', insErr);
      }
    }

    return json({
      ok: true,
      event_type: eventType,
      tree_count: treeCount,
      verification_id: verificationId ? String(verificationId) : null,
      claim_url: claimUrl,
      total_trees: totalTrees,
    });
  } catch (err) {
    console.error('[klimat] error', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
