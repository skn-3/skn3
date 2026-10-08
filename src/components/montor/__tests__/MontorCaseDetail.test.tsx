import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CaseRow } from '@/lib/supabaseClient';

const mocks = vi.hoisted(() => ({
  team: { id: 'team-own', name: 'Test Team' } as { id: string; name: string } | null,
  filters: [] as [string, unknown][],
  selects: [] as string[],
  openOk: true,
  toastError: vi.fn(),
  orders: [] as Record<string, unknown>[],
  signedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.test/document.pdf' } }),
}));

// Default order rows: one normally invoiced order (has local invoice PDF) and one credit note.
const DEFAULT_ORDERS: Record<string, unknown>[] = [
  { id: 'order-own', order_number: 12, date: '2026-10-08', total_amount: 469, status: 'invoiced', pdf_path: 'a-orders/order-own-faktura.pdf', order_sent_at: '2026-10-08', invoice_sent_at: '2026-10-08', invoice_number: 'F12' },
  { id: 'credit-own', order_number: null, date: '2026-10-08', total_amount: -469, status: 'credited', credited_from_order_id: 'order-own', pdf_path: 'a-orders/credit-own-kredit.pdf', invoice_number: 'K12' },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const chain = {
        select: (columns: string) => { if (table === 'a_orders') mocks.selects.push(columns); return chain; },
        eq: (column: string, value: unknown) => { if (table === 'a_orders') mocks.filters.push([column, value]); return chain; },
        maybeSingle: async () => ({ data: mocks.team, error: null }),
        order: () => chain,
        then: (resolve: (result: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: mocks.orders, error: null }).then(resolve),
      };
      return chain;
    },
    storage: { from: () => ({ createSignedUrl: mocks.signedUrl }) },
  },
}));
vi.mock('@/lib/supabaseClient', () => ({
  fetchCaseById: async () => caseData,
  fetchCaseEvents: async () => [],
  fetchDeviations: async () => [],
  fetchCaseCosts: async () => [],
}));
vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/openDocument', () => ({
  openDocumentInNewTab: async (resolve: () => Promise<string | null>) => {
    await resolve();
    return mocks.openOk;
  },
}));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args), success: vi.fn() },
}));
vi.mock('@/components/sheet-metal/SheetMetalOrdersSection', () => ({ SheetMetalOrdersSection: () => null }));
vi.mock('@/components/montor/MontorLitteraSection', () => ({ MontorLitteraSection: () => null }));

import { MontorCaseDetail } from '../MontorCaseDetail';

const caseData = { id: 'case-test', address: 'Testvägen 12', customer_name: 'Testkund', customer_phone: '', status: 'fakturerad', extra_hours_requested: 0 } as CaseRow;
function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><MontorCaseDetail caseData={caseData} currentUser="Test Team" hasUnresolvedDeviation={false} onBack={() => {}} /></MemoryRouter></QueryClientProvider>);
}

describe('MontorCaseDetail A-order access', () => {
  beforeEach(() => {
    mocks.team = { id: 'team-own', name: 'Test Team' };
    mocks.filters.length = 0;
    mocks.selects.length = 0;
    mocks.openOk = true;
    mocks.orders = DEFAULT_ORDERS;
    mocks.signedUrl.mockClear();
    mocks.toastError.mockClear();
  });

  it('filtrerar ordrarna till montörens eget team', async () => {
    renderDetail();
    await waitFor(() => expect(mocks.filters).toContainEqual(['team_id', 'team-own']));
    expect(mocks.filters).toContainEqual(['case_id', 'case-test']);
  });

  it('hämtar inga internal_*-fält', async () => {
    renderDetail();
    await waitFor(() => expect(mocks.selects).toHaveLength(1));
    expect(mocks.selects[0]).toBe('id, order_number, created_at, date, total_amount, status, pdf_path, order_sent_at, invoice_number, invoice_sent_at, credited_from_order_id');
    expect(mocks.selects[0]).not.toMatch(/internal_|\*/);
  });

  it('låter admin utan matchande team hämta ärendets ordrar utan teamfilter', async () => {
    mocks.team = null;
    renderDetail();
    await screen.findByRole('button', { name: 'A-order PDF' });
    expect(mocks.filters).toEqual([['case_id', 'case-test']]);
  });

  it.each([
    ['A-order PDF', 'a-orders/order-own.pdf'],
    ['Faktura PDF', 'a-orders/order-own-faktura.pdf'],
    ['Kreditfaktura PDF', 'a-orders/credit-own-kredit.pdf'],
  ])('öppnar %s via rätt separat sökväg', async (label, path) => {
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(mocks.signedUrl).toHaveBeenCalledWith(path, 600));
  });

  it('visar inte Faktura PDF för migrerad order utan pdf_path', async () => {
    mocks.orders = [
      { id: 'order-mig', order_number: 5, date: '2026-10-08', total_amount: 1200, status: 'invoiced', pdf_path: null, order_sent_at: null, invoice_sent_at: '2026-10-08', invoice_number: 'F5' },
    ];
    renderDetail();
    await screen.findByText('PDF ej genererad ännu');
    expect(screen.queryByRole('button', { name: 'Faktura PDF' })).toBeNull();
  });

  it('visar Faktura PDF när pdf_path finns även om order_sent_at saknas', async () => {
    mocks.orders = [
      { id: 'order-mig2', order_number: 6, date: '2026-10-08', total_amount: 1200, status: 'invoiced', pdf_path: 'a-orders/order-mig2-faktura.pdf', order_sent_at: null, invoice_sent_at: '2026-10-08', invoice_number: 'F6' },
    ];
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Faktura PDF' }));
    await waitFor(() => expect(mocks.signedUrl).toHaveBeenCalledWith('a-orders/order-mig2-faktura.pdf', 600));
  });

  it('meddelar när en PDF inte går att öppna', async () => {
    mocks.openOk = false;
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'A-order PDF' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('PDF:en kunde inte öppnas'));
  });
});
