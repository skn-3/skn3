import { supabase } from '@/integrations/supabase/client';

// När en Mockfjärds-utbetalning (KM, extra eller montage) bokförs på ett ärende
// som saknar ordernummer sparas radens Fsg.order på ärendet, så att nästa
// utbetalning för samma order kopplas automatiskt. Ett befintligt ordernummer
// skrivs aldrig över.

export interface PayoutOrderNumberPlan {
  orderNumber: string;
  description: string;
}

const clean = (v: unknown) => String(v ?? '').trim();

/** Ren regel: vad som ska sparas, eller null när inget ska ändras. */
export function planPayoutOrderNumber(
  caseOrderNumber: string | number | null | undefined,
  payoutOrderNumber: string | number | null | undefined,
  invoiceNumber: string | null | undefined,
): PayoutOrderNumberPlan | null {
  const on = clean(payoutOrderNumber);
  if (!on || !/\d/.test(on)) return null;
  if (clean(caseOrderNumber)) return null;
  const inv = clean(invoiceNumber);
  return {
    orderNumber: on,
    description: `Mockfjärds ordernummer ${on} sparat från utbetalning${inv ? ` ${inv}` : ''}`,
  };
}

/**
 * Sparar ordernumret om ärendet (enligt databasen just nu) saknar ett och lägger
 * en händelse. Kastar aldrig: ett fel här får inte stoppa bokföringen.
 */
export async function savePayoutOrderNumber(params: {
  caseId: string;
  payoutOrderNumber: string | null | undefined;
  invoiceNumber: string | null | undefined;
  createdBy: string;
}): Promise<boolean> {
  try {
    if (!planPayoutOrderNumber(null, params.payoutOrderNumber, params.invoiceNumber)) return false;
    const { data: current, error: readErr } = await supabase
      .from('cases').select('order_number').eq('id', params.caseId).maybeSingle();
    if (readErr || !current) return false;
    const plan = planPayoutOrderNumber(current.order_number, params.payoutOrderNumber, params.invoiceNumber);
    if (!plan) return false;
    // Villkorad uppdatering: skriver bara om fältet fortfarande är tomt.
    const { data: updated, error: updErr } = await supabase
      .from('cases')
      .update({ order_number: plan.orderNumber })
      .eq('id', params.caseId)
      .or('order_number.is.null,order_number.eq.')
      .select('id');
    if (updErr || !updated?.length) return false;
    const { error: evErr } = await supabase.from('case_events').insert({
      case_id: params.caseId,
      event_type: 'update',
      description: plan.description,
      created_by: params.createdBy,
    });
    if (evErr) console.warn('Händelse för ordernummer kunde inte sparas', evErr);
    return true;
  } catch (e) {
    console.warn('Ordernummer från utbetalning kunde inte sparas', e);
    return false;
  }
}
