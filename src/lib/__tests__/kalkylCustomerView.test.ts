import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, addRow, newGolvRow, newMalningRow, newFriRow, newGrenRow,
  addFriLine, addCommonLine, addAdjustment, setOverride, setGrenQty, setGrenMeasure, setGrenRotOff, toggleFavorite, updateRowMeta,
  buildOfferPayloadFromKalkyl, buildCustomerView, customerIntro, isAutoDescription, customerViewWithFormIntro, customerPriceRows,
  customerPayment, kalkylTotals, offerScopeText, rowScopeText, kalkylSaveFields, offerMetaFromRow, toOfferLineItems, rowTypeLabel,
  CUSTOMER_VIEW_KEYS, CUSTOMER_FREE_ITEMS,
  type KalkylData, type PriceItem, type KalkylOfferOptions, type CustomerView,
} from '@/lib/kalkyl';
import { seedPriceItems } from './kalkylFixture';

const TODAY = '2026-11-12';
const OPTS: KalkylOfferOptions = { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_used: 0, handpenning_percent: 25 };

let n = 0;
function pi(patch: Partial<PriceItem> & Pick<PriceItem, 'code' | 'trade' | 'kind' | 'name' | 'unit'>): PriceItem {
  n += 1;
  return {
    id: `cv-${n}`, rot_class: patch.kind === 'arbete' ? 'arbete' : 'material', slot: null, spec: null, price_ex_vat: 100, cost_ex_vat: 40,
    hours_per_unit: 0.5, level: null, pack_size: null, pack_label: null, waste_pct: 0, coverage: null, color_system: null, color_code: null,
    color_hex: null, swatch: null, image_path: null, article_no: 'ART-1', supplier: 'Leverantör AB', source: 'Prisark', price_date: TODAY,
    status: 'godkand', approved_by: 'Admin', approved_at: TODAY, meta: { intern: 'x' }, sort_order: 100, updated_by: 'Admin', ...patch,
  };
}

const ALTAN_BYGG = pi({ code: 'altan.arb.bygg', trade: 'altan', kind: 'arbete', name: 'Bygga altan', unit: 'm²', price_ex_vat: 900 });
const ALTAN_TRALL = pi({ code: 'altan.mat.trall', trade: 'altan', kind: 'material', name: 'Trall tryckimpregnerad', spec: '28×120', unit: 'm²', price_ex_vat: 320, image_path: 'altan/trall.jpg', swatch: { color: '#A07850', pattern: 'plank', step: 12 } });
const ALTAN_TRAPPA = pi({ code: 'altan.till.trappa', trade: 'altan', kind: 'tillbehor', name: 'Trappa', unit: 'st', price_ex_vat: 4500 });
const ALTAN_CONTAINER = pi({ code: 'altan.ovr.container', trade: 'altan', kind: 'ovrigt', rot_class: 'ovrigt', name: 'Container', unit: 'st', price_ex_vat: 3200 });
const GEM_ETABL = pi({ code: 'gem.ovr.etablering', trade: 'gemensamt', kind: 'ovrigt', rot_class: 'ovrigt', name: 'Etablering', unit: 'st', price_ex_vat: 2500 });
const EXTRA_MAT = Array.from({ length: 8 }, (_, i) => pi({ code: `kok.mat.${i}`, trade: 'kok', kind: 'material', name: `Kökmaterial ${i}`, unit: 'st', price_ex_vat: 10 + i }));

const ITEMS = [...seedPriceItems(() => ({ status: 'godkand', cost_ex_vat: 50, hours_per_unit: 0.2 })), ALTAN_BYGG, ALTAN_TRALL, ALTAN_TRAPPA, ALTAN_CONTAINER, GEM_ETABL, ...EXTRA_MAT];
const P = indexPrices(ITEMS);
const DIMS = { length: 5, width: 4.2, height: 2.5, doors: 2, windows: 1 };

/** Golv, målning, grenrad med ROT av, fri rad, gemensam rad och rabatt i ett rum och utan rum. */
function fullKalkyl(): { d: KalkylData; ids: Record<string, string> } {
  let d = emptyKalkyl();
  const room = newRoom('Vardagsrum', DIMS);
  d = addRoom(d, room);
  const golv = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  golv.input = { ...(golv.input as object), underlag: true, sockel: true, troskel: true } as typeof golv.input;
  d = addRow(d, golv, P, S);
  d = setOverride(d, golv.id, 'golv.material', { unit_price: 300 }); // säljarens eget à-pris (manual)
  d = updateRowMeta(d, golv.id, { note: 'Intern anteckning om kunden' });
  const mal = newMalningRow(room.id);
  d = addRow(d, mal, P, S);
  const gren = newGrenRow(null, 'altan', 'Altan på baksidan');
  d = addRow(d, gren, P, S);
  d = setGrenMeasure(d, gren.id, { area: 18, length: 7.5 });
  d = setGrenQty(d, gren.id, ALTAN_BYGG, 18, P);
  d = setGrenQty(d, gren.id, ALTAN_TRALL, 18, P);
  d = setGrenQty(d, gren.id, ALTAN_TRAPPA, 1, P);
  d = setGrenQty(d, gren.id, ALTAN_CONTAINER, 1, P);
  d = setGrenRotOff(d, gren.id, true);
  const fri = newFriRow(room.id, 'Fönsterbänkar');
  d = addRow(d, fri, P, S);
  d = addFriLine(d, fri.id, { description: 'Montera fönsterbänk', qty: 2, unit: 'st', unit_price: 650, rot_class: 'arbete' });
  d = addFriLine(d, fri.id, { description: 'Fönsterbänk marmor', qty: 2, unit: 'st', unit_price: 1199.5, rot_class: 'material' });
  d = addCommonLine(d, GEM_ETABL);
  d = addAdjustment(d, { label: 'Rabatt', amount: -1000, rot_class: 'arbete' });
  d = toggleFavorite(d, 'golv.mat.ekparkett-3stav');
  return { d, ids: { golv: golv.id, mal: mal.id, gren: gren.id, fri: fri.id } };
}

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;
const r2 = (x: number) => Math.round(x * 100) / 100;

describe('buildCustomerView: belopp', () => {
  const { d, ids } = fullKalkyl();
  const view = buildCustomerView(d, P, S, '');
  const payload = buildOfferPayloadFromKalkyl(d, OPTS);

  it('avsnitt + gemensamt = total_ex_vat, och totals likaså', () => {
    expect(payload.total_ex_vat).toBeGreaterThan(0);
    expect(sum([...view.sections.map(s => s.amount_ex_vat), ...view.common.map(c => c.amount_ex_vat)])).toBe(r2(payload.total_ex_vat));
    expect(sum([view.totals.arbete_ex_vat, view.totals.material_ex_vat, view.totals.ovrigt_ex_vat])).toBe(r2(payload.total_ex_vat));
  });

  it('varje avsnitt = summan av radens offertrader; gemensamt och rabatt = deras offertrader', () => {
    const items = toOfferLineItems(d);
    for (const s of view.sections) expect(s.amount_ex_vat).toBe(sum(items.filter(i => i.id.startsWith(`${s.id}:`)).map(i => i.amount)));
    expect(view.common).toEqual([{ title: 'Etablering', amount_ex_vat: 2500 }, { title: 'Rabatt', amount_ex_vat: -1000 }]);
    expect(view.sections.map(s => s.id)).toEqual([ids.golv, ids.mal, ids.gren, ids.fri]);
  });

  it('grenrad med ROT av: arbetet är arbete i totals (sparad klass) men övrigt i offertraderna', () => {
    const items = toOfferLineItems(d);
    expect(items.find(i => i.id === `${ids.gren}:arbete`)).toBeUndefined();
    expect(items.find(i => i.id === `${ids.gren}:ovrigt`)?.amount).toBe(18 * 900 + 3200);
    const withoutGren = buildCustomerView({ ...d, rows: d.rows.filter(r => r.id !== ids.gren) }, P, S, '');
    expect(r2(view.totals.arbete_ex_vat - withoutGren.totals.arbete_ex_vat)).toBe(18 * 900);
    expect(r2(view.totals.ovrigt_ex_vat - withoutGren.totals.ovrigt_ex_vat)).toBe(3200);
  });

  it('prisraderna Arbete, Material, Övrigt utan rader med 0', () => {
    expect(customerPriceRows({ arbete_ex_vat: 100, material_ex_vat: 0, ovrigt_ex_vat: 5 }).map(r => r.label)).toEqual(['Arbete', 'Övrigt']);
    expect(customerPriceRows(view.totals).map(r => r.label)).toEqual(['Arbete', 'Material', 'Övrigt']);
  });

  it('customerPayment följer offerttotalerna', () => {
    const t = kalkylTotals(d, OPTS);
    const pay = customerPayment(t, OPTS);
    expect(pay).toMatchObject({ incl_vat: true, rot_active: true, price_factor: 1.25, payable: t.total_after_rot, handpenning: t.handpenning, slutfaktura: t.slutfaktura, pay_label: 'Att betala efter ROT-avdrag' });
    const omv = customerPayment(kalkylTotals(d, { ...OPTS, vat_mode: 'omvand' }), { ...OPTS, vat_mode: 'omvand' });
    expect(omv).toMatchObject({ incl_vat: false, rot_active: false, price_factor: 1, pay_label: 'Att betala, omvänd byggmoms' });
  });
});

describe('buildCustomerView: innehåll', () => {
  const { d, ids } = fullKalkyl();
  const view = buildCustomerView(d, P, S, null);
  const sec = (id: string) => view.sections.find(s => s.id === id)!;

  it('rubrik, typ och text delas med offertens beskrivning', () => {
    const golv = sec(ids.golv);
    expect(golv).toMatchObject({ room: 'Vardagsrum', title: 'Golv', type: 'Golv' });
    expect(sec(ids.gren)).toMatchObject({ room: null, title: 'Altan på baksidan', type: rowTypeLabel({ trade: 'fri', gren: 'altan' }) });
    const scope = offerScopeText(d, P, S).split('\n');
    expect(scope[0]).toBe(`Vardagsrum – Golv: ${golv.text}`);
    expect(scope[2]).toBe(`Altan på baksidan: ${sec(ids.gren).text}`);
    expect(golv.text).toBe(rowScopeText(d.rows[0], d, P, S));
    expect(golv.text.startsWith('Ekparkett 3-stav 14 mm, mattlack, 21 m².')).toBe(true);
  });

  it('uppgifter: golvyta, väggyta/takyta/strykningar, grenradens mått', () => {
    expect(sec(ids.golv).facts).toEqual(['21 m²']);
    expect(sec(ids.mal).facts[0]).toMatch(/^Väggar \d/);
    expect(sec(ids.mal).facts.slice(1)).toEqual(['Tak 21 m²', '2 strykningar']);
    expect(sec(ids.gren).facts).toEqual(['18 m²', '7,5 m']);
    expect(sec(ids.fri).facts).toEqual([]);
  });

  it('val: golvets material och tillbehör, målningens kulörer och grenradens material/tillbehör', () => {
    expect(sec(ids.golv).items.map(i => i.label)).toEqual(['Golv', 'Underlag', 'Sockel', 'Tröskel']);
    expect(sec(ids.golv).items[0]).toMatchObject({ name: 'Ekparkett 3-stav', detail: '14 mm, mattlack', swatch: { color: '#C9A877', pattern: 'plank' } });
    expect(sec(ids.golv).items[2].color).toEqual({ system: 'NCS', code: 'S 0502-Y', name: null, hex: '#F3F0E6' });
    const mal = sec(ids.mal).items;
    expect(mal.map(i => i.label)).toEqual(['Väggar', 'Tak']);
    expect(mal[0]).toMatchObject({ name: 'Väggfärg', detail: 'Matt 7', color: { system: 'NCS', code: 'S 0502-Y', name: 'Varmvit', hex: '#F3F0E6' } });
    expect(sec(ids.gren).items.map(i => [i.label, i.name, i.image_path])).toEqual([
      ['Material', 'Trall tryckimpregnerad', 'altan/trall.jpg'], ['Tillbehör', 'Trappa', null],
    ]);
    expect(sec(ids.fri).items).toEqual([]); // egna rader utan prislistekod
  });

  it('högst sex valbrickor från en fri rad', () => {
    let k = emptyKalkyl();
    const row = newFriRow(null, 'Kök');
    k = addRow(k, row, P, S);
    for (const it of EXTRA_MAT) k = addFriLine(k, row.id, it, 1);
    expect(buildCustomerView(k, P, S, null).sections[0].items).toHaveLength(CUSTOMER_FREE_ITEMS);
  });

  it('bara tillåtna nycklar i hela objektet (rekursivt), inga interna uppgifter', () => {
    const allowed: Record<string, readonly string[]> = CUSTOMER_VIEW_KEYS;
    const walk = (v: unknown, level: keyof typeof CUSTOMER_VIEW_KEYS, path: string) => {
      expect(v && typeof v === 'object' && !Array.isArray(v), path).toBe(true);
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        expect(allowed[level], `${path}.${k}`).toContain(k);
        if (level === 'root' && k === 'sections') (child as unknown[]).forEach((s, i) => walk(s, 'section', `${path}.sections[${i}]`));
        else if (level === 'root' && k === 'common') (child as unknown[]).forEach((c, i) => walk(c, 'common', `${path}.common[${i}]`));
        else if (level === 'root' && k === 'totals') walk(child, 'totals', `${path}.totals`);
        else if (level === 'section' && k === 'items') (child as unknown[]).forEach((it, i) => walk(it, 'item', `${path}.items[${i}]`));
        else if (level === 'section' && k === 'facts') (child as unknown[]).forEach(f => expect(typeof f).toBe('string'));
        else if (level === 'item' && k === 'color' && child) walk(child, 'color', `${path}.color`);
        else if (level === 'item' && k === 'swatch' && child) walk(child, 'swatch', `${path}.swatch`);
        else if (child !== null) expect(['string', 'number'], `${path}.${k}`).toContain(typeof child);
      }
    };
    walk(view, 'root', 'view');
    const json = JSON.stringify(view);
    for (const secret of ['golv.mat.', 'altan.mat.', 'Intern anteckning', 'godkand', TODAY, 'ART-1', 'Leverantör', 'Prisark', 'intern', 'favorites', 'manual', 'cost', 'hours']) {
      expect(json, secret).not.toContain(secret);
    }
  });
});

describe('intro och automatisk beskrivning', () => {
  const { d } = fullKalkyl();

  it('intro är null för tom eller automatisk beskrivning och texten för en egen', () => {
    expect(customerIntro('', d, P, S)).toBeNull();
    expect(customerIntro('   ', d, P, S)).toBeNull();
    expect(customerIntro(offerScopeText(d, P, S), d, P, S)).toBeNull();
    expect(customerIntro(`${offerScopeText(d, P, S)}\n`, d, P, S)).toBeNull();
    expect(buildCustomerView(d, P, S, 'Vi lägger nytt golv och målar om.').intro).toBe('Vi lägger nytt golv och målar om.');
  });

  it('kalkylSaveFields sparar customer_view i samma sparning', () => {
    const meta = offerMetaFromRow(null, new Date(TODAY));
    const f = kalkylSaveFields({ ...meta, customer_name: 'Kund' }, d, P, S);
    expect(f.customer_view.version).toBe(1);
    expect(f.customer_view.intro).toBeNull();
    expect(f.description).toBe(offerScopeText(d, P, S));
    expect(sum(f.customer_view.sections.map(s => s.amount_ex_vat).concat(f.customer_view.common.map(c => c.amount_ex_vat)))).toBe(r2(f.total_ex_vat));
  });

  it('intro null vid laddning: beskrivningen är automatisk, fältet tomt och texten byggs om vid nästa sparning', () => {
    const meta = { ...offerMetaFromRow(null, new Date(TODAY)), customer_name: 'Kund' };
    const first = kalkylSaveFields(meta, d, P, S);
    const loaded = offerMetaFromRow({ ...first, customer_view: first.customer_view, description: first.description });
    expect(isAutoDescription(first.customer_view)).toBe(true);
    expect(loaded.description).toBe('');
    // Kalkylen ändras: beskrivningen följer med i stället för att frysas.
    const changed = addAdjustment(addRow(d, newFriRow(null, 'Städning'), P, S), { label: 'Extra', amount: 10, rot_class: 'ovrigt' });
    const withLine = addFriLine(changed, changed.rows[changed.rows.length - 1].id, { description: 'Flyttstädning', qty: 1, unit: 'st', unit_price: 1500, rot_class: 'ovrigt' });
    const second = kalkylSaveFields(loaded, withLine, P, S);
    expect(second.description).toBe(offerScopeText(withLine, P, S));
    expect(second.description).toContain('Städning: Flyttstädning.');
    expect(second.customer_view.intro).toBeNull();
  });

  it('intro med text: säljarens egen beskrivning lämnas orörd', () => {
    const meta = { ...offerMetaFromRow(null, new Date(TODAY)), customer_name: 'Kund', description: 'Egen text.' };
    const saved = kalkylSaveFields(meta, d, P, S);
    expect(saved.customer_view.intro).toBe('Egen text.');
    const loaded = offerMetaFromRow({ ...saved });
    expect(loaded.description).toBe('Egen text.');
    expect(kalkylSaveFields(loaded, d, P, S).description).toBe('Egen text.');
  });

  it('offert utan customer_view: beskrivningen behandlas som förut', () => {
    expect(offerMetaFromRow({ description: 'Gammal text', calc_data: d }).description).toBe('Gammal text');
    expect(offerMetaFromRow({ description: 'Gammal text', customer_view: { version: 2, intro: null } }).description).toBe('Gammal text');
  });

  it('offertformuläret: ändrad beskrivning blir intro, oförändrad behåller sparad intro', () => {
    const cv: CustomerView = buildCustomerView(d, P, S, null);
    expect(customerViewWithFormIntro(null, 'a', 'b')).toBeUndefined();
    expect(customerViewWithFormIntro({ version: 2 }, 'a', 'b')).toBeUndefined();
    expect(customerViewWithFormIntro(cv, 'Auto', 'Auto')?.intro).toBeNull();
    expect(customerViewWithFormIntro(cv, 'Auto', 'Ny text ')?.intro).toBe('Ny text');
    expect(customerViewWithFormIntro({ ...cv, intro: 'Egen' }, 'Egen', '')?.intro).toBeNull();
    expect(customerViewWithFormIntro({ ...cv, intro: 'Egen' }, 'Egen', 'Egen')?.intro).toBe('Egen');
  });
});
