import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaseRow } from '@/lib/supabaseClient';
import { hasMontagePartial, submitMontagePartial } from '../montagePartial';
const mocks = vi.hoisted(() => ({ update: vi.fn(), event: vi.fn(), email: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ updateCase: mocks.update, createCaseEvent: mocks.event, sendNotificationEmail: mocks.email }));
vi.mock('@/lib/activityLog', () => ({ logActivity: mocks.log }));
const c = { id: 'case', address: 'Testvägen 1', customer_name: 'Anna', status: 'montage_bokat', team: 'Alex NBD', montage_date: '2026-10-26', delivery_date: '2026-10-25' } as CaseRow;
describe('montage partial', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({}); mocks.event.mockResolvedValue({}); mocks.email.mockResolvedValue({}); });
  it('requires a note before changing anything', async () => {
    await expect(submitMontagePartial(c, 'Alex NBD', '   ')).rejects.toThrow('Beskriv vad som återstår.');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('starts booked montage before saving the partial report and history', async () => {
    await submitMontagePartial(c, 'Alex NBD', '  Lister saknas  ');
    expect(mocks.update.mock.calls[0]).toEqual(['case', { status: 'montage_pagar' }]);
    expect(mocks.update.mock.calls[1]).toEqual(['case', { montage_partial_note: 'Lister saknas', montage_partial_at: expect.any(String) }]);
    expect(mocks.event.mock.calls[0][0]).toMatchObject({ event_type: 'montage_delrapport', description: 'Montage delrapporterat. Allt är klart utom: Lister saknas', created_by: 'Alex NBD' });
    expect(mocks.update.mock.invocationCallOrder[1]).toBeLessThan(mocks.event.mock.invocationCallOrder[0]);
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'montage_partial_reported', metadata: { note: 'Lister saknas' } }));
  });
  it('uses the start montage guard for booked cases', async () => {
    await expect(submitMontagePartial({ ...c, delivery_date: null }, 'Alex NBD', 'Lister')).rejects.toThrow('Välj leveransdatum');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('can report again during ongoing montage without restarting it', async () => {
    await submitMontagePartial({ ...c, status: 'montage_pagar' }, 'Alex NBD', 'Bleck');
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith('case', expect.objectContaining({ montage_partial_note: 'Bleck' }));
  });
  it.each(['montage_klart', 'fakturerad'])('hides retained partial data at %s', status => {
    expect(hasMontagePartial({ status, montage_partial_at: '2026-10-25T22:00:00Z' })).toBe(false);
  });
  it('shows existing report until completed', () => {
    expect(hasMontagePartial({ status: 'montage_pagar', montage_partial_at: '2026-10-25T22:00:00Z' })).toBe(true);
    expect(hasMontagePartial({ status: 'montage_pagar', montage_partial_at: null })).toBe(false);
  });
});