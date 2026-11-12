import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, floorArea, perimeter, sockelLength, wallArea, packsNeeded, withWaste,
  indexPrices, computeGolv, computeMalning, summarize, applyOverrides, summarizeKalkyl, priceLine,
  type GolvInput, type MalningInput, type RoomDims, type KalkylLine,
} from '@/lib/kalkyl';
import { seedPriceItems } from './kalkylFixture';

const ROOM: RoomDims = { length: 6.0, width: 4.1, height: 2.5, doors: 2, windows: 2 };
const prices = indexPrices(seedPriceItems());
const byKey = (lines: KalkylLine[]) => Object.fromEntries(lines.map(l => [l.key, l]));

const GOLV: GolvInput = {
  material_code: 'golv.mat.ekparkett-3stav', direction: 'langs',
  underlag: true, sockel: true, troskel: true, rivning: true, flytspackling: false, mobelflytt: false, bortforsling: true,
};
const MALNING: MalningInput = { underarbete: 'normal', tak: true, snickerier: false };

describe('geometri', () => {
  it('rum 6,0 × 4,1 × 2,5 med 2 dörrar och 2 fönster', () => {
    expect(floorArea(ROOM)).toBeCloseTo(24.6, 6);
    expect(perimeter(ROOM)).toBeCloseTo(20.2, 6);
    expect(sockelLength(ROOM, S)).toBeCloseTo(18.4, 6);
    expect(wallArea(ROOM, S)).toBeCloseTo(43.6, 6);
  });
  it('blir aldrig negativ', () => {
    expect(wallArea({ length: 1, width: 1, height: 1, doors: 4, windows: 4 }, S)).toBe(0);
    expect(sockelLength({ length: 0.5, width: 0.5, height: 2, doors: 3, windows: 0 }, S)).toBe(0);
  });
});

describe('förpackningar', () => {
  it('räknar hela förpackningar', () => {
    expect(packsNeeded(26.568, 3.18)).toBe(9);
    expect(packsNeeded(25.83, 15)).toBe(2);
    expect(packsNeeded(20.24, 2.4)).toBe(9);
    expect(packsNeeded(6.36, 3.18)).toBe(2);
  });
  it('exakt multipel ger ingen extra förpackning trots flyttalsfel', () => {
    expect(packsNeeded(0.1 + 0.2, 0.3)).toBe(1);
    expect(packsNeeded(3 * 3.18, 3.18)).toBe(3);
  });
  it('spill i procent', () => {
    expect(withWaste(24.6, 8)).toBeCloseTo(26.568, 9);
  });
});

describe('golv', () => {
  const lines = computeGolv(ROOM, GOLV, prices, S);
  const k = byKey(lines);

  it('materialet räknas i hela paket med spill', () => {
    expect(k['golv.material'].qty).toBeCloseTo(28.62, 2);
    expect(k['golv.material'].unit_price).toBe(343.2);
    expect(k['golv.material'].amount).toBe(9822.38);
    expect(k['golv.material'].detail).toBe('9 paket (28,6 m²)');
  });
  it('varje rad enligt receptet', () => {
    expect(k['golv.laggning'].code).toBe('golv.arb.lagg-klick');
    expect(k['golv.laggning'].amount).toBe(5805.6);
    expect(k['golv.underlag'].qty).toBe(30);
    expect(k['golv.underlag'].amount).toBe(936);
    expect(k['golv.sockel'].qty).toBeCloseTo(21.6, 2);
    expect(k['golv.sockel'].amount).toBe(535.68);
    expect(k['golv.sockel_montering'].amount).toBe(662.4);
    expect(k['golv.troskel'].amount).toBe(558.4);
    expect(k['golv.troskel_montering'].amount).toBe(240);
    expect(k['golv.rivning'].amount).toBe(1869.6);
    expect(k['golv.bortforsling'].amount).toBe(1520);
    expect(k['golv.flytspackel']).toBeUndefined();
  });
  it('summor per ROT-klass', () => {
    const s = summarize(lines);
    expect(s.material).toBe(11852.46);
    expect(s.arbete).toBe(8577.6);
    expect(s.ovrigt).toBe(1520);
    expect(s.total_ex_vat).toBe(21950.06);
  });
  it('med flytspackling', () => {
    const s = summarize(computeGolv(ROOM, { ...GOLV, flytspackling: true }, prices, S));
    expect(s.material).toBeCloseTo(11852.46 + 1928.64, 2);
    expect(s.arbete).toBeCloseTo(8577.6 + 2892.96, 2);
  });
});

describe('målning', () => {
  it('normalt underarbete, tak, ljus kulör', () => {
    const lines = computeMalning(ROOM, MALNING, prices, S);
    const k = byKey(lines);
    expect(k['malning.vagg'].amount).toBe(6452.8);
    expect(k['malning.vagg_extra']).toBeUndefined();
    expect(k['malning.vaggfarg'].qty).toBe(11);
    expect(k['malning.vaggfarg'].amount).toBe(1320);
    expect(k['malning.tak'].amount).toBe(2853.6);
    expect(k['malning.takfarg'].qty).toBe(8);
    expect(k['malning.takfarg'].amount).toBe(704);
    expect(k['malning.forbrukning'].amount).toBe(712);
    const s = summarize(lines);
    expect(s.arbete).toBe(9306.4);
    expect(s.material).toBe(2736);
    expect(s.total_ex_vat).toBe(12042.4);
  });
  it('mörk kulör ger tre strykningar', () => {
    const lines = computeMalning(ROOM, { ...MALNING, kulor_vagg: { system: 'NCS', code: 'S 7502-B', dark: true } }, prices, S);
    const k = byKey(lines);
    expect(k['malning.vagg_extra'].amount).toBe(1744);
    expect(k['malning.vaggfarg'].qty).toBe(17);
    expect(k['malning.vaggfarg'].amount).toBe(2040);
    const s = summarize(lines);
    expect(s.arbete).toBe(11050.4);
    expect(s.material).toBe(3456);
  });
  it('snickerier', () => {
    const k = byKey(computeMalning(ROOM, { ...MALNING, snickerier: true }, prices, S));
    expect(k['malning.foder'].qty).toBe(4);
    expect(k['malning.foder'].amount).toBe(1280);
    expect(k['malning.sockelmalning'].amount).toBe(640.32);
    expect(k['malning.snickerifarg'].qty).toBe(1);
    expect(k['malning.snickerifarg'].amount).toBe(312);
  });
});

describe('ändringar och summering', () => {
  const lines = computeGolv(ROOM, GOLV, prices, S);
  it('ändrad mängd eller pris markeras manuell och räknas om', () => {
    const out = byKey(applyOverrides(lines, { 'golv.rivning': { qty: 10 }, 'golv.troskel': { unit_price: 300 }, 'golv.bortforsling': { removed: true } }));
    expect(out['golv.rivning']).toMatchObject({ qty: 10, amount: 760, manual: true });
    expect(out['golv.troskel']).toMatchObject({ unit_price: 300, amount: 600, manual: true });
    expect(out['golv.bortforsling']).toBeUndefined();
    expect(out['golv.material'].manual).toBeUndefined();
  });
  it('täckningsbidrag bara säkert när alla rader med belopp har kostnad', () => {
    const withCost = indexPrices(seedPriceItems(i => ({ cost_ex_vat: i.price_ex_vat == null ? null : i.price_ex_vat * 0.5 })));
    const s = summarize(computeGolv(ROOM, GOLV, withCost, S));
    expect(s.cost_known).toBe(true);
    expect(s.tb).toBeCloseTo(21950.06 / 2, 0);
    expect(s.tb_pct).toBeCloseTo(50, 1);
    expect(summarize(lines).cost_known).toBe(false);
  });
  it('summerar rader, gemensamma rader och rabatt', () => {
    const s = summarizeKalkyl({
      version: 1, premises: { house_type: 'villa', build_year: 1975, floors: 1 },
      rooms: [{ id: 'r1', name: 'Vardagsrum', dims: ROOM }],
      rows: [{ id: 'g', room_id: 'r1', trade: 'golv', title: 'Golv', input: GOLV, lines }],
      common: [priceLine('etablering', prices, 'gem.ovr.etablering', 1, { description: 'Etablering', unit: 'fast', rot_class: 'ovrigt' })],
      adjustments: [{ id: 'a', label: 'Rabatt', amount: -1000, rot_class: 'ovrigt' }],
      priced_at: null,
    });
    expect(s.total_ex_vat).toBeCloseTo(21950.06 + 1992 - 1000, 2);
    expect(s.total_incl_vat).toBe(28677.58);
  });
});
