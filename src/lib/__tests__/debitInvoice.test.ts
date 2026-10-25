import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAndSendCreditInvoice } from '../debitInvoice';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke }, auth: { getUser: mocks.getUser } } }));
vi.mock('@/lib/aOrderPdf', () => ({ loadAOrderLogo: vi.fn().mockResolvedValue('logo') }));
vi.mock('@/lib/montorDebitPdf', () => ({ buildMontorDebitPdf: () => ({ output: () => 'data:application/pdf;base64,cGRm' }) }));
vi.mock('@/lib/selfBillingPdf', () => ({ buildSelfBillingPdf: () => ({ output: () => 'data:application/pdf;base64,cGRm' }) }));

function prepare(updateError: { message: string } | null) {
  const original = { id: 'original', team_id: 'team', invoice_number: 'N3-012', kind: 'debit', line_items: [{ unit_price: 100, amount: 100 }], subtotal: 100, vat_amount: 25, total: 125, vat_mode: 'vanlig' };
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) });
  mocks.from
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: original }) }) }) })
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'team', name: 'Alex NBD' } }) }) }) })
    .mockReturnValueOnce({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'credit', invoice_number: 'N3-013' } }) }) }) })
    .mockReturnValueOnce({ update });
  return update;
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
    const update = prepare(null);
    await expect(createAndSendCreditInvoice({ originalId: 'original', reason: 'Rättning', createdBy: 'Kontoret' })).resolves.toMatchObject({ total: -125 });
    expect(update).toHaveBeenCalledWith({ status: 'credited' });
  });
  it('rejects a failed original update so the existing error toast receives the failure', async () => {
    prepare({ message: 'status constraint rejected credited' });
    await expect(createAndSendCreditInvoice({ originalId: 'original', reason: 'Rättning', createdBy: 'Kontoret' })).rejects.toThrow('status constraint rejected credited');
  });
});