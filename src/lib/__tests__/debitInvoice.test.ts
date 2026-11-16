import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAndSendCreditInvoice } from '../debitInvoice';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke }, auth: { getUser: mocks.getUser } } }));
vi.mock('@/lib/aOrderPdf', () => ({ loadAOrderLogo: vi.fn().mockResolvedValue('logo') }));
vi.mock('@/lib/montorDebitPdf', () => ({ buildMontorDebitPdf: () => ({ output: () => 'data:application/pdf;base64,cGRm' }) }));
vi.mock('@/lib/selfBillingPdf', () => ({ buildSelfBillingPdf: () => ({ output: () => 'data:application/pdf;base64,cGRm' }) }));

function prepare(updateError: { message: string } | null, activeItems: any[] = []) {
  const original = { id: 'original', team_id: 'team', invoice_number: 'N3-012', kind: 'debit', line_items: [{ unit_price: 100, amount: 100 }], subtotal: 100, vat_amount: 25, total: 125, vat_mode: 'vanlig' };
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) });
  const insert = vi.fn().mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: { id: 'credit', invoice_number: 'N3-013' } }) }) });
  const itemsQuery = { select: () => itemsQuery, eq: () => itemsQuery, limit: async () => ({ data: activeItems, error: null }) };
  mocks.from
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: original }) }) }) })
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'team', name: 'Alex NBD' } }) }) }) })
    .mockReturnValueOnce(itemsQuery)
    .mockReturnValueOnce({ insert })
    .mockReturnValueOnce({ update });
  return { update, insert };
}

describe('credit invoice original status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReset();
    mocks.rpc.mockResolvedValue({ data: 'N3-013' });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } });
    mocks.invoke.mockResolvedValue({ error: null });
  });
  it('marks the original credited and returns the negative credit amount', async () => {
    const { update } = prepare(null);
    await expect(createAndSendCreditInvoice({ originalId: 'original', reason: 'Rättning', createdBy: 'Kontoret' })).resolves.toMatchObject({ total: -125 });
    expect(update).toHaveBeenCalledWith({ status: 'credited' });
  });
  it('credits a debit invoice in the N3 series, never in the team self-billing series', async () => {
    const { insert } = prepare(null);
    await createAndSendCreditInvoice({ originalId: 'original', reason: 'Rättning', createdBy: 'Kontoret' });
    expect(mocks.rpc).not.toHaveBeenCalledWith('next_team_invoice_number', expect.anything());
    expect(insert.mock.calls[0][0]).not.toHaveProperty('invoice_number');
    expect(insert.mock.calls[0][0]).toMatchObject({ kind: 'debit', credited_from_invoice_id: 'original', total: -125 });
  });
  it('blocks crediting a deduction that is part of an active payout statement', async () => {
    const { insert } = prepare(null, [{ id: 'item', montor_settlements: { settlement_number: 'UTB-003' } }]);
    await expect(createAndSendCreditInvoice({ originalId: 'original', reason: 'Rättning', createdBy: 'Kontoret' })).rejects.toThrow('UTB-003');
    expect(insert).not.toHaveBeenCalled();
  });
  it('rejects a failed original update so the existing error toast receives the failure', async () => {
    prepare({ message: 'status constraint rejected credited' });
    await expect(createAndSendCreditInvoice({ originalId: 'original', reason: 'Rättning', createdBy: 'Kontoret' })).rejects.toThrow('status constraint rejected credited');
  });
});