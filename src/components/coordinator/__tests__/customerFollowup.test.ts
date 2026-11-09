import { describe, it, expect } from 'vitest';
import {
  selectOpenFollowups,
  needsCustomerFollowup,
  canCompleteFollowup,
  followupAgeDays,
  isFollowupOverdue,
  followupPatch,
  followupRollback,
} from '@/lib/customerFollowup';

const base = { status: 'montage_klart', customer_followup_done_at: null, created_at: '2026-10-01T08:00:00Z' };

describe('Kundavstämning — urval till inkorgen', () => {
  it('tar med montage_klart och fakturerad som inte är avstämda', () => {
    expect(needsCustomerFollowup({ ...base })).toBe(true);
    expect(needsCustomerFollowup({ ...base, status: 'fakturerad' })).toBe(true);
  });

  it('utesluter avstämda ärenden', () => {
    expect(needsCustomerFollowup({ ...base, customer_followup_done_at: '2026-11-01T10:00:00Z' })).toBe(false);
  });

  it.each(['montage_pagar', 'montage_bokat', 'godkand', 'pausad'])('utesluter status %s', (status) => {
    expect(needsCustomerFollowup({ ...base, status })).toBe(false);
  });

  it('sorterar äldst först på status_changed_at, sedan montage_date, sedan created_at', () => {
    const rows = [
      { ...base, id: 'b', status_changed_at: '2026-11-05T10:00:00Z' },
      { ...base, id: 'c', status_changed_at: null, montage_date: '2026-11-03' },
      { ...base, id: 'a', status_changed_at: '2026-11-01T10:00:00Z' },
      { ...base, id: 'done', status_changed_at: '2026-10-01T10:00:00Z', customer_followup_done_at: '2026-10-02T10:00:00Z' },
      { ...base, id: 'd', status_changed_at: null, montage_date: null, created_at: '2026-11-06T10:00:00Z' },
    ];
    expect(selectOpenFollowups(rows).map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });
});

describe('Kundavstämning — regler', () => {
  it('Klarmarkera kräver både kontaktad och signerat', () => {
    expect(canCompleteFollowup({ ...base, customer_followup_contacted_at: 'x' })).toBe(false);
    expect(canCompleteFollowup({ ...base, customer_followup_signed_at: 'x' })).toBe(false);
    expect(canCompleteFollowup({ ...base, customer_followup_contacted_at: 'x', customer_followup_signed_at: 'y' })).toBe(true);
  });

  it('ålderschipen blir röd först efter 3 dagar', () => {
    const now = new Date('2026-11-09T12:00:00');
    expect(followupAgeDays({ ...base, status_changed_at: '2026-11-06T09:00:00' }, now)).toBe(3);
    expect(isFollowupOverdue(3)).toBe(false);
    expect(isFollowupOverdue(4)).toBe(true);
  });

  it('kryss sätter tidpunkt och urkryss nollställer', () => {
    const now = '2026-11-09T08:00:00.000Z';
    expect(followupPatch({ kind: 'contacted', checked: true }, 'Mirna Malke', now)).toEqual({ customer_followup_contacted_at: now });
    expect(followupPatch({ kind: 'signed', checked: false }, 'Mirna Malke', now)).toEqual({ customer_followup_signed_at: null });
  });

  it('klarmarkering och ångra rör bara done-fälten och aldrig status', () => {
    const now = '2026-11-09T08:00:00.000Z';
    const done = followupPatch({ kind: 'done' }, 'Mirna Malke', now);
    expect(done).toEqual({ customer_followup_done_at: now, customer_followup_done_by: 'Mirna Malke' });
    expect(done).not.toHaveProperty('status');
    expect(followupPatch({ kind: 'reopen' }, 'Mirna Malke', now)).toEqual({ customer_followup_done_at: null, customer_followup_done_by: null });
  });

  it('återställning vid fel ger tillbaka tidigare värden', () => {
    const c = { ...base, customer_followup_contacted_at: null };
    expect(followupRollback(c, { customer_followup_contacted_at: 'nu' })).toEqual({ customer_followup_contacted_at: null });
  });
});
