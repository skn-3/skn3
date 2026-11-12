import { describe, it, expect } from 'vitest';
import { PUBLIC_FIELDS, publicOfferBody } from './publicOffer';
import { sanitizeCustomerView, withImageUrls } from './customerView';

// Svaret som public-offer byggde före kundvyn (commit 5d39f05), ordagrant.
const LEGACY_FIELDS = [
  'id', 'offer_number', 'created_at', 'sent_at', 'created_by', 'valid_until', 'payment_terms', 'customer_type',
  'customer_name', 'customer_address', 'customer_personnummer', 'fastighetsbeteckning',
  'title', 'description', 'line_items',
  'vat_mode', 'rot_enabled', 'rot_percent', 'rot_persons', 'rot_cap_per_person', 'rot_used', 'total_ex_vat', 'total_vat', 'total_incl_vat',
  'rot_base', 'rot_amount', 'total_after_rot', 'handpenning_percent', 'terms_text', 'status', 'accepted_at',
  'accept_name', 'declined_at', 'confirmation_sent_at',
] as const;
function legacyBody(offer: Record<string, unknown>, signedUrl: string | null, signedPdfUrl: string | null, confirmationPdfUrl: string | null) {
  const out: Record<string, unknown> = { signed_url: signedUrl, signed_pdf_url: signedPdfUrl, confirmation_pdf_url: confirmationPdfUrl };
  for (const f of LEGACY_FIELDS) out[f] = (offer as any)[f];
  return out;
}

/** En hel offertrad som select('*') ger den, med alla kolumner. */
const offerRow = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'o1', case_id: 'c1', offer_number: 'O-2026-0042', status: 'sent', customer_type: 'privat', customer_name: 'Anna Andersson',
  customer_email: 'anna@example.se', customer_phone: '0701234567', customer_address: 'Storgatan 1', customer_personnummer: '19800101-1234',
  fastighetsbeteckning: 'Huddinge 1:2', title: 'Golv, Vardagsrum', description: 'Vardagsrum – Golv: Ekparkett.',
  line_items: [{ id: 'a:arbete', description: 'Vardagsrum – Golv: arbete', is_labor: true, qty: 1, unit: 'st', unit_price: 5000, amount: 5000 }],
  vat_mode: 'vanlig', vat_rate: 25, rot_enabled: true, rot_percent: 30, valid_until: '2026-12-12', payment_terms: '10 dagar netto',
  terms_text: 'Villkor', internal_notes: 'Intern', total_ex_vat: 5000, total_vat: 1250, total_incl_vat: 6250, rot_base: 6250, rot_amount: 1875,
  total_after_rot: 4375, pdf_path: 'o1/offert.pdf', created_by: 'Johannes', created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-11T10:00:00Z',
  sent_at: '2026-11-11T10:00:00Z', accepted_at: null, declined_at: null, public_token: 'tok-1234567890abcdef', accept_name: null,
  accept_ip: null, accept_user_agent: null, signed_pdf_path: null, source: 'kalkyl', ue_supplier: null, ue_document_path: null,
  ue_total_excl: null, markup_percent: null, handpenning_percent: 25, decline_name: null, decline_reason: null, rot_persons: 2,
  rot_cap_per_person: 50000, rot_used: 0, confirmation_pdf_path: null, confirmation_sent_at: null, confirmation_sent_by: null,
  confirmation_sent_to: null, calc_data: { version: 1, rows: [] }, calc_version: 1, ...extra,
});
const URLS = { signed_url: 'https://signed/offert', signed_pdf_url: null, confirmation_pdf_url: null };

/** Som public-offer gör: kundvyn läggs bara till när den sanerade finns. */
function newBody(offer: Record<string, unknown>) {
  const cv = offer.customer_view != null ? sanitizeCustomerView(offer.customer_view) : null;
  return publicOfferBody(offer, URLS, cv ? (withImageUrls(cv, {}) as unknown as Record<string, unknown>) : null);
}

describe('public-offer: svaret för offerter utan customer_view är oförändrat', () => {
  it('PUBLIC_FIELDS är samma lista i samma ordning', () => {
    expect([...PUBLIC_FIELDS]).toEqual([...LEGACY_FIELDS]);
  });

  it('utan kolumnen, med null och med ogiltig kundvy: exakt samma nycklar, ordning och värden', () => {
    for (const offer of [offerRow(), offerRow({ customer_view: null }), offerRow({ customer_view: { version: 2 } }), offerRow({ customer_view: 'trasig' })]) {
      const before = legacyBody(offer, URLS.signed_url, URLS.signed_pdf_url, URLS.confirmation_pdf_url);
      const after = newBody(offer);
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
      expect(Object.keys(after)).toEqual(Object.keys(before));
      expect('customer_view' in after).toBe(false);
    }
  });

  it('med giltig kundvy: samma fält som förut plus customer_view sist, utan bildsökvägar', () => {
    const cv = { version: 1, intro: null, sections: [{ id: 'r', room: null, title: 'Altan', type: 'Altan och trall', amount_ex_vat: 100, text: '', facts: [], items: [{ label: 'Material', name: 'Trall', detail: null, color: null, swatch: null, image_path: 'altan/trall.jpg' }] }], common: [], totals: { arbete_ex_vat: 0, material_ex_vat: 100, ovrigt_ex_vat: 0 } };
    const offer = offerRow({ customer_view: cv });
    const after = newBody(offer);
    const before = legacyBody(offer, URLS.signed_url, URLS.signed_pdf_url, URLS.confirmation_pdf_url);
    expect(Object.keys(after)).toEqual([...Object.keys(before), 'customer_view']);
    for (const k of Object.keys(before)) expect(after[k]).toEqual(before[k]);
    expect(JSON.stringify(after.customer_view)).not.toContain('altan/trall.jpg');
  });
});
