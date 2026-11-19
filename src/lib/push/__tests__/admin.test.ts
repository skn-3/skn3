import { describe, it, expect } from 'vitest';
import { pushAdminSummary, pushDevicesText, pushLastSuccessText, pushRoleLabel, sortPushAdminRows, type PushAdminRow } from '../admin';

const row = (name: string, role: string, devices: number, extra: Partial<PushAdminRow> = {}): PushAdminRow => ({ user_id: name, name, role, is_admin: false, devices, last_success_at: null, ...extra });

describe('kortet Notiser', () => {
  it('sammanfattar och räknar montörer som återstår', () => {
    const rows = [row('Anna', 'seller', 1), row('Team Norra', 'montor', 0), row('Team Söder', 'montor', 2), row('Team Väst', 'montor', 0)];
    expect(pushAdminSummary(rows)).toBe('2 av 4 har slagit på notiser · 2 montörer återstår');
    expect(pushAdminSummary([row('Anna', 'seller', 1)])).toBe('1 av 1 har slagit på notiser');
    expect(pushAdminSummary([row('Team Norra', 'montor', 0)])).toBe('0 av 1 har slagit på notiser · 1 montör återstår');
  });
  it('sorterar montörer som återstår överst', () => {
    const sorted = sortPushAdminRows([row('Anna', 'seller', 1), row('Bertil', 'seller', 0), row('Team Ö', 'montor', 0), row('Team A', 'montor', 0)]);
    expect(sorted.map((r) => r.name)).toEqual(['Team A', 'Team Ö', 'Bertil', 'Anna']);
  });
  it('texter för enheter, roll och senaste utskick', () => {
    expect(pushDevicesText(0)).toBe('Inte påslaget');
    expect(pushDevicesText(1)).toBe('1 enhet');
    expect(pushDevicesText(3)).toBe('3 enheter');
    expect(pushRoleLabel({ role: 'montor', is_admin: false })).toBe('Montör');
    expect(pushRoleLabel({ role: 'seller', is_admin: true })).toBe('Säljare, admin');
    expect(pushRoleLabel({ role: 'coordinator', is_admin: true })).toBe('Koordinator');
    expect(pushLastSuccessText(null)).toBe('Inget utskick ännu');
    expect(pushLastSuccessText('2026-11-19T10:00:00Z', new Date('2026-11-19T10:05:00Z'))).toBe('5 min sedan');
  });
});
