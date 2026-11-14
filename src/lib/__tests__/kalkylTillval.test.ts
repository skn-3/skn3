import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, addRow, newGolvRow, newFriRow, newGrenRow, addFriLine,
  addCommonLine, addAdjustment, setGrenQty, duplicateRow, setRowOptional, includedRows, optionalRows, optionTotals, summarizeKalkyl,
  toOfferLineItems, buildOfferPayloadFromKalkyl, kalkylTotals, buildCustomerView, sendCheck, runKontroller, rowFigures, offerScopeText,
  optionSummaryLine, costMissingCount, sanitizeCustomerView, CUSTOMER_VIEW_LIMITS, customerSectionHeading,
  type KalkylData, type KalkylOfferOptions, type PriceItem,
} from '@/lib/kalkyl';
import { customerViewImagePaths, withImageUrls } from '../../../supabase/functions/_shared/customerView';
import { seedPriceItems } from './kalkylFixture';
import { LEGACY_GOLV_LINES } from './kalkylLegacyRows';

const TODAY = '2026-11-12';
const OPTS: KalkylOfferOptions = { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_used: 0, handpenning_percent: 25 };

const base = (patch: Partial<PriceItem> & Pick<PriceItem, 'code' | 'trade' | 'kind' | 'name' | 'unit'>): PriceItem => ({
  id: patch.code, rot_class: patch.kind === 'arbete' ? 'arbete' : patch.kind === 'ovrigt' ? 'ovrigt' : 'material', slot: null, spec: null,
  price_ex_vat: 100, cost_ex_vat: 40, hours_per_unit: 0.5, level: null, pack_size: null, pack_label: null, waste_pct: 0, coverage: null,
  color_system: null, color_code: null, color_hex: null, swatch: null, image_path: null, article_no: null, supplier: null, source: null,
  price_date: TODAY, status: 'godkand', approved_by: 'Admin', approved_at: TODAY, meta: {}, sort_order: 100, updated_by: 'Admin', ...patch,
});
const ALTAN_BYGG = base({ code: 'altan.arb.bygg', trade: 'altan', kind: 'arbete', name: 'Bygga altan', unit: 'm²', price_ex_vat: 900, cost_ex_vat: 100 });
const ALTAN_TRALL = base({ code: 'altan.mat.trall', trade: 'altan', kind: 'material', name: 'Trall', unit: 'm²', price_ex_vat: 320, cost_ex_vat: 50, image_path: 'altan/trall.jpg' });
const GEM_ETABL = base({ code: 'gem.ovr.etablering', trade: 'gemensamt', kind: 'ovrigt', name: 'Etablering', unit: 'st', price_ex_vat: 2500, cost_ex_vat: 2000 });
const ITEMS = [...seedPriceItems(() => ({ status: 'godkand', cost_ex_vat: 50, hours_per_unit: 0.2 })), ALTAN_BYGG, ALTAN_TRALL, GEM_ETABL];
const P = indexPrices(ITEMS);
const DIMS = { length: 5, width: 4.2, height: 2.5, doors: 2, windows: 1 };

/** Golvrad i Vardagsrum, grenrad altan (18 m² bygg + trall), fri rad, gemensam rad och rabatt. */
function kalkyl(): { d: KalkylData; golv: string; altan: string; fri: string } {
  let d = emptyKalkyl();
  const room = newRoom('Vardagsrum', DIMS);
  d = addRoom(d, room);
  const golv = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  d = addRow(d, golv, P, S);
  const altan = newGrenRow(null, 'altan', 'Altan på baksidan');
  d = addRow(d, altan, P, S);
  d = setGrenQty(d, altan.id, ALTAN_BYGG, 18, P);
  d = setGrenQty(d, altan.id, ALTAN_TRALL, 18, P);
  const fri = newFriRow(room.id, 'Fönsterbänkar');
  d = addRow(d, fri, P, S);
  d = addFriLine(d, fri.id, { description: 'Montera fönsterbänk', qty: 2, unit: 'st', unit_price: 650, rot_class: 'arbete' });
  d = addCommonLine(d, GEM_ETABL);
  d = addAdjustment(d, { label: 'Rabatt', amount: -1000, rot_class: 'arbete' });
  return { d, golv: golv.id, altan: altan.id, fri: fri.id };
}

const ALTAN_SUM = 18 * 900 + 18 * 320; // 21 960 kr ex moms
const r2 = (x: number) => Math.round(x * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));

describe('tillval: summor', () => {
  it('en sparad kalkyl utan fältet ger samma rader och summor som förut', () => {
    // Sparad calc_data från före tillval: en golvrad med de gamla receptraderna och en gemensam rad.
    const saved = JSON.parse(JSON.stringify({
      version: 1, premises: { house_type: 'villa', build_year: 1975, floors: 1 },
      rooms: [{ id: 'rum_1', name: 'Vardagsrum', dims: { length: 6, width: 4.1, height: 2.5, doors: 2, windows: 2 } }],
      rows: [{ id: 'rad_1', room_id: 'rum_1', trade: 'golv', title: 'Golv', input: null, lines: LEGACY_GOLV_LINES }],
      common: [{ key: 'gem.ovr.etablering', code: 'gem.ovr.etablering', description: 'Etablering', rot_class: 'ovrigt', qty: 1, unit: 'st', unit_price: 2500, amount: 2500 }],
      adjustments: [], priced_at: null,
    })) as KalkylData;
    const expected = sum([...LEGACY_GOLV_LINES.map(l => l.amount), 2500]);
    expect(includedRows(saved)).toEqual(saved.rows);
    expect(optionalRows(saved)).toEqual([]);
    expect(summarizeKalkyl(saved).total_ex_vat).toBe(expected);
    expect(sum(toOfferLineItems(saved).map(i => i.amount))).toBe(expected);
    expect(buildOfferPayloadFromKalkyl(saved, OPTS).total_ex_vat).toBe(expected);
    expect(optionTotals(saved)).toEqual({ total_ex_vat: 0, rows: [] });
    expect(buildCustomerView(saved, P, S, null).options).toEqual([]);
    // optional: false är detsamma som inget fält.
    const explicit: KalkylData = { ...saved, rows: saved.rows.map(r => ({ ...r, optional: false })) };
    expect(buildOfferPayloadFromKalkyl(explicit, OPTS).line_items).toEqual(buildOfferPayloadFromKalkyl(saved, OPTS).line_items);
  });

  it('ett tillval räknas inte in i offertrader, summa, kostnad, täckningsbidrag och timmar', () => {
    const { d, altan } = kalkyl();
    const opt = setRowOptional(d, altan, true);
    const before = summarizeKalkyl(d);
    const after = summarizeKalkyl(opt);
    expect(r2(before.total_ex_vat - after.total_ex_vat)).toBe(ALTAN_SUM);
    expect(r2(before.cost - after.cost)).toBe(18 * 100 + 18 * 50);
    expect(r2(before.hours - after.hours)).toBe(18);
    expect(after.tb).toBe(r2(after.total_ex_vat - after.cost));
    expect(toOfferLineItems(opt).some(i => i.id.startsWith(`${altan}:`))).toBe(false);
    const payload = buildOfferPayloadFromKalkyl(opt, OPTS);
    expect(payload.total_ex_vat).toBe(after.total_ex_vat);
    expect(r2(kalkylTotals(d, OPTS).total_ex_vat - kalkylTotals(opt, OPTS).total_ex_vat)).toBe(ALTAN_SUM);
    expect(payload.calc_data.rows.find(r => r.id === altan)?.optional).toBe(true);
  });

  it('optionTotals: summan av tillvalens gällande rader ex moms, totalt och per rad', () => {
    const { d, altan, fri } = kalkyl();
    const opt = setRowOptional(setRowOptional(d, altan, true), fri, true);
    expect(optionTotals(opt)).toEqual({ total_ex_vat: ALTAN_SUM + 1300, rows: [{ id: altan, amount_ex_vat: ALTAN_SUM }, { id: fri, amount_ex_vat: 1300 }] });
  });

  it('av och på som tillval ger samma kalkyl och samma summa som före', () => {
    const { d, altan } = kalkyl();
    const back = setRowOptional(setRowOptional(d, altan, true), altan, false);
    expect(back).toEqual(d);
    expect('optional' in back.rows.find(r => r.id === altan)!).toBe(false);
    expect(buildOfferPayloadFromKalkyl(back, OPTS)).toEqual(buildOfferPayloadFromKalkyl(d, OPTS));
    expect(setRowOptional(d, altan, false)).toBe(d);
    expect(setRowOptional(d, 'finns-inte', true)).toBe(d);
  });

  it('duplicateRow tar med märkningen', () => {
    const { d, altan } = kalkyl();
    const opt = setRowOptional(d, altan, true);
    const dup = duplicateRow(opt, altan);
    const i = dup.rows.findIndex(r => r.id === altan);
    expect(dup.rows[i + 1].optional).toBe(true);
    expect(dup.rows[i + 1].id).not.toBe(altan);
    expect(optionTotals(dup).total_ex_vat).toBe(2 * ALTAN_SUM);
  });

  it('radens egna siffror visar vad tillvalet kostar; sammanfattningens rad bara när det finns tillval', () => {
    const { d, altan } = kalkyl();
    const opt = setRowOptional(d, altan, true);
    expect(rowFigures(opt, altan, OPTS)!.totals.total_ex_vat).toBe(ALTAN_SUM);
    expect(rowFigures(opt, altan, OPTS)!.summary.total_ex_vat).toBe(ALTAN_SUM);
    expect(optionSummaryLine(d, 'inkl', OPTS)).toBeNull();
    expect(optionSummaryLine(opt, 'inkl', OPTS)).toEqual({ label: 'Tillval, ingår inte', amount: r2(ALTAN_SUM * 1.25) });
    expect(optionSummaryLine(opt, 'exkl', OPTS)!.amount).toBe(ALTAN_SUM);
    expect(optionSummaryLine(opt, 'inkl', { ...OPTS, vat_mode: 'omvand' })!.amount).toBe(ALTAN_SUM);
  });

  it('offertens automatiska beskrivning tar inte med tillval', () => {
    const { d, altan } = kalkyl();
    expect(offerScopeText(d, P, S)).toContain('Altan på baksidan');
    expect(offerScopeText(setRowOptional(d, altan, true), P, S)).not.toContain('Altan på baksidan');
  });
});

describe('tillval: kontroller', () => {
  it('ett tillval med pris som inte är godkänt stoppar utskick', () => {
    const { d, altan } = kalkyl();
    const draft = indexPrices(ITEMS.map(i => (i.code === ALTAN_TRALL.code ? { ...i, status: 'utkast' as const } : i)));
    const opt = setRowOptional(d, altan, true);
    const check = sendCheck(opt, draft, S, TODAY);
    expect(check.can_send).toBe(false);
    expect(check.blocking.map(k => k.id)).toContain(`pris_ej_godkant:${altan}`);
    expect(check.messages).toContain('1 pris är inte godkänt i prislistan');
  });

  it('ett tillval utan pris stoppar utskick', () => {
    const { d, fri } = kalkyl();
    let opt = setRowOptional(d, fri, true);
    opt = addFriLine(opt, fri, { description: 'Fönsterbänk utan pris', qty: 1, unit: 'st', unit_price: null, rot_class: 'material' });
    const list = runKontroller(opt, P, S, TODAY);
    expect(list.find(k => k.id === `pris_saknas:${fri}`)?.blocking).toBe(true);
    expect(sendCheck(opt, P, S, TODAY).can_send).toBe(false);
  });

  it('marginal och saknad kostnad räknas bara på det som ingår', () => {
    const { d, fri } = kalkyl();
    // Fri rad utan kostnad: som tillval påverkar den varken "kostnad saknas" eller marginalen.
    expect(costMissingCount(d)).toBeGreaterThan(0);
    const opt = setRowOptional(d, fri, true);
    expect(costMissingCount(opt)).toBe(costMissingCount(d) - 1);
    const withoutFri: KalkylData = { ...d, rows: d.rows.filter(r => r.id !== fri) };
    const margin = (x: KalkylData) => runKontroller(x, P, S, TODAY).filter(k => k.id.startsWith('marginal') || k.id === 'kostnad_saknas');
    expect(margin(opt)).toEqual(margin(withoutFri));
  });
});

describe('tillval: kundvyn', () => {
  const { d, altan, golv } = kalkyl();
  const opt = setRowOptional(d, altan, true);
  const view = buildCustomerView(opt, P, S, null);
  const payload = buildOfferPayloadFromKalkyl(opt, OPTS);

  it('options har samma form som sections, i kalkylens ordning, med radens belopp', () => {
    expect(view.options).toHaveLength(1);
    expect(view.options[0]).toMatchObject({ id: altan, room: null, title: 'Altan på baksidan', amount_ex_vat: ALTAN_SUM });
    expect(Object.keys(view.options[0])).toEqual(Object.keys(view.sections[0]));
    expect(view.options[0].items.map(i => i.name)).toEqual(['Trall']);
    expect(view.sections.map(s => s.id)).not.toContain(altan);
    expect(view.sections[0].id).toBe(golv);
  });

  it('avsnitt + gemensamt = total_ex_vat, och tillvalen ingår inte i den summan eller i totals', () => {
    expect(sum([...view.sections.map(s => s.amount_ex_vat), ...view.common.map(c => c.amount_ex_vat)])).toBe(r2(payload.total_ex_vat));
    expect(sum([view.totals.arbete_ex_vat, view.totals.material_ex_vat, view.totals.ovrigt_ex_vat])).toBe(r2(payload.total_ex_vat));
    const full = buildCustomerView(d, P, S, null);
    expect(r2(full.totals.arbete_ex_vat - view.totals.arbete_ex_vat)).toBe(18 * 900);
    expect(r2(full.totals.material_ex_vat - view.totals.material_ex_vat)).toBe(18 * 320);
  });

  it('sanering: options tillåts (högst 50, samma kontroller som sections); saknas blir []', () => {
    const json = JSON.parse(JSON.stringify(view));
    const clean = sanitizeCustomerView(json)!;
    expect(clean.options).toEqual(view.options);
    const { options: _drop, ...old } = json;
    expect(sanitizeCustomerView(old)!.options).toEqual([]);
    expect(sanitizeCustomerView({ ...json, options: Array.from({ length: CUSTOMER_VIEW_LIMITS.options }, () => json.options[0]) })!.options).toHaveLength(50);
    expect(sanitizeCustomerView({ ...json, options: Array.from({ length: CUSTOMER_VIEW_LIMITS.options + 1 }, () => json.options[0]) })).toBeNull();
    expect(sanitizeCustomerView({ ...json, options: [{ ...json.options[0], amount_ex_vat: 'x' }] })).toBeNull();
    expect(sanitizeCustomerView({ ...json, options: 'x' })).toBeNull();
    const extra = sanitizeCustomerView({ ...json, options: [{ ...json.options[0], cost: 5, note: 'intern', items: [{ ...json.options[0].items[0], code: 'altan.mat.trall' }] }] })!;
    expect(JSON.stringify(extra.options)).not.toMatch(/cost|intern|altan\.mat\.trall/);
  });

  it('bilder i tillval signeras som i avsnitten och sökvägen skickas aldrig ut', () => {
    const clean = sanitizeCustomerView(JSON.parse(JSON.stringify(view)))!;
    expect(customerViewImagePaths(clean)).toContain('altan/trall.jpg');
    const pub = withImageUrls(clean, { 'altan/trall.jpg': 'https://signed/trall' });
    expect(pub.options[0].items[0].image_url).toBe('https://signed/trall');
    expect(JSON.stringify(pub)).not.toContain('image_path');
  });
});

describe('etapp 3e: säljaren lägger till ett tillval i förhandsvisningen', () => {
  it('tillvalets id i kundvyn är kalkylradens id; "Lägg till i offerten" flyttar det till det som ingår och höjer summan med tillvalets belopp', () => {
    const { d, altan } = kalkyl();
    const opt = setRowOptional(d, altan, true);
    const before = buildCustomerView(opt, P, S, null);
    expect(before.options.map(o => o.id)).toEqual([altan]);
    const added = setRowOptional(opt, before.options[0].id, false);
    const after = buildCustomerView(added, P, S, null);
    expect(after.options).toEqual([]);
    expect(after.sections.some(s => s.id === altan)).toBe(true);
    expect(r2(kalkylTotals(added, OPTS).total_ex_vat - kalkylTotals(opt, OPTS).total_ex_vat)).toBe(ALTAN_SUM);
    expect(added).toEqual(d); // samma kalkyl som om raden aldrig varit tillval
  });

  it('"Ångra" gör raden till tillval igen med samma kundvy och summor som före', () => {
    const { d, altan } = kalkyl();
    const opt = setRowOptional(d, altan, true);
    const undone = setRowOptional(setRowOptional(opt, altan, false), altan, true);
    expect(undone).toEqual(opt);
    expect(buildCustomerView(undone, P, S, null)).toEqual(buildCustomerView(opt, P, S, null));
    expect(kalkylTotals(undone, OPTS)).toEqual(kalkylTotals(opt, OPTS));
  });

  it('rubriken i knappens namn och i raden "Tillagt i offerten" är "Rum · Benämning"', () => {
    expect(customerSectionHeading({ room: 'Vardagsrum', title: 'Golv' })).toBe('Vardagsrum · Golv');
    expect(customerSectionHeading({ room: null, title: 'Altan på baksidan' })).toBe('Altan på baksidan');
  });
});
