import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getISOWeek, getISOWeekYear } from 'date-fns';

function makeDeliveryCase() {
  const now = new Date();
  return {
    id: 'case-123',
    address: 'Testvägen 12',
    customer_name: 'Kund Testsson',
    customer_phone: null,
    status: 'godkand',
    created_at: now.toISOString(),
    delivery_week: getISOWeek(now),
    delivery_year: getISOWeekYear(now),
    team: 'Team A',
    montage_date: '2026-10-20',
  };
}

function makeFollowupCase(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, address: `Avstämningsgatan ${id}`, customer_name: 'Kund Avstäm', customer_phone: '070 123 45 67',
    status: 'montage_klart', created_at: '2026-10-01T08:00:00Z', status_changed_at: '2026-10-20T08:00:00Z',
    team: 'Team A', montage_date: '2026-10-20', customer_followup_done_at: null,
    customer_followup_contacted_at: null, customer_followup_signed_at: null, ...extra,
  };
}

vi.mock('@/lib/supabaseClient', () => ({
  fetchAllCases: vi.fn().mockImplementation(() => Promise.resolve([
    makeDeliveryCase(),
    makeFollowupCase('1'),
    makeFollowupCase('2', { status: 'fakturerad', customer_followup_done_at: '2026-10-25T08:00:00Z' }),
    makeFollowupCase('3', { customer_followup_contacted_at: '2026-10-21T08:00:00Z', customer_followup_signed_at: '2026-10-21T09:00:00Z' }),
    makeFollowupCase('4', { status: 'fakturerad', customer_followup_done_at: '2026-10-25T08:00:00Z', waste_pickup_requested_at: '2026-11-01T08:00:00Z', waste_pickup_note: 'Emballage vid garaget' }),
    makeFollowupCase('5', { status: 'fakturerad', customer_followup_done_at: '2026-10-25T08:00:00Z', waste_pickup_requested_at: '2026-11-01T08:00:00Z', waste_pickup_booked_at: '2026-11-02T08:00:00Z' }),
  ])),
  fetchAllDeviations: vi.fn().mockResolvedValue([]),
  updateCase: vi.fn(),
  updateDeviation: vi.fn(),
  createCaseEvent: vi.fn(),
  createCaseCost: vi.fn(),
  sendMontorAssignmentEmail: vi.fn(),
  sendWastePickupEmail: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

vi.mock('@/hooks/useMontorTeams', () => ({
  useMontorTeams: () => ({ names: ['Team A'], emailOf: () => null, phoneOf: () => null }),
}));

vi.mock('@/lib/activityLog', () => ({ logActivity: vi.fn() }));

import { CoordinatorInbox } from '../CoordinatorInbox';

function renderInbox(onSelectCase?: (c: any) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CoordinatorInbox coordinatorName="Test Koordinator" onSelectCase={onSelectCase} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CoordinatorInbox — Veckans leveranser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderar leveransen som en klickbar länk med djup-länk till ärendet', async () => {
    renderInbox();
    const link = await screen.findByRole('link', { name: /Testvägen 12/ });
    expect(link).toHaveAttribute('href', '/?case=case-123');
  });

  it('vanligt klick öppnar ärendet via onSelectCase utan sidnavigering', async () => {
    const onSelectCase = vi.fn();
    renderInbox(onSelectCase);
    const link = await screen.findByRole('link', { name: /Testvägen 12/ });
    fireEvent.click(link);
    expect(onSelectCase).toHaveBeenCalledTimes(1);
    expect(onSelectCase.mock.calls[0][0].id).toBe('case-123');
  });

  it('ctrl/cmd-klick anropar inte onSelectCase (ny flik hanteras av webbläsaren)', async () => {
    const onSelectCase = vi.fn();
    renderInbox(onSelectCase);
    const link = await screen.findByRole('link', { name: /Testvägen 12/ });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    expect(onSelectCase).not.toHaveBeenCalled();
  });
});

describe('CoordinatorInbox — Att stämma av med kund', () => {
  beforeEach(() => vi.clearAllMocks());

  it('visar bara öppna avstämningar och räknar dem i sammanfattningen', async () => {
    renderInbox();
    expect(await screen.findByText('2 kundavstämningar och 1 skräphämtning väntar')).toBeInTheDocument();
    const cards = screen.getAllByTestId('followup-card');
    expect(cards).toHaveLength(2);
    expect(screen.queryByText('Avstämningsgatan 2')).not.toBeInTheDocument();
  });

  it('Klarmarkera är spärrad tills båda kryssen är ibockade', async () => {
    renderInbox();
    const cards = await screen.findAllByTestId('followup-card');
    const btn = (i: number) => cards[i].querySelector('button[class*="min-h-12"]') as HTMLButtonElement;
    expect(btn(0)).toBeDisabled();
    expect(btn(1)).not.toBeDisabled();
  });
});

describe('CoordinatorInbox — Skräp att boka hämtning för', () => {
  it('visar bara begärda och obokade hämtningar', async () => {
    renderInbox();
    const cards = await screen.findAllByTestId('waste-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Avstämningsgatan 4');
    expect(cards[0]).toHaveTextContent('Emballage vid garaget');
  });
});
