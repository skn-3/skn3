import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, addRow, newFriRow, addFriLine, updateFriLine, rowLines,
  summarizeKalkyl, toOfferLineItems, kalkylTotals, runKontroller, sendCheck, offerScopeText, rowSpecText, repriceKalkyl, priceChanges,
  duplicateRow, parseSvNumber, PRICE_TRADES, TRADE_LABEL, GREN_TRADES, isGrenTrade, newGrenRow, isGrenRow, rowTypeLabel, grenItems,
  grenListGroups, grenLineFor, grenLineSplit, defaultGrenQty, setGrenQty, addGrenItem, setGrenMeasure, measureMismatch, applyMeasure,
  setGrenRotOff, rowRotOff, effectiveRotClass, GREN_ROT_RULES,
  type KalkylData, type KalkylRow, type PriceItem, type PriceIndex, type KalkylOfferOptions,
} from '@/lib/kalkyl';

const TODAY = '2026-11-12';
const OPTS: KalkylOfferOptions = { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_used: 0 };

let n = 0;
function pi(patch: Partial<PriceItem> & Pick<PriceItem, 'code' | 'trade' | 'kind' | 'name' | 'unit'>): PriceItem {
  n += 1;
  return {
    id: `t-${n}`, rot_class: patch.kind === 'arbete' ? 'arbete' : 'material', slot: null, spec: null, price_ex_vat: 100, cost_ex_vat: null,
    hours_per_unit: null, level: null, pack_size: null, pack_label: null, waste_pct: 0, coverage: null, color_system: null, color_code: null,
    color_hex: null, swatch: null, image_path: null, article_no: null, supplier: null, source: null, price_date: TODAY, status: 'godkand',
    approved_by: null, approved_at: null, meta: {}, sort_order: 100, updated_by: null, ...patch,
  };
}

const ALTAN_TRALL = pi({ code: 'altan.mat.trall', trade: 'altan', kind: 'material', name: 'Trall tryckimpregnerad', spec: '28×120', unit: 'm²', price_ex_vat: 320, cost_ex_vat: 200, sort_order: 20 });
const ALTAN_BYGG = pi({ code: 'altan.arb.bygg', trade: 'altan', kind: 'arbete', name: 'Bygga altan', unit: 'm²', price_ex_vat: 900, cost_ex_vat: 600, hours_per_unit: 1.5, sort_order: 10 });
const ALTAN_RACKE = pi({ code: 'altan.arb.racke', trade: 'altan', kind: 'arbete', name: 'Räcke', unit: 'm', price_ex_vat: 750, sort_order: 10 });
const ALTAN_TRAPPA = pi({ code: 'altan.till.trappa', trade: 'altan', kind: 'tillbehor', name: 'Trappa', unit: 'st', price_ex_vat: 4500, sort_order: 30 });
const ALTAN_PLINT = pi({ code: 'altan.mat.plint', trade: 'altan', kind: 'material', name: 'Betongplint', unit: 'st', price_ex_vat: 180, sort_order: 20 });
const ALTAN_CONTAINER = pi({ code: 'altan.ovr.container', trade: 'altan', kind: 'ovrigt', rot_class: 'ovrigt', name: 'Container', unit: 'st', price_ex_vat: 3200, sort_order: 50 });
const ALTAN_GAMMAL = pi({ code: 'altan.mat.gammal', trade: 'altan', kind: 'material', name: 'Gammal trall', unit: 'm²', status: 'arkiverad', sort_order: 1 });
const ALTAN_SAKNAR = pi({ code: 'altan.mat.saknar', trade: 'altan', kind: 'material', name: 'Olja', unit: 'l', price_ex_vat: null, sort_order: 90 });
const FASAD_ARB = pi({ code: 'fasad.arb.malning', trade: 'fasad', kind: 'arbete', name: 'Måla fasad', unit: 'm²', price_ex_vat: 400 });
const EL_UTTAG = pi({ code: 'el.arb.uttag', trade: 'el', kind: 'arbete', name: 'Nytt uttag', unit: 'st', price_ex_vat: 1200 });

const ITEMS = [ALTAN_TRALL, ALTAN_BYGG, ALTAN_RACKE, ALTAN_TRAPPA, ALTAN_PLINT, ALTAN_CONTAINER, ALTAN_GAMMAL, ALTAN_SAKNAR, FASAD_ARB, EL_UTTAG];
const P: PriceIndex = indexPrices(ITEMS);
const DIMS = { length: 5, width: 4, height: 2.4, doors: 0, windows: 0 };

function withGren(opts: { room?: boolean; gren?: 'altan' | 'fasad' } = {}): { d: KalkylData; row: KalkylRow } {
  let d = emptyKalkyl();
  const room = opts.room === false ? null : newRoom('Baksida', DIMS);
  if (room) d = addRoom(d, room);
  const row = newGrenRow(room?.id ?? null, opts.gren ?? 'altan', '', room);
  d = addRow(d, row, P, S);
  return { d, row };
}
const rowOf = (d: KalkylData, id: string) => d.rows.find(r => r.id === id)!;

describe('grenrad: skapa och typ', () => {
  it('grenarna följer PRICE_TRADES-ordningen utan golv, målning och gemensamt', () => {
    expect([...GREN_TRADES]).toEqual(PRICE_TRADES.filter(t => !['golv', 'malning', 'gemensamt'].includes(t)));
    expect(isGrenTrade('altan')).toBe(true);
    expect(isGrenTrade('golv')).toBe(false);
    expect(isGrenTrade('gemensamt')).toBe(false);
  });

  it('newGrenRow är en fri rad med gren, grenens etikett som benämning och rummets golvyta som yta', () => {
    const { row } = withGren();
    expect(row.trade).toBe('fri');
    expect(row.gren).toBe('altan');
    expect(row.title).toBe(TRADE_LABEL.altan);
    expect(row.input).toBeNull();
    expect(row.measure).toEqual({ area: 20 });
    expect(isGrenRow(row)).toBe(true);
  });

  it('utan rum får raden inget mått, och en egen benämning behålls', () => {
    const row = newGrenRow(null, 'el', 'Laddbox i garaget');
    expect(row.measure).toBeUndefined();
    expect(row.title).toBe('Laddbox i garaget');
  });

  it('typen i översikten är grenens etikett, annars Golv, Målning eller Fri rad', () => {
    expect(rowTypeLabel(withGren().row)).toBe('Altan och trall');
    expect(rowTypeLabel(newFriRow(null, 'X'))).toBe('Fri rad');
    expect(rowTypeLabel({ trade: 'golv' })).toBe('Golv');
    expect(rowTypeLabel({ trade: 'fri', gren: 'golv' })).toBe('Fri rad');
  });

  it('varje gren har en ROT-regeltext med källa', () => {
    for (const g of GREN_TRADES) { expect(GREN_ROT_RULES[g].text.length).toBeGreaterThan(0); expect(GREN_ROT_RULES[g].source).toMatch(/^Skatteverket/); }
  });
});

describe('sparad kalkyl utan nya fält', () => {
  const saved = (): KalkylData => ({
    ...emptyKalkyl(),
    rows: [{
      id: 'rad_1', room_id: null, trade: 'fri', title: 'Altan', input: null,
      lines: [
        { key: 'fri.a', code: 'altan.arb.bygg', description: 'Bygga altan', rot_class: 'arbete', qty: 12, unit: 'm²', unit_price: 900, amount: 10800, cost: 7200, hours: 18 },
        { key: 'fri.b', code: 'altan.mat.trall', description: 'Trall tryckimpregnerad', rot_class: 'material', qty: 12, unit: 'm²', unit_price: 320, amount: 3840, cost: 2400 },
        { key: 'fri.c', code: null, description: 'Bortforsling', rot_class: 'ovrigt', qty: 1, unit: 'st', unit_price: 1500, amount: 1500, cost: null },
      ],
    }],
  });

  it('ger exakt samma rader och summor som tidigare', () => {
    const d = saved();
    expect(rowLines(d.rows[0])).toEqual(d.rows[0].lines);
    const s = summarizeKalkyl(d);
    expect([s.arbete, s.material, s.ovrigt, s.total_ex_vat, s.total_incl_vat, s.hours]).toEqual([10800, 3840, 1500, 16140, 20175, 18]);
    expect(toOfferLineItems(d).map(i => [i.id, i.is_labor, i.amount])).toEqual([
      ['rad_1:arbete', true, 10800], ['rad_1:material', false, 3840], ['rad_1:ovrigt', false, 1500],
    ]);
    const t = kalkylTotals(d, OPTS);
    expect([t.rot_base, t.rot_amount]).toEqual([13500, 4050]);
  });

  it('en grenrad med ROT på räknar som samma fria rad', () => {
    const plain = saved();
    const gren: KalkylData = { ...plain, rows: [{ ...plain.rows[0], gren: 'altan', measure: { area: 12 } }] };
    expect(summarizeKalkyl(gren)).toEqual(summarizeKalkyl(plain));
    expect(toOfferLineItems(gren)).toEqual(toOfferLineItems(plain));
    expect(offerScopeText(gren, P, S)).toBe(offerScopeText(plain, P, S));
    expect(rowSpecText(gren.rows[0], P)).toBe(rowSpecText(plain.rows[0], P));
  });
});

describe('mängdlistan', () => {
  it('visar grenens icke arkiverade prisrader grupperade Arbete, Material, Tillbehör, Övrigt och sorterade som prislistan', () => {
    const groups = grenListGroups(ITEMS, 'altan');
    expect(groups.map(g => g.label)).toEqual(['Arbete', 'Material', 'Tillbehör', 'Övrigt']);
    expect(groups[0].items.map(i => i.code)).toEqual(['altan.arb.bygg', 'altan.arb.racke']);
    expect(groups[1].items.map(i => i.code)).toEqual(['altan.mat.plint', 'altan.mat.trall', 'altan.mat.saknar']);
    expect(grenItems(ITEMS, 'altan').some(i => i.code === 'altan.mat.gammal')).toBe(false);
    expect(grenItems(ITEMS, 'tak')).toEqual([]);
  });

  it('sökningen filtrerar på namn och spec', () => {
    expect(grenListGroups(ITEMS, 'altan', '28×120').flatMap(g => g.items).map(i => i.code)).toEqual(['altan.mat.trall']);
    expect(grenListGroups(ITEMS, 'altan', 'räcke').flatMap(g => g.items).map(i => i.code)).toEqual(['altan.arb.racke']);
  });

  it('föreslagen mängd: ytan för m², längden för m, annars 1; saknat eller 0 mått ger 1', () => {
    const m = { area: 18.5, length: 9 };
    expect(defaultGrenQty(ALTAN_TRALL, m)).toBe(18.5);
    expect(defaultGrenQty(ALTAN_RACKE, m)).toBe(9);
    expect(defaultGrenQty(ALTAN_TRAPPA, m)).toBe(1);
    expect(defaultGrenQty(ALTAN_TRALL, { length: 9 })).toBe(1);
    expect(defaultGrenQty(ALTAN_RACKE, { area: 18.5, length: 0 })).toBe(1);
    expect(defaultGrenQty(ALTAN_TRALL, undefined)).toBe(1);
  });

  it('Lägg till ger listpriset, mängd från måttet och kostnad och timmar från prisraden', () => {
    const { d, row } = withGren();
    const next = addGrenItem(d, row.id, ALTAN_BYGG, P);
    const line = grenLineFor(rowOf(next, row.id), ALTAN_BYGG.code)!;
    expect([line.qty, line.unit_price, line.amount, line.cost, line.hours, line.rot_class]).toEqual([20, 900, 18000, 12000, 30, 'arbete']);
    expect(line.manual).toBeUndefined();
  });

  it('en prisrad läggs bara till en gång per rad via listan', () => {
    const { d, row } = withGren();
    let next = addGrenItem(d, row.id, ALTAN_TRAPPA, P);
    next = addGrenItem(next, row.id, ALTAN_TRAPPA, P);
    next = setGrenQty(next, row.id, ALTAN_TRAPPA, 2, P);
    const lines = rowOf(next, row.id).lines.filter(l => l.code === ALTAN_TRAPPA.code);
    expect(lines).toHaveLength(1);
    expect([lines[0].qty, lines[0].amount]).toEqual([2, 9000]);
  });

  it('mängd 0 tar bort raden', () => {
    const { d, row } = withGren();
    const added = setGrenQty(d, row.id, ALTAN_TRAPPA, 1, P);
    expect(rowOf(added, row.id).lines).toHaveLength(1);
    expect(rowOf(setGrenQty(added, row.id, ALTAN_TRAPPA, 0, P), row.id).lines).toHaveLength(0);
    expect(setGrenQty(d, row.id, ALTAN_TRAPPA, 0, P)).toBe(d);
  });

  it('ändrad mängd behåller säljarens eget à-pris', () => {
    const { d, row } = withGren();
    let next = setGrenQty(d, row.id, ALTAN_TRALL, 10, P);
    const key = grenLineFor(rowOf(next, row.id), ALTAN_TRALL.code)!.key;
    next = updateFriLine(next, row.id, key, { unit_price: 300 }, P);
    next = setGrenQty(next, row.id, ALTAN_TRALL, 15, P);
    const line = grenLineFor(rowOf(next, row.id), ALTAN_TRALL.code)!;
    expect([line.qty, line.unit_price, line.amount, line.cost, line.manual]).toEqual([15, 300, 4500, 3000, true]);
  });

  it('prisrader från andra grenar går inte att sätta via listan', () => {
    const { d, row } = withGren();
    expect(setGrenQty(d, row.id, FASAD_ARB, 3, P)).toBe(d);
  });

  it('övriga rader: egna rader, rader från andra grenar, dubbletter och arkiverade prisrader', () => {
    const { d, row } = withGren();
    let next = setGrenQty(d, row.id, ALTAN_TRALL, 10, P);
    next = addFriLine(next, row.id, { description: 'Riva gammal altan', qty: 1, unit: 'st', unit_price: 5000, rot_class: 'arbete' });
    next = addFriLine(next, row.id, FASAD_ARB, 4);
    next = addFriLine(next, row.id, ALTAN_TRALL, 2);
    next = addFriLine(next, row.id, ALTAN_GAMMAL, 1);
    const split = grenLineSplit(rowOf(next, row.id), P);
    expect(split.list.map(l => [l.code, l.qty])).toEqual([['altan.mat.trall', 10]]);
    expect(split.other.map(l => l.code)).toEqual([null, 'fasad.arb.malning', 'altan.mat.trall', 'altan.mat.gammal']);
  });

  it('pris saknas flaggas som för en fri rad och stoppar utskick', () => {
    const { d, row } = withGren();
    const next = setGrenQty(d, row.id, ALTAN_SAKNAR, 3, P);
    const line = grenLineFor(rowOf(next, row.id), ALTAN_SAKNAR.code)!;
    expect([line.unit_price, line.amount]).toEqual([null, 0]);
    expect(runKontroller(next, P, S, TODAY).some(k => k.id === `pris_saknas:${row.id}` && k.blocking)).toBe(true);
    expect(sendCheck(next, P, S, TODAY).can_send).toBe(false);
  });

  it('Uppdatera priser räknar om grenradens listrader', () => {
    const { d, row } = withGren();
    const next = setGrenQty(d, row.id, ALTAN_TRALL, 10, P);
    const P2 = indexPrices(ITEMS.map(i => (i.code === ALTAN_TRALL.code ? { ...i, price_ex_vat: 340 } : i)));
    expect(priceChanges(next, P2).map(c => c.code)).toEqual(['altan.mat.trall']);
    const repriced = repriceKalkyl(next, P2, S, `${TODAY}T10:00:00Z`);
    expect(grenLineFor(rowOf(repriced, row.id), ALTAN_TRALL.code)!.amount).toBe(3400);
    expect(priceChanges(repriced, P2)).toEqual([]);
  });

  it('duplicerad grenrad behåller gren, mått och ROT-reglaget', () => {
    const { d, row } = withGren();
    let next = setGrenRotOff(setGrenQty(d, row.id, ALTAN_TRALL, 10, P), row.id, true);
    next = duplicateRow(next, row.id);
    const copy = next.rows[1];
    expect([copy.gren, copy.measure, copy.rot_off, copy.lines.length]).toEqual(['altan', { area: 20 }, true, 1]);
  });
});

describe('mått', () => {
  it('setGrenMeasure sparar positiva tal med två decimaler och tar bort tomma', () => {
    const { d, row } = withGren();
    let next = setGrenMeasure(d, row.id, { length: 7.456 });
    expect(rowOf(next, row.id).measure).toEqual({ area: 20, length: 7.46 });
    next = setGrenMeasure(next, row.id, { area: null });
    expect(rowOf(next, row.id).measure).toEqual({ length: 7.46 });
    next = setGrenMeasure(next, row.id, { length: 0 });
    expect(rowOf(next, row.id).measure).toBeUndefined();
  });

  it('Sätt m²-rader ändrar bara mängden på listrader med enheten m²', () => {
    const { d, row } = withGren();
    let next = setGrenQty(d, row.id, ALTAN_TRALL, 12, P);
    next = setGrenQty(next, row.id, ALTAN_BYGG, 20, P);
    next = setGrenQty(next, row.id, ALTAN_RACKE, 6, P);
    next = addFriLine(next, row.id, { description: 'Egen yta', qty: 3, unit: 'm²', unit_price: 50, rot_class: 'material' });
    const r = rowOf(next, row.id);
    expect(measureMismatch(r, 'm²', P).map(l => l.code)).toEqual(['altan.mat.trall']);
    expect(measureMismatch(r, 'm', P)).toEqual([]);
    next = applyMeasure(next, row.id, 'm²', P);
    const after = rowOf(next, row.id);
    expect(after.lines.map(l => [l.code, l.qty])).toEqual([['altan.mat.trall', 20], ['altan.arb.bygg', 20], ['altan.arb.racke', 6], [null, 3]]);
    expect(grenLineFor(after, ALTAN_TRALL.code)!.amount).toBe(6400);
    expect(measureMismatch(after, 'm²', P)).toEqual([]);
  });

  it('Sätt meterrader använder längden och gör ingenting utan längd', () => {
    const { d, row } = withGren();
    let next = setGrenQty(d, row.id, ALTAN_RACKE, 6, P);
    expect(applyMeasure(next, row.id, 'm', P)).toBe(next);
    next = applyMeasure(setGrenMeasure(next, row.id, { length: 8.5 }), row.id, 'm', P);
    expect(grenLineFor(rowOf(next, row.id), ALTAN_RACKE.code)!.qty).toBe(8.5);
  });
});

describe('ROT per grenrad', () => {
  function altan(off: boolean, premises?: KalkylData['premises']) {
    const { d, row } = withGren();
    let next = setGrenQty(d, row.id, ALTAN_BYGG, 20, P);      // arbete 18 000
    next = setGrenQty(next, row.id, ALTAN_TRALL, 20, P);      // material 6 400
    next = setGrenQty(next, row.id, ALTAN_CONTAINER, 1, P);   // övrigt 3 200
    if (premises) next = { ...next, premises };
    return { d: setGrenRotOff(next, row.id, off), rowId: row.id };
  }

  it('med reglaget på ger arbetet ROT-underlag', () => {
    const { d } = altan(false);
    const s = summarizeKalkyl(d);
    expect([s.arbete, s.material, s.ovrigt]).toEqual([18000, 6400, 3200]);
    const t = kalkylTotals(d, OPTS);
    expect([t.rot_base, t.rot_amount]).toEqual([22500, 6750]);
    expect(toOfferLineItems(d).filter(i => i.is_labor).map(i => i.amount)).toEqual([18000]);
  });

  it('med reglaget av räknas arbetet som övrigt i summering, ROT-underlag och offertrader', () => {
    const { d, rowId } = altan(true);
    const row = rowOf(d, rowId);
    expect(rowRotOff(row)).toBe(true);
    const s = summarizeKalkyl(d);
    expect([s.arbete, s.material, s.ovrigt, s.total_ex_vat]).toEqual([0, 6400, 21200, 27600]);
    const t = kalkylTotals(d, OPTS);
    expect([t.rot_base, t.rot_amount, t.total_ex_vat]).toEqual([0, 0, 27600]);
    expect(toOfferLineItems(d).some(i => i.is_labor)).toBe(false);
    expect(effectiveRotClass(row, 'arbete')).toBe('ovrigt');
    expect(effectiveRotClass(row, 'material')).toBe('material');
  });

  it('sparad ROT-klass ändras inte, så reglaget går att slå på igen', () => {
    const { d, rowId } = altan(true);
    expect(grenLineFor(rowOf(d, rowId), ALTAN_BYGG.code)!.rot_class).toBe('arbete');
    const back = setGrenRotOff(d, rowId, false);
    expect(rowOf(back, rowId).rot_off).toBeUndefined();
    expect(kalkylTotals(back, OPTS).rot_base).toBe(22500);
  });

  it('reglaget gäller bara grenrader', () => {
    let d = emptyKalkyl();
    const fri = newFriRow(null, 'Fri');
    d = addFriLine(addRow(d, fri, P, S), fri.id, ALTAN_BYGG, 2);
    expect(setGrenRotOff(d, fri.id, true)).toBe(d);
    expect(rowRotOff({ ...d.rows[0], rot_off: true })).toBe(false);
  });

  it('rot_bostadsratt_utvandigt försvinner när reglaget är av på de berörda raderna', () => {
    const brf: KalkylData['premises'] = { house_type: 'bostadsratt', build_year: null, floors: null };
    const ids = (d: KalkylData) => runKontroller(d, P, S, TODAY, { rot_enabled: true }).map(k => k.id);
    expect(ids(altan(false, brf).d)).toContain('rot_bostadsratt_utvandigt');
    expect(ids(altan(true, brf).d)).not.toContain('rot_bostadsratt_utvandigt');
  });

  it('el_behorighet gäller fortfarande grenrader för el', () => {
    let d = emptyKalkyl();
    const el = newGrenRow(null, 'el', '');
    d = setGrenQty(addRow(d, el, P, S), el.id, EL_UTTAG, 2, P);
    d = setGrenRotOff(d, el.id, true);
    expect(runKontroller(d, P, S, TODAY).map(k => k.id)).toContain('el_behorighet');
  });
});

describe('parseSvNumber med både komma och punkt', () => {
  it('tecknet som står sist är decimaltecken', () => {
    expect(parseSvNumber('1,195.00')).toBe(1195);
    expect(parseSvNumber('1.195,00')).toBe(1195);
    expect(parseSvNumber('12,345,678.5')).toBe(12345678.5);
    expect(parseSvNumber('12.345.678,5')).toBe(12345678.5);
    expect(parseSvNumber('-1,195.50')).toBe(-1195.5);
  });

  it('tusentalsavgränsaren måste stå i grupper om tre siffror', () => {
    expect(parseSvNumber('1,19.5')).toBe('invalid');
    expect(parseSvNumber('1.19,5')).toBe('invalid');
    expect(parseSvNumber('1234,567.5')).toBe('invalid');
    expect(parseSvNumber('1,195.')).toBe('invalid');
    expect(parseSvNumber(',195.00')).toBe('invalid');
  });

  it('bara komma är decimalkomma och bara punkt decimalpunkt, som tidigare', () => {
    expect(parseSvNumber('1195,5')).toBe(1195.5);
    expect(parseSvNumber('1,195')).toBe(1.195);
    expect(parseSvNumber('199.2')).toBe(199.2);
    expect(parseSvNumber('1.195')).toBe(1.195);
    expect(parseSvNumber('1,2,3')).toBe('invalid');
    expect(parseSvNumber('1.2.3')).toBe('invalid');
  });

  it('mellanslag och hårda mellanslag som tusentalsavgränsare fungerar som tidigare', () => {
    expect(parseSvNumber('1 195,50')).toBe(1195.5);
    expect(parseSvNumber('1\u00A0195,50 kr')).toBe(1195.5);
    expect(parseSvNumber('12 345 678')).toBe(12345678);
    expect(parseSvNumber('')).toBeNull();
  });
});
