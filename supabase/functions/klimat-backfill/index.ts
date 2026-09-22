import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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
  if (!SMARTKLIMAT_SECRET) return json({ error: 'SMARTKLIMAT_INBOUND_SECRET saknas' }, 500);

  const reqBody = await req.json().catch(() => ({}));
  const limit = Number((reqBody as any)?.limit) || 0;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: visits, error: vErr } = await admin
    .from('visits')
    .select('case_id')
    .eq('result', 'signerat')
    .gte('date', '2026-07-09')
    .not('case_id', 'is', null);
  if (vErr) return json({ error: vErr.message }, 500);

  const caseIds = [...new Set((visits ?? []).map((v: any) => v.case_id as string))];
  if (caseIds.length === 0) return json({ created: 0, errors: [], candidates: 0 });

  const { data: existing } = await admin
    .from('case_climate_compensation')
    .select('case_id')
    .in('case_id', caseIds);
  const done = new Set((existing ?? []).map((r: any) => r.case_id));

  const { data: cases, error: cErr } = await admin
    .from('cases')
    .select('id, customer_name, customer_email, seller, units')
    .in('id', caseIds.filter((id) => !done.has(id)))
    .gte('units', 1);
  if (cErr) return json({ error: cErr.message }, 500);

  const targets = cases ?? [];
  const results: any[] = [];
  let created = 0;

  for (let i = 0; i < targets.length; i += 20) {
    const batch = targets.slice(i, i + 20);
    await Promise.all(
      batch.map(async (c: any) => {
        const treeCount = Number(c.units) || 0;
        try {
          const upstream = await fetch(SMARTKLIMAT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-smartklimat-secret': SMARTKLIMAT_SECRET,
            },
            body: JSON.stringify({
              order_number: `CASE-${c.id}`,
              tree_count: treeCount,
              customer_name: c.customer_name || null,
              seller_name: c.seller || null,
              ...(c.customer_email ? { recipient_email: c.customer_email } : {}),
            }),
          });
          const text = await upstream.text();
          let up: any = null;
          try { up = JSON.parse(text); } catch { /* ignore */ }
          if (!upstream.ok) {
            results.push({ case_id: c.id, error: `upstream ${upstream.status}: ${text.slice(0, 200)}` });
            return;
          }
          const verificationId = up?.verification_id || up?.id || up?.verificationId;
          if (!verificationId) {
            results.push({ case_id: c.id, error: 'saknar verification_id: ' + text.slice(0, 300) });
            return;
          }
          const { error: insErr } = await admin.from('case_climate_compensation').insert({
            case_id: c.id,
            kompenserad_at: new Date().toISOString(),
            tree_count: Number(up?.tree_count) || treeCount,
            verification_id: String(verificationId),
            created_by: null,
          });
          if (insErr) {
            results.push({ case_id: c.id, error: insErr.message });
            return;
          }
          created++;
        } catch (e) {
          results.push({ case_id: c.id, error: (e as Error).message });
        }
      }),
    );
  }

  return json({ candidates: targets.length, created, errors: results });
});
