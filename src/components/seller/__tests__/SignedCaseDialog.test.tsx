import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  createCase: vi.fn(),
  updateVisit: vi.fn(),
  createCaseEvent: vi.fn(),
  sendNotificationEmail: vi.fn(),
  sendKlimatEvent: vi.fn(),
  toastSuccess: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('@/lib/supabaseClient', () => ({
  createCase: mocks.createCase,
  updateVisit: mocks.updateVisit,
  createCaseEvent: mocks.createCaseEvent,
  sendNotificationEmail: mocks.sendNotificationEmail,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));
vi.mock('@/lib/klimat', () => ({ sendKlimatEvent: mocks.sendKlimatEvent }));
vi.mock('@/lib/activityLog', () => ({ logActivity: mocks.logActivity }));
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/shared/DuplicateCaseGuard', () => ({
  useDuplicateCaseGuard: () => ({ guard: async (_a: string, proceed: () => void) => proceed(), dialog: null, checking: false }),
}));
vi.mock('@/components/shared/KlimatQrDialog', () => ({
  KlimatQrDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="klimat-qr-dialog" /> : null),
  KlimatQrInline: () => null,
}));

import { SignedCaseDialog } from '@/components/seller/SignedCaseDialog';

const visit = {
  id: 'visit-1',
  customer_name: 'Kund Testsson',
  address: 'Storgatan 1',
  order_value: 120000,
} as any;

function renderDialog(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SignedCaseDialog visit={visit} sellerName="Säljare S" onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createCase.mockResolvedValue({ id: 'case-1' });
  mocks.updateVisit.mockResolvedValue({});
  mocks.createCaseEvent.mockResolvedValue({});
  mocks.sendKlimatEvent.mockResolvedValue({ ok: true, claim_url: 'https://smartklimat.org/c/x', total_trees: 3 });
});

describe('SignedCaseDialog', () => {
  it('har inte de gamla fälten (TB, extra timmar, telefon, Drive-länk, montörer)', () => {
    renderDialog();
    for (const label of [/^TB/, /^Extra timmar/, /^Telefon/, /Google Drive/, /^KM-montör/, /^Montage-montör/]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      expect(screen.queryAllByText(label, { selector: 'label' })).toHaveLength(0);
    }
    expect(screen.getByText('Telefon, TB, montörer m.m. kompletteras efter kontrollmätningen.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordervärde (kr) ex moms')).toHaveValue(120000);
  });

  it('fyller i kundnamn, adress och ordervärde när ett besök öppnas i en redan monterad dialog', () => {
    const qc = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}><SignedCaseDialog visit={null} sellerName="S" onClose={vi.fn()} /></QueryClientProvider>,
    );
    rerender(<QueryClientProvider client={qc}><SignedCaseDialog visit={visit} sellerName="S" onClose={vi.fn()} /></QueryClientProvider>);
    expect(screen.getByLabelText('Kundnamn *')).toHaveValue('Kund Testsson');
    expect(screen.getByLabelText('Adress *')).toHaveValue('Storgatan 1');
    expect(screen.getByLabelText('Ordervärde (kr) ex moms')).toHaveValue(120000);
  });

  it('kräver affärsförslagsnummer', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Antal enheter *'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Ort *'), { target: { value: 'Uppsala' } });
    const offer = screen.getByLabelText('Affärsförslagsnummer (Mockfjärds) *');
    fireEvent.blur(offer);
    expect(screen.getByText('Affärsförslagsnumret måste fyllas i.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skapa ärende' })).toBeDisabled();
    fireEvent.change(offer, { target: { value: 'AF-1' } });
    expect(screen.getByRole('button', { name: 'Skapa ärende' })).toBeEnabled();
  });

  it('skapar bantat ärende, skickar signeringsträd och öppnar ingen QR-dialog', async () => {
    const onClose = renderDialog();
    fireEvent.change(screen.getByLabelText('Antal enheter *'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Ort *'), { target: { value: 'Uppsala' } });
    fireEvent.change(screen.getByLabelText('Affärsförslagsnummer (Mockfjärds) *'), { target: { value: 'AF-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Skapa ärende' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const record = mocks.createCase.mock.calls[0][0];
    expect(record).toMatchObject({ tb_percent: null, extra_hours_sold: 0, customer_phone: '', team: null, km_team: null, google_drive_link: null, notes: null, status: 'vantar_km', offer_number: 'AF-1', units: 3 });
    expect(mocks.updateVisit).toHaveBeenCalledWith('visit-1', { result: 'signerat', case_id: 'case-1' });
    expect(mocks.sendKlimatEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'signing', caseId: 'case-1', visitId: 'visit-1', treeCount: 3 }));
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'followup_signed_case_created', case_id: 'case-1' }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Ärende skapat – 3 träd registrerade på kunden');
    expect(screen.queryByTestId('klimat-qr-dialog')).not.toBeInTheDocument();
  });
});
