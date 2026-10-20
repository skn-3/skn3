import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), update: vi.fn(), eq: vi.fn(), build: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ update: mocks.update }),
} }));
vi.mock('../aOrderPdf', () => ({
  loadAOrderLogo: async () => null,
  buildAOrderPdf: mocks.build,
}));
import { regenerateAOrderPdf } from '../aOrderRegeneration';

const order = {
  id: 'invoice-id', status: 'invoiced', invoice_number: 'TOMEK-003', order_number: 756,
  date: '2026-10-19', invoice_sent_at: '2026-10-20T15:42:11.000Z',
  customer_address: 'Bergsvägen 48, Lidingö', description: 'Montage',
  line_items: [{ name: 'Montage', qty: 1, unit_price: 469, amount: 469 }],
  montor_teams: { name: 'Tomek', invoice_email: 'team@example.test' },
};

describe('A-order PDF regeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { ok: true, pdf_path: 'a-orders/invoice-id-faktura.pdf' }, error: null });
    mocks.eq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.build.mockReturnValue({ output: () => 'data:application/pdf;base64,cGRm' });
  });

  it('replaces only pdf_path, preserving invoice status, dates, counters and case history', async () => {
    await regenerateAOrderPdf(order, true);
    expect(mocks.update.mock.calls).toEqual([[{ pdf_path: 'a-orders/invoice-id-faktura.pdf' }]]);
    expect(mocks.eq).toHaveBeenCalledWith('id', 'invoice-id');
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ variant: 'invoice', date: '2026-10-20', orderNumber: 'TOMEK-003', aOrderNumber: 756, aOrderDate: '2026-10-19', lines: order.line_items }));
    expect(mocks.invoke).toHaveBeenCalledWith('send-a-order-invoice', { body: expect.objectContaining({ skip_email: false, storage_subpath: 'faktura', file_name: 'Faktura-TOMEK-003-Tomek-Bergsvagen-48-Lidingo-2026-10-20.pdf' }) });
  });

  it('supports storage-only regeneration without an email address', async () => {
    await regenerateAOrderPdf({ ...order, montor_teams: { name: 'Tomek' } }, false);
    expect(mocks.invoke.mock.calls[0][1].body.skip_email).toBe(true);
  });

  it('regenerates credit notes using their stored lines, description and credit path', async () => {
    const credit = { ...order, status: 'credited', credited_from_order_id: 'original', description: 'Kreditering av faktura TOMEK-001' };
    await regenerateAOrderPdf(credit, false);
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ variant: 'credit', subNote: credit.description, lines: credit.line_items }));
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ kind: 'credit', storage_subpath: 'kredit' });
  });

  it('rejects non-invoiced orders before generating or updating anything', async () => {
    await expect(regenerateAOrderPdf({ ...order, status: 'order' }, true)).rejects.toThrow('Ordern är inte fakturerad');
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});