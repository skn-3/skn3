// TEMPORÄR testsida för Playwright – raderas före commit.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import './index.css';
import { KalkylWorkspace } from '@/components/kalkyl/KalkylWorkspace';
import { OffersView } from '@/components/offers/OffersView';
import { seedPriceItems } from '@/lib/__tests__/kalkylFixture';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, newGolvRow, addRow, updateRowInput, newMalningRow,
  addCommonLine, kalkylSaveFields, offerMetaFromRow,
} from '@/lib/kalkyl';

const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const prices = indexPrices(seedPriceItems());

function demo() {
  let d = emptyKalkyl();
  const r1 = newRoom('Vardagsrum', { length: 6, width: 4.1, height: 2.5, doors: 2, windows: 2 });
  const r2 = newRoom('Hall', { length: 3.2, width: 1.8, height: 2.4, doors: 3, windows: 0 });
  d = addRoom(addRoom(d, r1), r2);
  const g = newGolvRow(r1.id, 'golv.mat.ekparkett-3stav');
  d = addRow(d, g, prices, S);
  d = updateRowInput(d, g.id, { troskel: true, rivning: true, bortforsling: true }, prices, S);
  const m = newMalningRow(r1.id);
  d = addRow(d, m, prices, S);
  const m2 = newMalningRow(r2.id);
  d = addRow(d, m2, prices, S);
  d = updateRowInput(d, m2.id, { kulor_vagg: { system: 'NCS', code: 'S 4010-G30Y', name: 'Salvia', hex: '#8E9A80' } }, prices, S);
  d = addCommonLine(d, prices['gem.ovr.etablering']);
  d = { ...d, premises: { house_type: 'villa', build_year: 1968, floors: 1 } };
  return d;
}

const view = params.get('view') ?? 'existing';
const meta = { ...offerMetaFromRow(null), customer_name: 'Anna Lindqvist', customer_address: 'Björkvägen 12, Bromma', customer_email: 'anna@example.se', rot_persons: 2 };
const data = demo();
const fields = kalkylSaveFields(meta, data, prices, S);
const offer = view === 'new' ? null : {
  id: 'offer-1', offer_number: '2026-0014', status: view === 'accepted' ? 'accepted' : view === 'sent' ? 'sent' : 'draft',
  updated_at: '2026-11-12T10:00:00Z', created_at: '2026-11-12T09:00:00Z', ...fields,
};
(window as unknown as { __offer: unknown }).__offer = offer;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    {view === 'list'
      ? <OffersView currentUser="Test Säljare" />
      : <KalkylWorkspace offer={offer} currentUser="Test Säljare" onClose={() => console.log('closed')} onDone={id => console.log('done', id)} />}
    <Sonner />
  </QueryClientProvider>,
);
