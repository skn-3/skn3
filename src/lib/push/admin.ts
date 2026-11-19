// Kortet "Notiser" i vyn Kalenderkoppling. Ren logik.
import { relativeTimeSv } from '@/lib/relativeTimeSv';

export interface PushAdminRow { user_id: string; name: string; role: string | null; is_admin: boolean; devices: number; last_success_at: string | null }

export function pushRoleLabel(row: Pick<PushAdminRow, 'role' | 'is_admin'>): string {
  const base = row.role === 'seller' ? 'Säljare' : row.role === 'coordinator' ? 'Koordinator' : row.role === 'montor' ? 'Montör' : 'Användare';
  return row.is_admin && row.role !== 'coordinator' ? `${base}, admin` : base;
}

export function pushDevicesText(devices: number): string {
  if (devices <= 0) return 'Inte påslaget';
  return devices === 1 ? '1 enhet' : `${devices} enheter`;
}

export function pushLastSuccessText(value: string | null, now: Date = new Date()): string {
  if (!value) return 'Inget utskick ännu';
  return relativeTimeSv(value, now);
}

/** "3 av 8 har slagit på notiser · 2 montörer återstår". */
export function pushAdminSummary(rows: readonly PushAdminRow[]): string {
  const on = rows.filter(r => r.devices > 0).length;
  const montorsLeft = rows.filter(r => r.role === 'montor' && r.devices <= 0).length;
  const base = `${on} av ${rows.length} har slagit på notiser`;
  if (!montorsLeft) return base;
  return `${base} · ${montorsLeft === 1 ? '1 montör återstår' : `${montorsLeft} montörer återstår`}`;
}

/** Ordning: de som inte har slagit på först (montörer överst), sedan bokstavsordning. */
export function sortPushAdminRows(rows: readonly PushAdminRow[]): PushAdminRow[] {
  const rank = (r: PushAdminRow) => (r.devices > 0 ? 2 : r.role === 'montor' ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'sv'));
}
