import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  isOpen, silentDays, isSilent, dueDelta, isOverdue, missingNextStep, sortTickets, computeKpis, groupKey, relTime, initials, type Ticket,
} from '../tickets';

const NOW = new Date('2026-10-11T09:00:00+02:00');

function t(p: Partial<Ticket>): Ticket {
  return {
    id: p.id || 'x', case_id: 'c', address: null, customer_name: null, customer_phone: null, customer_email: null, created_at: '2026-10-01T08:00:00Z', created_by: 'GVMO', type: 'reklamation',
    title: 'T', description: 'd', responsible: 'fabrik', status: 'ny', resolved: false, resolved_at: null,
    priority: 'medium', ball: 'oss', owner: null, next_step: null, next_step_due: null, next_step_owner: null,
    last_event_at: null, merged_into_id: null, cost: null, image_urls: null, del1_order_number: null,
    del1_delivery_week: null, del1_delivery_year: null, factory_email_sent_at: null, factory_email_to: null,
    reminder_count: 0, action_log: null, ...p,
  } as Ticket;
}

describe('isOpen', () => {
  it('stängt när löst, avskrivet eller sammanslaget', () => {
    expect(isOpen(t({}))).toBe(true);
    expect(isOpen(t({ resolved: true }))).toBe(false);
    expect(isOpen(t({ status: 'klar' }))).toBe(false);
    expect(isOpen(t({ status: 'avskriven' }))).toBe(false);
    expect(isOpen(t({ merged_into_id: 'y' }))).toBe(false);
    expect(isOpen(t({ status: null }))).toBe(true);
  });
});

describe('tystnad', () => {
  it('räknar dagar sedan senaste händelse, annars sedan skapad', () => {
    expect(silentDays(t({ last_event_at: '2026-10-02T10:00:00Z' }), NOW)).toBe(8);
    expect(silentDays(t({ created_at: '2026-10-09T10:00:00Z' }), NOW)).toBe(1);
    expect(isSilent(t({ last_event_at: '2026-10-06T10:00:00Z' }), NOW)).toBe(false); // 4 dagar
    expect(isSilent(t({ last_event_at: '2026-10-05T10:00:00Z' }), NOW)).toBe(true);  // 5 dagar
  });
});

describe('nästa steg', () => {
  it('dueDelta: negativt före, 0 i dag, positivt efter', () => {
    expect(dueDelta(t({ next_step_due: '2026-10-14' }), NOW)).toBe(-3);
    expect(dueDelta(t({ next_step_due: '2026-10-11' }), NOW)).toBe(0);
    expect(dueDelta(t({ next_step_due: '2026-10-10' }), NOW)).toBe(1);
    expect(dueDelta(t({}), NOW)).toBeNull();
  });
  it('isOverdue bara när datumet passerat', () => {
    expect(isOverdue(t({ next_step_due: '2026-10-11' }), NOW)).toBe(false);
    expect(isOverdue(t({ next_step_due: '2026-10-10' }), NOW)).toBe(true);
  });
  it('missingNextStep på tom text', () => {
    expect(missingNextStep(t({ next_step: '  ' }))).toBe(true);
    expect(missingNextStep(t({ next_step: 'Ring kund' }))).toBe(false);
  });
});

describe('sortTickets', () => {
  it('försenade först, sedan saknat nästa steg, sedan nyckeln', () => {
    const a = t({ id: 'a', next_step: 'x', next_step_due: '2026-10-20' });
    const b = t({ id: 'b', next_step: 'x', next_step_due: '2026-10-05' }); // försenad
    const c = t({ id: 'c' }); // saknar nästa steg
    const d = t({ id: 'd', next_step: 'x', next_step_due: '2026-10-15' });
    expect(sortTickets([a, c, d, b], 'next_step', NOW).map((x) => x.id)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('prioritet: hög före normal före låg', () => {
    const a = t({ id: 'a', next_step: 'x', priority: 'lag' });
    const b = t({ id: 'b', next_step: 'x', priority: 'hog' });
    const c = t({ id: 'c', next_step: 'x', priority: 'medium' });
    expect(sortTickets([a, b, c], 'priority', NOW).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('computeKpis', () => {
  it('räknar öppna, hos oss, försenade, tysta och lösta 30 d', () => {
    const list = [
      t({ id: '1', ball: 'oss', next_step: 'x', next_step_due: '2026-10-01', last_event_at: '2026-10-10T00:00:00Z' }),
      t({ id: '2', ball: 'fabrik', next_step: 'x', last_event_at: '2026-09-20T00:00:00Z' }),
      t({ id: '3', ball: 'oss', resolved: true, status: 'klar', resolved_at: '2026-10-01T00:00:00Z' }),
      t({ id: '4', ball: 'kund', resolved: true, status: 'klar', resolved_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(computeKpis(list, NOW)).toEqual({ open: 2, oss: 1, overdue: 1, silent: 1, missingNextStep: 0, resolved30: 1 });
  });
});

describe('groupKey', () => {
  it('faller tillbaka på oss / ny / ovrigt / ingen ägare', () => {
    expect(groupKey(t({ ball: null }), 'ball')).toBe('oss');
    expect(groupKey(t({ status: null }), 'status')).toBe('ny');
    expect(groupKey(t({ type: '' }), 'category')).toBe('ovrigt');
    expect(groupKey(t({ owner: null }), 'owner')).toBe('__none__');
  });
});

describe('relTime / initials', () => {
  it('i dag, i går, veckodag, datum', () => {
    expect(relTime('2026-10-11T07:02:00+02:00', NOW)).toMatch(/^i dag /);
    expect(relTime('2026-10-10T14:00:00+02:00', NOW)).toMatch(/^i går /);
    expect(relTime('2026-10-08T14:00:00+02:00', NOW)).toMatch(/tors/);
    expect(relTime('2026-09-02T14:00:00+02:00', NOW)).toMatch(/2 sep/);
    expect(relTime(null, NOW)).toBe('—');
  });
  it('initialer', () => {
    expect(initials('Mirna Malke')).toBe('MM');
    expect(initials('GVMO')).toBe('GV');
    expect(initials(null)).toBe('?');
  });
});
