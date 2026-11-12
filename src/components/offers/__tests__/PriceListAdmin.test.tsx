import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seedPriceItems } from '@/lib/__tests__/kalkylFixture';
import { DEFAULT_KALKYL_SETTINGS } from '@/lib/kalkyl';

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  updatePriceItem: vi.fn(),
  insertPriceItems: vi.fn(),
}));

vi.mock('@/components/offers/priceList/api', () => ({
  PRICE_ITEMS_KEY: ['price_items'],
  KALKYL_SETTINGS_KEY: ['kalkyl_settings'],
  priceLogKey: (id: string) => ['price_log', id],
  fetchPriceItems: () => Promise.resolve(mocks.items),
  fetchKalkylSettings: () => Promise.resolve(DEFAULT_KALKYL_SETTINGS),
  fetchPriceLog: () => Promise.resolve([]),
  saveKalkylSettings: vi.fn(),
  updatePriceItem: mocks.updatePriceItem,
  insertPriceItems: mocks.insertPriceItems,
  uploadCatalogImage: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

import { PriceListAdmin } from '@/components/offers/PriceListAdmin';

function renderAdmin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PriceListAdmin currentUser="Mirna" /></QueryClientProvider>);
}

beforeEach(() => {
  mocks.items = seedPriceItems(i => (i.code === 'golv.arb.rivning' ? { price_ex_vat: null } : {}));
  mocks.updatePriceItem.mockReset().mockResolvedValue(undefined);
  mocks.insertPriceItems.mockReset().mockResolvedValue(undefined);
});

describe('PriceListAdmin', () => {
  it('visar summering och flaggar saknat pris', async () => {
    renderAdmin();
    expect(await screen.findByText('29 rader · 29 utkast · 0 godkända · 1 saknar pris')).toBeInTheDocument();
    expect(screen.getByText('Pris saknas')).toBeInTheDocument();
    expect(screen.getByText('Ekparkett 3-stav')).toBeInTheDocument();
  });

  it('Godkänn valda godkänner bara rader med pris', async () => {
    renderAdmin();
    await screen.findByText('Ekparkett 3-stav');
    fireEvent.click(screen.getByRole('button', { name: /Markera/ }));
    fireEvent.click(screen.getByText('Ekparkett 3-stav').closest('button')!);
    fireEvent.click(screen.getByText('Rivning befintligt golv').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /Godkänn valda/ }));
    await waitFor(() => expect(mocks.updatePriceItem).toHaveBeenCalledTimes(1));
    const [id, patch] = mocks.updatePriceItem.mock.calls[0];
    expect(id).toBe((mocks.items as { id: string; code: string }[]).find(i => i.code === 'golv.mat.ekparkett-3stav')!.id);
    expect(patch).toMatchObject({ status: 'godkand', approved_by: 'Mirna', updated_by: 'Mirna' });
  });

  it('importen sparar ändrade rader som utkast', async () => {
    renderAdmin();
    await screen.findByText('Ekparkett 3-stav');
    fireEvent.click(screen.getByRole('button', { name: /Importera/ }));
    fireEvent.change(await screen.findByLabelText('Inklistrat prisark'), {
      target: { value: 'kod;gren;typ;rot;namn;enhet;pris_ex_moms\ngolv.mat.ekparkett-3stav;golv;material;material;Ekparkett 3-stav;m²;359,90\nny.rad;golv;material;material;Ny rad;m²;10' },
    });
    const btn = await screen.findByRole('button', { name: 'Importera 2 rader som utkast' });
    fireEvent.click(btn);
    await waitFor(() => expect(mocks.updatePriceItem).toHaveBeenCalledTimes(1));
    expect(mocks.updatePriceItem.mock.calls[0][1]).toMatchObject({ price_ex_vat: 359.9, status: 'utkast', approved_by: null });
    expect(mocks.insertPriceItems.mock.calls[0][0][0]).toMatchObject({ code: 'ny.rad', status: 'utkast', price_ex_vat: 10 });
  });

  it('filtret Behöver kontroll döljer godkända aktuella rader', async () => {
    mocks.items = seedPriceItems(i => (i.code === 'golv.mat.laminat-ek' ? {} : { status: 'godkand' }));
    renderAdmin();
    await screen.findByText('Laminat ek');
    fireEvent.click(screen.getByRole('switch', { name: 'Behöver kontroll' }));
    await waitFor(() => expect(screen.queryByText('Ekparkett 3-stav')).not.toBeInTheDocument());
    const list = screen.getByText('Laminat ek').closest('ul')!;
    expect(within(list).getAllByRole('button')).toHaveLength(1);
  });
});
