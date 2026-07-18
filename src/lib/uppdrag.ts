import { supabase } from '@/integrations/supabase/client';
import { calcOfferTotals } from './offerCalc';

export type UppdragStatus = 'ej_paborjad' | 'pagar' | 'klar' | 'fakturerad';

export const UPPDRAG_STATUS_META: Record<UppdragStatus, { label: string; cls: string }> = {
  ej_paborjad: { label: 'Ej påbörjad', cls: 'bg-muted text-muted-foreground' },
  pagar: { label: 'Pågår', cls: 'bg-blue-100 text-blue-800' },
  klar: { label: 'Klar', cls: 'bg-green-100 text-green-800' },
  fakturerad: { label: 'Fakturerad', cls: 'bg-emerald-200 text-emerald-900' },
};

export async function findUppdragForOffer(offerId: string): Promise<{ id: string; uppdrag_number: string | null } | null> {
  const { data, error } = await (supabase as any)
    .from('uppdrag')
    .select('id, uppdrag_number')
    .eq('offer_id', offerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createUppdragFromOffer(offer: any, currentUser: string): Promise<{ id: string; uppdrag_number: string | null }> {
  if (!offer?.id) throw new Error('Offert saknar id');
  if (offer.status !== 'accepted') throw new Error('Offerten är inte accepterad');

  const existing = await findUppdragForOffer(offer.id);
  if (existing) return existing;

  const totalAfterRot = offer.total_after_rot != null ? Number(offer.total_after_rot) : (offer.total_incl_vat != null ? Number(offer.total_incl_vat) : 0);
  const totals = calcOfferTotals((offer.line_items as any) || [], {
    vat_mode: offer.vat_mode,
    rot_enabled: offer.rot_enabled,
    rot_percent: Number(offer.rot_percent ?? 30),
    handpenning_percent: Number(offer.handpenning_percent ?? 25),
  });
  const handpenning = totals.handpenning;
  const slutfaktura = totals.slutfaktura;

  const payload = {
    offer_id: offer.id,
    customer_name: offer.customer_name || null,
    customer_email: offer.customer_email || null,
    customer_phone: offer.customer_phone || null,
    customer_address: offer.customer_address || null,
    customer_type: offer.customer_type || null,
    customer_personnummer: offer.customer_personnummer || null,
    fastighetsbeteckning: offer.fastighetsbeteckning || null,
    title: offer.title || null,
    status: 'ej_paborjad',
    assigned_to: offer.ue_supplier || null,
    revenue_ex_vat: offer.total_ex_vat ?? null,
    revenue_incl_vat: offer.total_incl_vat ?? null,
    revenue_after_rot: offer.total_after_rot ?? null,
    rot_amount: offer.rot_amount ?? null,
    handpenning_amount: handpenning,
    slutfaktura_amount: slutfaktura,
    cost_ex_vat: offer.ue_total_excl ?? null,
    created_by: currentUser,
  };

  const { data, error } = await (supabase as any)
    .from('uppdrag')
    .insert(payload)
    .select('id, uppdrag_number')
    .single();
  if (error) throw error;
  return data;
}
