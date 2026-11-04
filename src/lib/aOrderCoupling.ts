import { supabase } from '@/integrations/supabase/client';

export interface CoupleAOrderInput {
  aOrderId: string;
  caseId: string;
  teamId: string | null;
  teamName: string | null;
  /** Valfritt montagedatum (yyyy-mm-dd) som skrivs till ärendet. */
  montageDate?: string | null;
  /** Ärendets befintliga montagedatum, för loggtext och varningar. */
  existingMontageDate?: string | null;
}

export interface CoupleAOrderResult {
  /** Extra varningar för toasten, t.ex. saknat montagedatum. */
  warnings: string[];
}

/**
 * Koppla en A-order till ett ärende: case_id på A-ordern, montör och status
 * Montage bokat på ärendet (när montör finns), montagedatum och en case_events-rad.
 * Samma beteende oavsett om kopplingen görs i dialogen eller direkt i formuläret.
 */
export async function coupleAOrderToCase(input: CoupleAOrderInput): Promise<CoupleAOrderResult> {
  const { aOrderId, caseId, teamId, teamName, montageDate } = input;
  const { error: aoErr } = await (supabase as any).from('a_orders').update({ case_id: caseId }).eq('id', aOrderId);
  if (aoErr) throw aoErr;

  const hasTeam = !!teamId;
  if (hasTeam) {
    const caseUpdate: Record<string, unknown> = { team: teamName, status: 'montage_bokat' };
    if (montageDate) caseUpdate.montage_date = montageDate;
    const { error: cErr } = await (supabase as any).from('cases').update(caseUpdate).eq('id', caseId);
    if (cErr) throw cErr;
  }

  const { data: aoData } = await (supabase as any)
    .from('a_orders').select('order_number, invoice_number').eq('id', aOrderId).maybeSingle();
  const ref = aoData?.invoice_number || aoData?.order_number || aOrderId.slice(0, 8);
  const effectiveMontageDate = montageDate || input.existingMontageDate || null;
  const descParts: string[] = [`A-order ${ref} kopplad.`, hasTeam ? `Montör: ${teamName}.` : 'Montör: ej satt.'];
  if (hasTeam) {
    descParts.push(`Status → Montage bokat${effectiveMontageDate ? ', montagedatum ' + effectiveMontageDate : ''}.`);
  }
  try {
    await (supabase as any).from('case_events').insert({ case_id: caseId, event_type: 'aorder_coupled', description: descParts.join(' ') });
  } catch (e) {
    console.error('case_events insert failed', e);
  }

  let missingDelivery = false;
  try {
    const { data: cd } = await (supabase as any).from('cases').select('delivery_date, delivery_week').eq('id', caseId).maybeSingle();
    missingDelivery = !cd?.delivery_date && !cd?.delivery_week;
  } catch { /* varningen är frivillig */ }

  const warnings: string[] = [];
  if (hasTeam && !effectiveMontageDate) warnings.push('montagedatum saknas – komplettera i ärendet');
  if (missingDelivery) warnings.push('leveransdatum/vecka saknas');
  return { warnings };
}

export function couplingToast(address: string, warnings: string[]) {
  return `A-order kopplad till ${address}.${warnings.length ? ` OBS: ${warnings.join('; ')}.` : ''}`;
}
