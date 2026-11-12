import { createClient } from 'npm:@supabase/supabase-js@2';
import { offerPdfName, orderConfirmationPdfName } from '../_shared/pdfNames.ts';
import { publicOfferBody } from '../_shared/publicOffer.ts';
import { customerViewImagePaths, sanitizeCustomerView, withImageUrls, type PublicCustomerView } from '../_shared/customerView.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATALOG_BUCKET = 'catalog-images';

/**
 * Kundvyn för kalkyloffert: saneras, och bilder signeras bara när sökvägen finns i price_items.image_path.
 * Fel vid signering ger image_url null och stoppar aldrig svaret.
 */
// deno-lint-ignore no-explicit-any
async function publicCustomerView(admin: any, raw: unknown): Promise<PublicCustomerView | null> {
  const view = sanitizeCustomerView(raw);
  if (!view) return null;
  const urls: Record<string, string | null> = {};
  const paths = customerViewImagePaths(view);
  if (paths.length) {
    try {
      const { data: known } = await admin.from('price_items').select('image_path').in('image_path', paths);
      const knownPaths: string[] = (known ?? []).map((r: { image_path: string | null }) => r.image_path ?? '');
      const allowed: string[] = [...new Set(knownPaths.filter((p: string) => !!p && paths.includes(p)))];
      if (allowed.length) {
        const { data: signed } = await admin.storage.from(CATALOG_BUCKET).createSignedUrls(allowed, 3600);
        (signed ?? []).forEach((s: { path?: string | null; signedUrl?: string | null; error?: string | null }, i: number) => {
          const key: string = s?.path ?? allowed[i];
          if (s?.signedUrl && !s.error && allowed.includes(key)) urls[key] = s.signedUrl;
        });
      }
    } catch (e) {
      console.error('public-offer: bildlänkar för kundvyn misslyckades', e);
    }
  }
  return withImageUrls(view, urls);
}

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

    // Utan customer_view (eller med ogiltig) är svaret exakt som tidigare: samma nycklar och värden.
    const customerView = offer.customer_view != null ? await publicCustomerView(admin, offer.customer_view) : null;
    const out = publicOfferBody(offer as Record<string, unknown>, { signed_url: signedUrl, signed_pdf_url: signedPdfUrl, confirmation_pdf_url: confirmationPdfUrl }, customerView as Record<string, unknown> | null);

    return new Response(JSON.stringify(out), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('public-offer error', e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
