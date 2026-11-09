import type { CaseRow } from '@/lib/supabaseClient';
import { updateCase, createCaseEvent } from '@/lib/supabaseClient';
import { sendMontorEmail } from '@/lib/montorEmail';
import { canEnterStatus } from '@/lib/statusRules';
import { logActivity } from '@/lib/activityLog';

export function hasMontagePartial(c: { montage_partial_at?: string | null; status: string }) {
  return !!c.montage_partial_at && !['montage_klart', 'fakturerad'].includes(c.status);
}
/** Sparar delrapporten; returnerar emailOk=false om mejlet till kontoret inte gick iväg. */
export async function submitMontagePartial(c: CaseRow, currentUser: string, text: string): Promise<{ emailOk: boolean }> {
  const note = text.trim();
  if (!note) throw new Error('Beskriv vad som återstår.');
  if (!['montage_bokat', 'montage_pagar'].includes(c.status)) throw new Error('Montage måste vara bokat eller pågående först');
  if (c.status === 'montage_bokat') {
    const check = canEnterStatus('montage_pagar', c);
    if (!check.ok) throw new Error(check.reason || 'Förutsättning saknas');
    await updateCase(c.id, { status: 'montage_pagar' });
  }
  await updateCase(c.id, { montage_partial_note: note, montage_partial_at: new Date().toISOString() });
  await createCaseEvent({ case_id: c.id, event_type: 'montage_delrapport', description: 'Montage delrapporterat. Allt är klart utom: ' + note, created_by: currentUser });
  logActivity({ category: 'case', action: 'montage_partial_reported', description: `Delrapporterade montage för ${c.address}`, case_id: c.id, metadata: { note } });
  const mail = await sendMontorEmail('montage_delrapport', c.id);
  if (mail.ok && !mail.skipped) {
    try { await createCaseEvent({ case_id: c.id, event_type: 'notification', description: `Mail skickat till ${mail.to.join(', ')} (montage delrapporterat)`, created_by: currentUser }); } catch (e) { console.error('[montage_delrapport] händelserad för mejl misslyckades:', e); }
  }
  return { emailOk: mail.ok };
}