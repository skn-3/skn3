import type { CaseRow } from '@/lib/supabaseClient';
import { updateCase, createCaseEvent, sendNotificationEmail } from '@/lib/supabaseClient';
import { canEnterStatus } from '@/lib/statusRules';
import { logActivity } from '@/lib/activityLog';
import { COORDINATOR_EMAIL } from '@/lib/constants';

export function hasMontagePartial(c: { montage_partial_at?: string | null; status: string }) {
  return !!c.montage_partial_at && !['montage_klart', 'fakturerad'].includes(c.status);
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
export async function submitMontagePartial(c: CaseRow, currentUser: string, text: string) {
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
  try {
    const rows = [['Adress', c.address], ['Kund', c.customer_name], ['Montör', currentUser], ['Allt är klart utom', note]];
    await sendNotificationEmail({ to: COORDINATOR_EMAIL, subject: `MONTAGE DELRAPPORTERAT — ${c.address}`, body: `<h2>Montage delrapporterat</h2><table style="border-collapse:collapse;width:100%">${rows.map(([label, value]) => `<tr><td style="padding:4px 8px;font-weight:bold">${label}:</td><td style="padding:4px 8px">${escape(value)}</td></tr>`).join('')}</table>` });
    await createCaseEvent({ case_id: c.id, event_type: 'notification', description: `Mail skickat till ${COORDINATOR_EMAIL} (montage delrapporterat)`, created_by: currentUser });
  } catch (error) { console.error('Email notification failed:', error); }
}