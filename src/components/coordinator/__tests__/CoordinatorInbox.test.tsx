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

vi.mock('@/lib/supabaseClient', () => ({
  fetchAllCases: vi.fn().mockImplementation(() => Promise.resolve([makeDeliveryCase()])),
  fetchAllDeviations: vi.fn().mockResolvedValue([]),
  updateCase: vi.fn(),
  updateDeviation: vi.fn(),
  createCaseEvent: vi.fn(),
  createCaseCost: vi.fn(),
  sendMontorAssignmentEmail: vi.fn(),
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
