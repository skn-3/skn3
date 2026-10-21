import { createClient } from 'npm:@supabase/supabase-js@2';
import { offerPdfName, orderConfirmationPdfName } from '../_shared/pdfNames.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_FIELDS = [
  'id', 'offer_number', 'created_at', 'sent_at', 'created_by', 'valid_until', 'payment_terms', 'customer_type',
  'customer_name', 'customer_address', 'customer_personnummer', 'fastighetsbeteckning',
  'title', 'description', 'line_items',
  'vat_mode', 'rot_enabled', 'rot_percent', 'rot_persons', 'rot_cap_per_person', 'rot_used', 'total_ex_vat', 'total_vat', 'total_incl_vat',
  'rot_base', 'rot_amount', 'total_after_rot', 'handpenning_percent', 'terms_text', 'status', 'accepted_at',
  'accept_name', 'declined_at', 'confirmation_sent_at',
] as const;

function isExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  // Offer valid through end of valid_until day
  const end = new Date(validUntil);
  end.setHours(23, 59, 59, 999);
  return Date.now() > end.getTime();
}

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

    // Lazy expiry: if sent and past valid_until, flip to expired
    if (offer.status === 'sent' && isExpired(offer.valid_until)) {
      const { error: upErr } = await admin.from('offers').update({ status: 'expired' }).eq('id', offer.id);
      if (!upErr) offer.status = 'expired';
    }

    if (!['sent', 'accepted', 'expired', 'declined'].includes(offer.status)) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const offerFile = offerPdfName(offer, 'offert');
    const avtalFile = offerPdfName(offer, 'avtal');

    let signedUrl: string | null = null;
    if (offer.pdf_path) {
      const { data: sig } = await admin.storage.from('case-documents').createSignedUrl(offer.pdf_path, 3600, { download: offerFile });
      signedUrl = sig?.signedUrl || null;
    }
    let signedPdfUrl: string | null = null;
    if (offer.signed_pdf_path) {
      const { data: sig2 } = await admin.storage.from('case-documents').createSignedUrl(offer.signed_pdf_path, 3600, { download: avtalFile });
      signedPdfUrl = sig2?.signedUrl || null;
    }

    let confirmationPdfUrl: string | null = null;
    if (offer.confirmation_pdf_path) {
      const { data: sig3 } = await admin.storage.from('case-documents').createSignedUrl(offer.confirmation_pdf_path, 3600, { download: orderConfirmationPdfName(offer, offer.confirmation_sent_at) });
      confirmationPdfUrl = sig3?.signedUrl || null;
    }

    const out: Record<string, unknown> = { signed_url: signedUrl, signed_pdf_url: signedPdfUrl, confirmation_pdf_url: confirmationPdfUrl };
    for (const f of PUBLIC_FIELDS) out[f] = (offer as any)[f];

    return new Response(JSON.stringify(out), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('public-offer error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
