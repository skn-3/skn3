import { supabase } from '@/integrations/supabase/client';
import { createCaseEvent, sendNotificationEmail } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import { COORDINATOR_EMAIL } from '@/lib/constants';
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
}: SubmitKontrollmatningParams): Promise<{ sent: number }> {
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
  try {
    await sendNotificationEmail({
      to: COORDINATOR_EMAIL,
      subject: `KONTROLLMÄTNING INSKICKAD — ${caseAddress}`,
      body: `
        <h2>Kontrollmätning inskickad</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 8px;font-weight:bold">Adress:</td><td style="padding:4px 8px">${caseAddress}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold">Kund:</td><td style="padding:4px 8px">${customerName}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold">Montör:</td><td style="padding:4px 8px">${currentUser}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold">Littera inskickade:</td><td style="padding:4px 8px">${toSend.length}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:bold">Varav ändrade:</td><td style="padding:4px 8px">${changedCount}</td></tr>
        </table>
        <p style="margin-top:12px">Logga in i N3prenad för att granska ändringarna och uppdatera Mockfjärds kundportal.</p>
      `,
    });
    await createCaseEvent({
      case_id: caseId,
      event_type: 'notification',
      description: `Mail skickat till ${COORDINATOR_EMAIL} (kontrollmätning inskickad)`,
      created_by: currentUser,
    });
  } catch (e) {
    console.error('Email notification failed:', e);
  }
  return { sent: toSend.length };
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
