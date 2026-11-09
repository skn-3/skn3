import { supabase } from '@/integrations/supabase/client';
import { createCaseEvent } from '@/lib/supabaseClient';
import { sendMontorEmail } from '@/lib/montorEmail';
import { logActivity } from '@/lib/activityLog';
import { changedFields } from '@/lib/litteraDiff';

export interface KontrollmatningRow {
  id: string;
  cm_status: string;
  [key: string]: any;
}

export interface SubmitKontrollmatningParams {
  caseId: string;
  rows: KontrollmatningRow[];
  currentUser: string;
  caseAddress: string;
  customerName: string;
}

/**
 * Skickar in alla ej inskickade littera (ej_paborjad/justerad) till kontoret:
 * status 'inskickad', händelse 'kontrollmatning', aktivitetslogg och mejl.
 * Samma logik används av litterasektionen och KM-klar-rapporten.
 */
export async function submitKontrollmatning({
  caseId,
  rows,
  currentUser,
  caseAddress,
  customerName,
}: SubmitKontrollmatningParams): Promise<{ sent: number; emailOk: boolean }> {
  const toSend = rows.filter((r) => r.cm_status === 'ej_paborjad' || r.cm_status === 'justerad');
  if (toSend.length === 0) throw new Error('Inget att skicka in');
  const ids = toSend.map((r) => r.id);
  const { error } = await supabase.from('litteror').update({ cm_status: 'inskickad' }).in('id', ids);
  if (error) throw error;

  const changedCount = toSend.filter((r) => changedFields(r).length > 0).length;
  await createCaseEvent({
    case_id: caseId,
    event_type: 'kontrollmatning',
    description: `Kontrollmätning inskickad: ${toSend.length} littera (${changedCount} med ändringar)`,
    created_by: currentUser,
  });
  logActivity({
    category: 'case',
    action: 'kontrollmatning_submitted',
    description: `Skickade in kontrollmätning för ${caseAddress}`,
    case_id: caseId,
    metadata: { littera_count: toSend.length, changed_count: changedCount },
  });
  const mail = await sendMontorEmail('kontrollmatning_inskickad', caseId);
  if (mail.ok && !mail.skipped) {
    try {
      await createCaseEvent({
        case_id: caseId,
        event_type: 'notification',
        description: `Mail skickat till ${mail.to.join(', ')} (kontrollmätning inskickad)`,
        created_by: currentUser,
      });
    } catch (e) {
      console.error('[kontrollmatning_inskickad] händelserad för mejl misslyckades:', e);
    }
  }
  return { sent: toSend.length, emailOk: mail.ok };
}

/** Hämtar ärendets littera (för att avgöra om KM-klar ska skicka in mätningen samtidigt). */
export async function fetchPendingLitteror(caseId: string): Promise<KontrollmatningRow[]> {
  const { data, error } = await supabase
    .from('litteror')
    .select('*')
    .eq('case_id', caseId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as KontrollmatningRow[];
}
