// Urvalen i koordinatorns inkorg och antalet öppna punkter (räknaren på fliken Min inkorg).
// Ren logik; inkorgen och räknaren använder samma regler.
import { selectOpenFollowups } from '@/lib/customerFollowup';
import { selectOpenWastePickups, type WasteFields } from '@/lib/wastePickup';

type FollowupCase = Parameters<typeof selectOpenFollowups>[0][number];
type InboxCase = FollowupCase & WasteFields & {
  id: string; status: string; montage_date?: string | null; team?: string | null; created_at: string;
};
type InboxDeviation = { status?: unknown; resolved?: boolean | null; created_at: string };

export type InboxDeviationStatus = 'ny' | 'under_atgard' | 'vantar_leverans' | 'klar' | string;
const ACTIVE = ['ny', 'under_atgard', 'vantar_leverans'];
const SHEET_STATUSES = ['godkand', 'i_produktion', 'leverans_klar', 'montage_bokat'];

/** Att boka in: godkänd eller i produktion och saknar montagedatum eller team, äldst först. */
export function selectToBook<T extends Pick<InboxCase, 'status' | 'montage_date' | 'team' | 'created_at'>>(cases: readonly T[]): T[] {
  return cases
    .filter(c => (c.status === 'godkand' || c.status === 'i_produktion') && (!c.montage_date || !c.team))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/** Att beställa plåt för: produktionsfas utan plåtbeställning (okänd mängd = alla kandidater). */
export function selectToOrderSheet<T extends Pick<InboxCase, 'id' | 'status'>>(cases: readonly T[], sheetMetalCaseIds: ReadonlySet<string> | undefined): T[] {
  const candidates = cases.filter(c => SHEET_STATUSES.includes(c.status));
  return sheetMetalCaseIds ? candidates.filter(c => !sheetMetalCaseIds.has(c.id)) : candidates;
}

export function deviationStatusOf(d: InboxDeviation): InboxDeviationStatus {
  return (typeof d.status === 'string' && d.status) || (d.resolved ? 'klar' : 'ny');
}

/** Aktiva reklamationer: 'ny' först, därefter under åtgärd, väntar leverans; äldst först. */
export function selectOpenDeviations<T extends InboxDeviation>(deviations: readonly T[]): T[] {
  const rank = (s: string) => (s === 'ny' ? 0 : s === 'under_atgard' ? 1 : 2);
  return deviations
    .map(d => ({ d, status: deviationStatusOf(d) }))
    .filter(({ status }) => ACTIVE.includes(status))
    .sort((a, b) => rank(a.status) - rank(b.status) || new Date(a.d.created_at).getTime() - new Date(b.d.created_at).getTime())
    .map(x => x.d);
}

/** Antal öppna punkter: kundavstämning, skräphämtning, att boka in, plåt och reklamationer. */
export function inboxOpenCount<T extends InboxCase>(p: { cases: readonly T[]; deviations: readonly InboxDeviation[]; sheetMetalCaseIds: ReadonlySet<string> | undefined }): number {
  return selectOpenFollowups(p.cases).length
    + selectOpenWastePickups(p.cases).length
    + selectToBook(p.cases).length
    + selectToOrderSheet(p.cases, p.sheetMetalCaseIds).length
    + selectOpenDeviations(p.deviations).length;
}
