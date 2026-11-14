import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rows: [] as any[], error: null as any, invoke: vi.fn(), insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const teamsQuery = { select: () => teamsQuery, eq: () => teamsQuery, order: async () => ({ data: m.rows, error: m.error }) };
  const eventsQuery = { insert: (row: any) => { m.insert(row); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; } };
  return {
    supabase: {
      from: (table: string) => (table === 'montor_teams' ? teamsQuery : eventsQuery),
      functions: { invoke: m.invoke },
    },
  };
});

import { resolveTeamEmail } from '../teamEmail';
import { sendMontorAssignmentEmail } from '@/lib/supabaseClient';

const c = { id: 'case1', address: 'Storgatan 1', customer_name: 'Anna', customer_phone: '070', seller: 'Sara', team: 'GVMO', km_team: 'LUKAS', km_date: null, montage_date: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.rows = [{ name: 'LUKAS', email: 'lukas@example.com' }, { name: 'Tomek', email: 'tomek@example.com' }, { name: 'GVMO', email: null }];
  m.error = null;
  m.invoke.mockResolvedValue({ data: {}, error: null });
});

describe('resolveTeamEmail', () => {
  it('reads montor_teams.email first', async () => {
    expect(await resolveTeamEmail('Tomek')).toBe('tomek@example.com');
  });
  it('falls back to EMAIL_MAP', async () => {
    expect(await resolveTeamEmail('GVMO')).toBe('gvmo.bygg@gmail.com');
    m.error = new Error('down');
    expect(await resolveTeamEmail('GVMO')).toBe('gvmo.bygg@gmail.com');
  });
  it('returns null for unknown teams', async () => {
    expect(await resolveTeamEmail('Okänd')).toBeNull();
    expect(await resolveTeamEmail(null)).toBeNull();
  });
});

describe('sendMontorAssignmentEmail', () => {
  it('sends KM mail to km_team, also for teams missing in the static list', async () => {
    await expect(sendMontorAssignmentEmail(c, 'km', 'Mirna', { km_date: '2026-11-20' })).resolves.toBe(true);
    expect(m.invoke).toHaveBeenCalledWith('notify-email', { body: expect.objectContaining({ to: 'lukas@example.com', subject: 'KONTROLLMÄTNING TILLDELAD — Storgatan 1' }) });
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'notification', description: 'Tilldelningsmail skickat till montör (lukas@example.com)' }));
  });
  it('falls back to team for KM when km_team is missing', async () => {
    await sendMontorAssignmentEmail({ ...c, km_team: null }, 'km', 'Mirna');
    expect(m.invoke.mock.calls[0][1].body.to).toBe('gvmo.bygg@gmail.com');
  });
  it('sends montage mail to team', async () => {
    await sendMontorAssignmentEmail({ ...c, team: 'Tomek' }, 'montage', 'Mirna', { montage_date: '2026-11-20' });
    expect(m.invoke.mock.calls[0][1].body).toMatchObject({ to: 'tomek@example.com', subject: 'MONTAGE TILLDELAT — Storgatan 1' });
  });
  it('returns false when sending fails and true when skipped', async () => {
    m.invoke.mockResolvedValueOnce({ data: null, error: new Error('x') });
    await expect(sendMontorAssignmentEmail(c, 'montage', 'Mirna')).resolves.toBe(false);
    await expect(sendMontorAssignmentEmail({ ...c, team: 'Okänd' }, 'montage', 'Mirna')).resolves.toBe(true);
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });
});
