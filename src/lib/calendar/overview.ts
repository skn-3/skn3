// Adminöversikten "Kalenderkoppling". Ren logik.
import { clientLabel, relativeAgo } from './guide';
import type { OverviewKind, OverviewRow } from './types';

export type OverviewStatus = 'connected' | 'not_connected' | 'no_login';

export const OVERVIEW_TEXTS = {
  title: 'Kalenderkoppling',
  toggle: 'Guiden visas för montörer',
  remindAll: 'Påminn alla som saknar koppling',
  rotateConfirm: 'Den gamla länken slutar fungera och kalendern måste läggas till igen.',
  missingEmail: 'Mejladress saknas',
  columns: ['Användare', 'Roll', 'Status', 'Senast hämtad', 'Åtgärd'] as const,
} as const;

export const STATUS_TEXT: Record<OverviewStatus, string> = { connected: 'Kopplad', not_connected: 'Inte kopplad', no_login: 'Saknar inloggning' };
export const KIND_TEXT: Record<OverviewKind, string> = { montor: 'Montör', seller: 'Säljare', coordinator: 'Koordinator', team_utan_inloggning: 'Team' };

export function statusOf(row: Pick<OverviewRow, 'connected' | 'kind'>): OverviewStatus {
  if (row.connected) return 'connected';
  return row.kind === 'team_utan_inloggning' ? 'no_login' : 'not_connected';
}

export function summaryLine(rows: readonly Pick<OverviewRow, 'connected'>[]): string {
  return `${rows.filter((r) => r.connected).length} av ${rows.length} har schemat i sin kalender.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Kolumnen Senast hämtad. */
export function lastFetchedText(row: OverviewRow, now: Date): string {
  const status = statusOf(row);
  if (status === 'connected') return `${cap(relativeAgo(row.last_fetched_at, now))} · ${clientLabel(row.last_client)}`;
  if (status === 'no_login') return 'Kan få schemat via mejl';
  const n = row.guide_sent_count ?? 0;
  return n > 0 ? `Påmind ${n} ${n === 1 ? 'gång' : 'gånger'}` : 'Inte påmind';
}

export interface OverviewAction { action: 'rotate' | 'send'; label: string; disabled: boolean; note: string | null }

export function actionFor(row: OverviewRow): OverviewAction {
  const status = statusOf(row);
  if (status === 'connected') return { action: 'rotate', label: 'Ny länk', disabled: false, note: null };
  const label = status === 'no_login' ? 'Mejla länken' : 'Skicka guiden';
  return row.has_email ? { action: 'send', label, disabled: false, note: null } : { action: 'send', label, disabled: true, note: OVERVIEW_TEXTS.missingEmail };
}

/** Montörer och team utan koppling som har adress (samma urval som remind_all). */
export function remindCount(rows: readonly OverviewRow[]): number {
  return rows.filter((r) => (r.kind === 'montor' || r.kind === 'team_utan_inloggning') && !r.connected && r.has_email).length;
}

export function remindConfirm(n: number): string {
  return `Skicka guiden till ${n} som saknar koppling?`;
}
