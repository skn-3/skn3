import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, computeGolv, computeMalning, priceLine, toOfferLineItems,
  runKontroller, canSend, type KalkylData, type GolvInput, type MalningInput, type RoomDims,
} from '@/lib/kalkyl';
import { calcOfferTotals } from '@/lib/offerCalc';
import { seedPriceItems } from './kalkylFixture';

const ROOM: RoomDims = { length: 6.0, width: 4.1, height: 2.5, doors: 2, windows: 2 };
const GOLV: GolvInput = {
  material_code: 'golv.mat.ekparkett-3stav', direction: 'langs',
  underlag: true, sockel: true, troskel: true, rivning: true, flytspackling: false, mobelflytt: false, bortforsling: true,
};
const MALNING: MalningInput = { underarbete: 'normal', tak: true, snickerier: false };
const TODAY = '2026-11-12';

function kalkyl(prices = indexPrices(seedPriceItems()), golv: GolvInput = GOLV, malning: MalningInput = MALNING): KalkylData {
  return {
    version: 1,
    premises: { house_type: 'villa', build_year: 1968, floors: 1 },
    rooms: [{ id: 'r1', name: 'Vardagsrum', dims: ROOM }],
    rows: [
      { id: 'g', room_id: 'r1', trade: 'golv', title: 'Golv', input: golv, lines: computeGolv(ROOM, golv, prices, S) },
      { id: 'm', room_id: 'r1', trade: 'malning', title: 'Målning', input: malning, lines: computeMalning(ROOM, malning, prices, S) },
    ],
    common: [priceLine('etablering', prices, 'gem.ovr.etablering', 1, { description: 'Etablering', unit: 'fast', rot_class: 'ovrigt' })],
    adjustments: [],
    priced_at: TODAY,
  };
}

describe('toOfferLineItems', () => {
  it('golv + målning + etablering ger sex offertrader och rätt totaler', () => {
    const items = toOfferLineItems(kalkyl());
    expect(items).toHaveLength(6);
    expect(items.filter(i => i.is_labor)).toHaveLength(2);
    expect(items[0].description).toBe('Vardagsrum – Golv: arbete (Läggning klickparkett, Montering sockellist, Montering tröskel, Rivning befintligt golv)');
    const totals = calcOfferTotals(items, { vat_mode: 'vanlig', rot_enabled: false, rot_percent: 30 });
    expect(totals.total_ex_vat).toBeCloseTo(35984.46, 2);
    expect(totals.labor_ex_vat).toBeCloseTo(17884.0, 2);
  });
  it('rabatt blir egen offertrad', () => {
    const data = kalkyl();
    data.adjustments = [{ id: 'x', label: 'Rabatt', amount: -500, rot_class: 'arbete' }];
    const items = toOfferLineItems(data);
    expect(items).toHaveLength(7);
    expect(items[6]).toMatchObject({ description: 'Rabatt', amount: -500, is_labor: true });
  });
});

describe('kontroller', () => {
  it('pris saknas: tomt pris, belopp 0, blockerar', () => {
    const prices = indexPrices(seedPriceItems(i => (i.code === 'golv.mat.ekparkett-3stav' ? { price_ex_vat: null, status: 'godkand' } : { status: 'godkand' })));
    const data = kalkyl(prices);
    const mat = data.rows[0].lines.find(l => l.key === 'golv.material')!;
    expect(mat.unit_price).toBeNull();
    expect(mat.amount).toBe(0);
    const k = runKontroller(data, prices, S, TODAY);
    expect(k.find(x => x.id === 'pris_saknas:g')?.blocking).toBe(true);
    expect(canSend(k)).toBe(false);
  });
  it('utkastpriser blockerar med pris_ej_godkant', () => {
    const prices = indexPrices(seedPriceItems());
    const k = runKontroller(kalkyl(prices), prices, S, TODAY);
    expect(k.some(x => x.id.startsWith('pris_ej_godkant') && x.blocking)).toBe(true);
    expect(canSend(k)).toBe(false);
  });
  it('godkända och aktuella priser kan skickas', () => {
    const prices = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    const k = runKontroller(kalkyl(prices), prices, S, TODAY);
    expect(canSend(k)).toBe(true);
    expect(k.some(x => x.id.startsWith('pris_gammalt'))).toBe(false);
  });
  it('prisdatum 2026-08-14 är gammalt den 2026-11-12', () => {
    const prices = indexPrices(seedPriceItems(() => ({ status: 'godkand', price_date: '2026-08-14' })));
    const k = runKontroller(kalkyl(prices), prices, S, TODAY);
    const stale = k.find(x => x.id === 'pris_gammalt:g');
    expect(stale).toBeTruthy();
    expect(stale!.blocking).toBe(false);
  });
  it('golvregler', () => {
    const prices = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    const k = runKontroller(kalkyl(prices, { ...GOLV, underlag: false, sockel: false }), prices, S, TODAY);
    expect(k.find(x => x.id === 'golv_underlag_saknas:g')?.level).toBe('atgard');
    expect(k.find(x => x.id === 'golv_sockel_saknas:g')?.level).toBe('info');
    expect(k.find(x => x.id === 'golv_avjamning:g')?.level).toBe('info');
    const k2 = runKontroller(kalkyl(prices, { ...GOLV, flytspackling: true }), prices, S, TODAY);
    expect(k2.some(x => x.id === 'golv_avjamning:g')).toBe(false);
  });
  it('mörk kulör med två strykningar', () => {
    const prices = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    const dark = { system: 'RAL' as const, code: 'RAL 7016', dark: true };
    expect(runKontroller(kalkyl(prices, GOLV, { ...MALNING, kulor_vagg: dark, coats: 2 }), prices, S, TODAY)
      .find(x => x.id === 'malning_mork_kulor:m')?.level).toBe('atgard');
    expect(runKontroller(kalkyl(prices, GOLV, { ...MALNING, kulor_vagg: dark }), prices, S, TODAY)
      .some(x => x.id === 'malning_mork_kulor:m')).toBe(false);
  });
  it('ROT-femårsregeln', () => {
    const prices = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    const data = kalkyl(prices);
    data.premises.build_year = 2023;
    expect(runKontroller(data, prices, S, TODAY).find(x => x.id === 'rot_femarsregeln')?.level).toBe('atgard');
    data.premises.build_year = 2015;
    expect(runKontroller(data, prices, S, TODAY).some(x => x.id === 'rot_femarsregeln')).toBe(false);
  });
  it('marginal under mål och kostnad saknas', () => {
    const noCost = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    expect(runKontroller(kalkyl(noCost), noCost, S, TODAY).find(x => x.id === 'kostnad_saknas')?.level).toBe('info');
    const thin = indexPrices(seedPriceItems(i => ({ status: 'godkand', cost_ex_vat: i.price_ex_vat == null ? null : i.price_ex_vat * 0.9 })));
    const data = kalkyl(thin);
    data.common = [];
    expect(runKontroller(data, thin, S, TODAY).find(x => x.id === 'marginal_under_mal')?.level).toBe('atgard');
  });
  it('manuell mängd som avviker mer än 15 %', () => {
    const prices = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    const data = kalkyl(prices);
    data.rows[0].overrides = { 'golv.rivning': { qty: 30 }, 'golv.troskel': { qty: 2 } };
    const k = runKontroller(data, prices, S, TODAY);
    expect(k.find(x => x.id === 'mangd_manuell:g:golv.rivning')?.level).toBe('info');
    expect(k.some(x => x.id === 'mangd_manuell:g:golv.troskel')).toBe(false);
  });
});
