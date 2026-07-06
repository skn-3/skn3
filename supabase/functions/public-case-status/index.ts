import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    if (!token || typeof token !== 'string' || token.length < 16) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: c, error } = await admin
      .from('cases')
      .select('id, customer_name, address, status, order_number, km_date, km_time, delivery_week, delivery_year, delivery_date, montage_date, montage_time')
      .eq('public_token', token)
      .maybeSingle();

    if (error || !c) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: comp } = await admin
      .from('case_climate_compensation')
      .select('tree_count, verification_id, kompenserad_at')
      .eq('case_id', c.id)
      .maybeSingle();

    const { id: _id, ...safe } = c as any;
    return new Response(JSON.stringify({ case: safe, climate: comp ?? null }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('public-case-status error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
