import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_FIELDS = [
  'offer_number', 'created_at', 'valid_until', 'payment_terms', 'customer_type',
  'customer_name', 'customer_address', 'customer_personnummer', 'fastighetsbeteckning',
  'title', 'description', 'line_items',
  'vat_mode', 'rot_enabled', 'rot_percent', 'total_ex_vat', 'total_vat', 'total_incl_vat',
  'rot_base', 'rot_amount', 'total_after_rot', 'terms_text', 'status', 'accepted_at',
  'accept_name',
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    if (!token || typeof token !== 'string' || token.length < 16) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: offer, error } = await admin
      .from('offers')
      .select('*')
      .eq('public_token', token)
      .maybeSingle();

    if (error || !offer) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!['sent', 'accepted'].includes(offer.status)) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let signedUrl: string | null = null;
    if (offer.pdf_path) {
      const { data: sig } = await admin.storage.from('case-documents').createSignedUrl(offer.pdf_path, 3600);
      signedUrl = sig?.signedUrl || null;
    }
    let signedPdfUrl: string | null = null;
    if (offer.signed_pdf_path) {
      const { data: sig2 } = await admin.storage.from('case-documents').createSignedUrl(offer.signed_pdf_path, 3600);
      signedPdfUrl = sig2?.signedUrl || null;
    }

    const out: Record<string, unknown> = { signed_url: signedUrl, signed_pdf_url: signedPdfUrl };
    for (const f of PUBLIC_FIELDS) out[f] = (offer as any)[f];

    return new Response(JSON.stringify(out), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('public-offer error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
