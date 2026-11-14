import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/lib/activityLog';

/** Fasta mallar i notify-email som montörer får anropa; mottagare och innehåll byggs på servern. */
export type MontorEmailTemplate =
  | 'montage_klart'
  | 'montage_delrapport'
  | 'kontrollmatning_inskickad'
  | 'km_klar'
  | 'avvikelse_rapporterad'
  | 'km_bokad'
  | 'montage_bokat';

export const MAIL_WARNING = 'Mejlet till kontoret gick inte iväg, men allt är sparat i appen.';

export interface MontorEmailResult {
  ok: boolean;
  skipped?: boolean;
  /** Testmiljön skickade inget (notify-email svarade { skipped: 'local_backend' }). */
  local?: boolean;
  to: string[];
}

/**
 * Skickar en fast montörsmall. Kastar aldrig: huvudåtgärden är redan sparad.
 * Lyckat utskick loggas i activity_log (category 'email', action = mallen).
 */
export async function sendMontorEmail(
  template: MontorEmailTemplate,
  caseId: string,
  extra: { deviation_id?: string; images_only?: boolean } = {},
): Promise<MontorEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke('notify-email', {
      body: { template, case_id: caseId, ...extra },
    });
    if (error) throw error;
    if (data?.skipped === 'local_backend') return { ok: true, skipped: true, local: true, to: [] };
    if (data?.skipped) return { ok: true, skipped: true, to: [] };
    const to: string[] = Array.isArray(data?.to) ? data.to : [];
    logActivity({
      category: 'email',
      action: template,
      description: `Mejl skickat (${template})${to.length ? ` till ${to.join(', ')}` : ''}`,
      case_id: caseId,
      deviation_id: extra.deviation_id,
      metadata: { template, to },
    });
    return { ok: true, to };
  } catch (e) {
    console.error(`[${template}] mejlet via notify-email misslyckades:`, e);
    return { ok: false, to: [] };
  }
}
