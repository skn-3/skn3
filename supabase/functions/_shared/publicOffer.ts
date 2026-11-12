// Svaret från public-offer. Ren modul: fälten och ordningen är desamma som före kundvyn, och
// customer_view läggs bara till när det sanerade värdet finns (se customerView.ts).

export const PUBLIC_FIELDS = [
  'id', 'offer_number', 'created_at', 'sent_at', 'created_by', 'valid_until', 'payment_terms', 'customer_type',
  'customer_name', 'customer_address', 'customer_personnummer', 'fastighetsbeteckning',
  'title', 'description', 'line_items',
  'vat_mode', 'rot_enabled', 'rot_percent', 'rot_persons', 'rot_cap_per_person', 'rot_used', 'total_ex_vat', 'total_vat', 'total_incl_vat',
  'rot_base', 'rot_amount', 'total_after_rot', 'handpenning_percent', 'terms_text', 'status', 'accepted_at',
  'accept_name', 'declined_at', 'confirmation_sent_at',
] as const;

export interface PublicOfferUrls { signed_url: string | null; signed_pdf_url: string | null; confirmation_pdf_url: string | null }

export function publicOfferBody(
  offer: Record<string, unknown>,
  urls: PublicOfferUrls,
  customerView: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const out: Record<string, unknown> = { signed_url: urls.signed_url, signed_pdf_url: urls.signed_pdf_url, confirmation_pdf_url: urls.confirmation_pdf_url };
  for (const f of PUBLIC_FIELDS) out[f] = offer[f];
  if (customerView) out.customer_view = customerView;
  return out;
}
