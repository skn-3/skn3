import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, newGolvRow, newMalningRow, newFriRow, addRow, updateRowInput,
  setOverride, addFriLine, rowLines, computeGolv, computeMalning, resolveSlotCode, slotProducts, hasProductChoice, selectSlotProduct,
  runKontroller, sendCheck, offerScopeText, rowSpecText, golvOptions, parsePriceImport, diffPriceImport, importRowPatch,
  PRICE_TRADES, PRICE_UNITS, TRADE_LABEL, groupPriceItems, withLayCode, layCodeOptions, layCodeOf,
  type KalkylData, type GolvInput, type MalningInput, type PriceItem, type PriceIndex,
} from '@/lib/kalkyl';
import { seedPriceItems } from './kalkylFixture';
import { LEGACY_GOLV_LINES, LEGACY_MALNING_LINES } from './kalkylLegacyRows';

const TODAY = '2026-11-12';
const seed = seedPriceItems();
const approved = () => seedPriceItems(() => ({ status: 'godkand' }));
const DIMS = { length: 6, width: 4.1, height: 2.5, doors: 2, windows: 2 };
const ALL_GOLV: GolvInput = { material_code: 'golv.mat.ekparkett-3stav', direction: 'langs', underlag: true, sockel: true, troskel: true, rivning: true, flytspackling: true, mobelflytt: true, bortforsling: true };
const MALNING: MalningInput = { underarbete: 'normal', tak: true, snickerier: true, coats: 3, kulor_vagg: { system: 'NCS', code: 'S 0502-Y' } };

/** En ny prisrad byggd på en befintlig i startdatan. */
function item(base: string, patch: Partial<PriceItem>): PriceItem {
  const b = seed.find(i => i.code === base)!;
  return { ...b, id: `extra-${patch.code}`, meta: {}, swatch: null, ...patch } as PriceItem;
}
const SOCKEL_EK = item('golv.mat.sockel-vit-12x56', {
  code: 'golv.mat.sockel-ek-14x42', name: 'Sockellist ek 14×42', spec: 'Oljad', level: 'premium', pack_size: 2.2, waste_pct: 5,
  price_ex_vat: 52, color_system: 'NCS', color_code: 'S 1002-Y', sort_order: 95,
});
const VAGGFARG_PREMIUM = item('malning.mat.vaggfarg', {
  code: 'malning.mat.vaggfarg-premium', name: 'Väggfärg premium', spec: 'Helmatt 5', level: 'premium', coverage: 10, price_ex_vat: 150, sort_order: 231,
});
const idx = (items: PriceItem[]): PriceIndex => indexPrices(items);
const blockingIds = (list: { id: string; blocking: boolean }[]) => list.filter(k => k.blocking).map(k => k.id);

function kalkyl(prices: PriceIndex, opts: { golv?: Partial<GolvInput>; malning?: Partial<MalningInput>; dims?: typeof DIMS } = {}) {
  let d: KalkylData = emptyKalkyl();
  const room = newRoom('Vardagsrum', opts.dims ?? DIMS);
  d = addRoom(d, room);
  const g = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  const m = newMalningRow(room.id);
  d = addRow(d, g, prices, S);
  d = updateRowInput(d, g.id, { ...ALL_GOLV, ...opts.golv }, prices, S);
  d = addRow(d, m, prices, S);
  d = updateRowInput(d, m.id, { ...MALNING, ...opts.malning }, prices, S);
  d = { ...d, premises: { house_type: 'villa', build_year: 1968, floors: 1 } };
  return { d, g, m, room };
}

describe('valgrupper: vilken kod som gäller', () => {
  const extra = idx([...seed, SOCKEL_EK]);

  it('(1) vald kod som finns, hör till valgruppen och inte är arkiverad', () => {
    expect(resolveSlotCode('golv.sockel', { 'golv.sockel': SOCKEL_EK.code }, extra)).toBe(SOCKEL_EK.code);
  });

  it('(2) annars dagens fasta kod: inget val, arkiverat val, val från fel valgrupp eller okänd kod', () => {
    expect(resolveSlotCode('golv.sockel', undefined, extra)).toBe('golv.mat.sockel-vit-12x56');
    const archived = idx([...seed, { ...SOCKEL_EK, status: 'arkiverad' }]);
    expect(resolveSlotCode('golv.sockel', { 'golv.sockel': SOCKEL_EK.code }, archived)).toBe('golv.mat.sockel-vit-12x56');
    expect(resolveSlotCode('golv.sockel', { 'golv.sockel': 'golv.mat.underlag' }, extra)).toBe('golv.mat.sockel-vit-12x56');
    expect(resolveSlotCode('golv.sockel', { 'golv.sockel': 'finns.inte' }, extra)).toBe('golv.mat.sockel-vit-12x56');
  });

  it('(3) arkiverad fast kod: första icke arkiverade i valgruppen, lägst sort_order och sedan kod', () => {
    const b = { ...SOCKEL_EK, code: 'golv.mat.sockel-b', sort_order: 50 };
    const a = { ...SOCKEL_EK, code: 'golv.mat.sockel-a', sort_order: 50 };
    const late = { ...SOCKEL_EK, code: 'golv.mat.sockel-0', sort_order: 99 };
    const list = idx([...seedPriceItems(i => (i.code === 'golv.mat.sockel-vit-12x56' ? { status: 'arkiverad' } : {})), late, b, a]);
    expect(resolveSlotCode('golv.sockel', undefined, list)).toBe('golv.mat.sockel-a');
    expect(slotProducts('golv.sockel', list).map(i => i.code)).toEqual(['golv.mat.sockel-a', 'golv.mat.sockel-b', 'golv.mat.sockel-0']);
  });

  it('(4) ingen produkt alls: dagens fasta kod, som ger "pris saknas"', () => {
    const none = idx(seed.filter(i => i.slot !== 'golv.sockel'));
    expect(resolveSlotCode('golv.sockel', undefined, none)).toBe('golv.mat.sockel-vit-12x56');
    const sockel = computeGolv(DIMS, ALL_GOLV, none, S).find(l => l.key === 'golv.sockel')!;
    expect(sockel).toMatchObject({ code: 'golv.mat.sockel-vit-12x56', unit_price: null, amount: 0 });
  });

  it('Byt visas bara när valgruppen har minst två valbara produkter', () => {
    expect(hasProductChoice('golv.sockel', seed)).toBe(false);
    expect(hasProductChoice('golv.sockel', extra)).toBe(true);
    expect(hasProductChoice('golv.sockel', [...seed, { ...SOCKEL_EK, status: 'arkiverad' }])).toBe(false);
  });
});

describe('valgrupper i recepten', () => {
  it('en sparad kalkyl utan selections ger exakt samma rader som före valgrupperna', () => {
    const p = idx(seed);
    expect(computeGolv(DIMS, ALL_GOLV, p, S)).toEqual(LEGACY_GOLV_LINES);
    expect(computeMalning(DIMS, MALNING, p, S)).toEqual(LEGACY_MALNING_LINES);
    // Tomma val och val av dagens koder ändrar ingenting.
    expect(computeGolv(DIMS, { ...ALL_GOLV, selections: {} }, p, S)).toEqual(LEGACY_GOLV_LINES);
    expect(computeMalning(DIMS, { ...MALNING, selections: { 'malning.vaggfarg': 'malning.mat.vaggfarg' } }, p, S)).toEqual(LEGACY_MALNING_LINES);
  });

  it('vald sockel: förpackning, spill och pris från produkten, samma radnyckel och arbetsraden oförändrad', () => {
    const p = idx([...seed, SOCKEL_EK]);
    const lines = computeGolv(DIMS, { ...ALL_GOLV, selections: { 'golv.sockel': SOCKEL_EK.code } }, p, S);
    const sockel = lines.find(l => l.key === 'golv.sockel')!;
    // 18,4 m + 5 % = 19,32 m → 9 längder à 2,2 m = 19,8 m.
    expect(sockel).toMatchObject({ code: SOCKEL_EK.code, description: 'Sockellist ek 14×42', qty: 19.8, unit_price: 52, amount: 1029.6, detail: '9 längder (19,8 m)' });
    expect(lines.find(l => l.key === 'golv.sockel_montering')).toEqual(LEGACY_GOLV_LINES.find(l => l.key === 'golv.sockel_montering'));
    expect(lines.map(l => l.key)).toEqual(LEGACY_GOLV_LINES.map(l => l.key));
  });

  it('vald väggfärg: åtgång och pris från produkten', () => {
    const p = idx([...seed, VAGGFARG_PREMIUM]);
    const lines = computeMalning(DIMS, { ...MALNING, selections: { 'malning.vaggfarg': VAGGFARG_PREMIUM.code } }, p, S);
    // 43,6 m² × 3 strykningar / 10 m² per liter = 13,08 → 14 l.
    expect(lines.find(l => l.key === 'malning.vaggfarg')).toMatchObject({ code: VAGGFARG_PREMIUM.code, qty: 14, unit_price: 150, amount: 2100 });
    expect(lines.find(l => l.key === 'malning.vagg')).toEqual(LEGACY_MALNING_LINES.find(l => l.key === 'malning.vagg'));
  });

  it('selectSlotProduct räknar om raden och behåller säljarens ändringar på samma nyckel', () => {
    const p = idx([...seed, SOCKEL_EK]);
    const { d, g, m } = kalkyl(p);
    const changed = setOverride(d, g.id, 'golv.sockel', { qty: 25 });
    const next = selectSlotProduct(changed, g.id, 'golv.sockel', SOCKEL_EK.code, p, S);
    const row = next.rows.find(r => r.id === g.id)!;
    expect((row.input as GolvInput).selections).toEqual({ 'golv.sockel': SOCKEL_EK.code });
    expect(rowLines(row).find(l => l.key === 'golv.sockel')).toMatchObject({ code: SOCKEL_EK.code, qty: 25, unit_price: 52, amount: 1300, manual: true });
    // Valgrupp från fel gren ändrar ingenting.
    expect(selectSlotProduct(next, g.id, 'malning.vaggfarg', VAGGFARG_PREMIUM.code, p, S)).toBe(next);
    expect(selectSlotProduct(next, m.id, 'golv.sockel', SOCKEL_EK.code, p, S)).toBe(next);
  });

  it('kundtexterna använder vald produkts namn och kulör', () => {
    const p = idx([...seed, SOCKEL_EK, VAGGFARG_PREMIUM]);
    const { d, g, m } = kalkyl(p, { golv: { selections: { 'golv.sockel': SOCKEL_EK.code } }, malning: { selections: { 'malning.vaggfarg': VAGGFARG_PREMIUM.code } } });
    const text = offerScopeText(d, p, S).split('\n');
    expect(text[0]).toContain('sockellist ek 14×42 (NCS S 1002-Y)');
    expect(text[1]).toBe('Vardagsrum – Målning: Väggar 43,6 m² (3 strykningar, Väggfärg premium Helmatt 5, NCS S 0502-Y), tak 24,6 m² (Takfärg Helmatt 3, NCS S 0500-N) samt foder och socklar (Snickerifärg Halvblank 40, NCS S 0502-Y). Underarbete normalt.');
    expect(rowSpecText(d.rows.find(r => r.id === g.id)!, p)).toContain('sockellist ek 14×42 (NCS S 1002-Y)');
    expect(rowSpecText(d.rows.find(r => r.id === m.id)!, p)).toBe('Väggar S 0502-Y (Väggfärg premium Helmatt 5) · 3 strykningar · tak S 0500-N (Takfärg Helmatt 3) · snickerier S 0502-Y (Snickerifärg Halvblank 40) · normalt underarbete');
    const sockel = golvOptions(d.rows.find(r => r.id === g.id)!, d.rooms[0], p, S).find(o => o.flag === 'sockel')!;
    expect(sockel).toMatchObject({ slot: 'golv.sockel', code: SOCKEL_EK.code });
    expect(sockel.product?.name).toBe('Sockellist ek 14×42');
  });
});

describe('atgang_saknas', () => {
  const noCoverage = (codes: string[]) => idx(seedPriceItems(i => ({ status: 'godkand', ...(codes.includes(i.code) ? { coverage: null } : {}) })));

  it('väggfärg utan åtgång blockerar, mängden blir 0 liter', () => {
    const p = noCoverage(['malning.mat.vaggfarg']);
    const { d, m } = kalkyl(p);
    expect(rowLines(d.rows.find(r => r.id === m.id)!).find(l => l.key === 'malning.vaggfarg')!.qty).toBe(0);
    const list = runKontroller(d, p, S, TODAY);
    expect(blockingIds(list)).toEqual([`atgang_saknas:${m.id}`]);
    expect(list.find(k => k.id === `atgang_saknas:${m.id}`)).toMatchObject({
      level: 'atgard', row_id: m.id, title: 'Åtgång saknas', source: 'Prislistan',
      text: 'Målning: Väggfärg saknar åtgång i prislistan, så färgmängden kan inte räknas. Lägg in åtgången i Prislista eller välj en annan produkt.',
    });
    expect(sendCheck(d, p, S, TODAY)).toMatchObject({ can_send: false, messages: ['1 produkt saknar åtgång'] });
  });

  it('två produkter ger plural; tak som inte ingår räknas inte', () => {
    const p = noCoverage(['malning.mat.vaggfarg', 'malning.mat.takfarg']);
    expect(sendCheck(kalkyl(p).d, p, S, TODAY).messages).toEqual(['2 produkter saknar åtgång']);
    const { d, m } = kalkyl(p, { malning: { tak: false } });
    expect(runKontroller(d, p, S, TODAY).find(k => k.id === `atgang_saknas:${m.id}`)!.text.startsWith('Målning: Väggfärg saknar')).toBe(true);
  });

  it('ingen kontroll när ytan är 0, när säljaren satt mängden eller när åtgången finns', () => {
    const p = noCoverage(['malning.mat.vaggfarg']);
    const empty = kalkyl(p, { dims: { length: 0, width: 0, height: 2.5, doors: 0, windows: 0 }, malning: { snickerier: false } });
    expect(runKontroller(empty.d, p, S, TODAY).some(k => k.id.startsWith('atgang_saknas'))).toBe(false);
    const { d, m } = kalkyl(p);
    const own = setOverride(d, m.id, 'malning.vaggfarg', { qty: 12 });
    expect(runKontroller(own, p, S, TODAY).some(k => k.id.startsWith('atgang_saknas'))).toBe(false);
    const ok = idx(approved());
    expect(runKontroller(kalkyl(ok).d, ok, S, TODAY).some(k => k.id.startsWith('atgang_saknas'))).toBe(false);
  });
});

describe('arbetsrad för läggning', () => {
  it('golvmaterial utan arbetskod: egen blockerande kontroll i stället för "pris saknas"', () => {
    const p = idx(seedPriceItems(i => ({ status: 'godkand', ...(i.code === 'golv.mat.ekparkett-3stav' ? { meta: {} } : {}) })));
    const { d, g } = kalkyl(p);
    const list = runKontroller(d, p, S, TODAY);
    expect(blockingIds(list)).toEqual([`laggning_saknas:${g.id}`]);
    expect(list.find(k => k.id === `laggning_saknas:${g.id}`)).toMatchObject({
      level: 'atgard', row_id: g.id, title: 'Arbetsrad saknas', source: 'Prislistan',
      text: 'Golv: golvmaterialet saknar arbetsrad för läggning. Välj arbetsrad på materialet i Prislista.',
    });
    expect(sendCheck(d, p, S, TODAY).messages).toEqual(['Golv: golvmaterialet saknar arbetsrad för läggning. Välj arbetsrad på materialet i Prislista.']);
  });

  it('arbetskod som inte finns i prislistan ger fortfarande "pris saknas"', () => {
    const p = idx(seedPriceItems(i => ({ status: 'godkand', ...(i.code === 'golv.mat.ekparkett-3stav' ? { meta: { lay_code: 'golv.arb.finns-inte' } } : {}) })));
    const { d, g } = kalkyl(p);
    expect(blockingIds(runKontroller(d, p, S, TODAY))).toEqual([`pris_saknas:${g.id}`]);
  });

  it('withLayCode, layCodeOf och layCodeOptions', () => {
    expect(withLayCode({ foo: 1 }, 'golv.arb.lagg-klick')).toEqual({ foo: 1, lay_code: 'golv.arb.lagg-klick' });
    expect(withLayCode({ foo: 1, lay_code: 'x' }, null)).toEqual({ foo: 1 });
    expect(layCodeOf({ lay_code: ' ' })).toBeNull();
    expect(layCodeOptions(seed).map(i => i.code)).toEqual([
      'golv.arb.lagg-laminat', 'golv.arb.lagg-klick', 'golv.arb.lagg-fiskben', 'golv.arb.sockel-montering',
      'golv.arb.troskel-montering', 'golv.arb.rivning', 'golv.arb.flytspackling',
    ]);
  });
});

describe('importen: arbetskod, enheter och grenar', () => {
  const H = 'kod;gren;typ;rot;namn;enhet;pris_ex_moms;arbetskod';

  it('arbetskod skrivs till meta.lay_code och måste finnas i prislistan eller i samma import', () => {
    const r = parsePriceImport([H,
      'golv.mat.ny-ek;golv;material;material;Ny ek;m²;300;golv.arb.lagg-klick',
      'golv.mat.ny-x;golv;material;material;X;m²;300;golv.arb.saknas',
      'golv.mat.ny-y;golv;material;material;Y;m²;300;GOLV.ARB.NY-LAGG',
      'golv.arb.ny-lagg;golv;arbete;arbete;Ny läggning;m²;200;',
    ].join('\n'));
    const diff = diffPriceImport(r.rows, seed);
    expect(diff.map(x => x.status)).toEqual(['ny', 'fel', 'ny', 'ny']);
    expect(diff[1].row.errors).toEqual(['Arbetskoden finns inte: golv.arb.saknas']);
    expect(importRowPatch(diff[0].row).meta).toEqual({ lay_code: 'golv.arb.lagg-klick' });
    expect(importRowPatch(diff[2].row).meta).toEqual({ lay_code: 'golv.arb.ny-lagg' });
    expect(importRowPatch(diff[3].row).meta).toBeUndefined();
  });

  it('ändrad arbetskod är en ändring; tom cell ändrar ingenting; övriga nycklar i meta lämnas orörda', () => {
    const changed = diffPriceImport(parsePriceImport(`${H}\ngolv.mat.laminat-ek;golv;material;material;Laminat ek;m²;199,2;golv.arb.lagg-klick`).rows, seed)[0];
    expect(changed.status).toBe('andrad');
    expect(changed.changes).toEqual([{ field: 'lay_code', old: 'golv.arb.lagg-laminat', new: 'golv.arb.lagg-klick' }]);
    const existing = { meta: { lay_code: 'golv.arb.lagg-laminat', note: 'behåll' } };
    expect(importRowPatch(changed.row, existing).meta).toEqual({ lay_code: 'golv.arb.lagg-klick', note: 'behåll' });

    const empty = diffPriceImport(parsePriceImport(`${H}\ngolv.mat.laminat-ek;golv;material;material;Laminat ek;m²;199,2;`).rows, seed)[0];
    expect(empty.status).toBe('oforandrad');
    expect('meta' in importRowPatch(empty.row, existing)).toBe(false);
  });

  it('nya enheter normaliseras', () => {
    expect(PRICE_UNITS).toEqual(expect.arrayContaining(['m³', 'ton', 'vecka']));
    const units = ['m3', 'kbm', 'M3', 't', 'ton', 'v', 'veckor', 'vecka', 'm³'];
    const r = parsePriceImport([H, ...units.map((u, i) => `x.${i};mark;material;material;X${i};${u};1;`)].join('\n'));
    expect(r.rows.map(x => x.errors)).toEqual(units.map(() => []));
    expect(r.rows.map(x => x.values.unit)).toEqual(['m³', 'm³', 'm³', 'ton', 'ton', 'vecka', 'vecka', 'vecka', 'm³']);
  });

  it('grenarna mark och el, i rätt ordning och med etiketter', () => {
    const r = parsePriceImport(`${H}\nmark.arb.grav;mark;arbete;arbete;Grävning;m³;400;\nel.arb.uttag;EL;arbete;arbete;Uttag;st;900;`);
    expect(r.rows.map(x => [x.errors, x.values.trade])).toEqual([[[], 'mark'], [[], 'el']]);
    expect(PRICE_TRADES.map(t => TRADE_LABEL[t])).toEqual([
      'Golv', 'Målning', 'Fasad och puts', 'Tak', 'Altan och trall', 'Mark, betong och grävning', 'El', 'Badrum', 'Kök', 'Renovering', 'Gemensamt',
    ]);
    const groups = groupPriceItems([item('gem.ovr.etablering', { code: 'k', trade: 'kok' }), item('gem.ovr.etablering', { code: 'm', trade: 'mark' })]);
    expect(groups.map(g => g.trade)).toEqual(['mark', 'kok']);
  });
});

describe('kontroller för bostadsrätt och elarbete', () => {
  const FASAD = item('golv.arb.rivning', { code: 'fasad.arb.puts', trade: 'fasad', name: 'Putslagning', unit: 'm²', price_ex_vat: 500 });
  const EL = item('golv.arb.rivning', { code: 'el.arb.uttag', trade: 'el', name: 'Nytt eluttag', unit: 'st', price_ex_vat: 900 });
  const p = idx([...approved(), { ...FASAD, status: 'godkand' }, { ...EL, status: 'godkand' }]);

  function withLine(it: PriceItem, house: KalkylData['premises']['house_type']) {
    let d = emptyKalkyl();
    const row = newFriRow(null, 'Utvändigt');
    d = addRow(d, row, p, S);
    d = addFriLine(d, row.id, p[it.code], 10);
    return { d: { ...d, premises: { house_type: house, build_year: 1990, floors: 1 } }, row };
  }

  it('rot_bostadsratt_utvandigt: arbete på fasad i bostadsrätt, inte blockerande', () => {
    const { d } = withLine(FASAD, 'bostadsratt');
    const k = runKontroller(d, p, S, TODAY).find(x => x.id === 'rot_bostadsratt_utvandigt');
    expect(k).toMatchObject({
      level: 'atgard', blocking: false, source: 'Skatteverket (ROT)',
      text: 'ROT ges inte för utvändigt arbete i bostadsrätt (fasad, tak, balkong, altan, mark). Ändra radens ROT-klass eller stäng av ROT.',
    });
    expect(sendCheck(d, p, S, TODAY).can_send).toBe(true);
  });

  it('rot_bostadsratt_utvandigt gäller inte villa, material, rader utan kod eller när ROT är avstängt', () => {
    const has = (d: KalkylData, ctx?: { rot_enabled?: boolean }) => runKontroller(d, p, S, TODAY, ctx).some(x => x.id === 'rot_bostadsratt_utvandigt');
    expect(has(withLine(FASAD, 'villa').d)).toBe(false);
    const brf = withLine(FASAD, 'bostadsratt');
    expect(has(brf.d, { rot_enabled: false })).toBe(false);
    const asMaterial: KalkylData = { ...brf.d, rows: brf.d.rows.map(r => ({ ...r, lines: r.lines.map(l => ({ ...l, rot_class: 'material' as const })) })) };
    expect(has(asMaterial)).toBe(false);
    const noCode: KalkylData = { ...brf.d, rows: brf.d.rows.map(r => ({ ...r, lines: r.lines.map(l => ({ ...l, code: null })) })) };
    expect(has(noCode)).toBe(false);
  });

  it('el_behorighet: info när en rad hör till grenen el', () => {
    const { d } = withLine(EL, 'villa');
    expect(runKontroller(d, p, S, TODAY).find(x => x.id === 'el_behorighet')).toMatchObject({
      level: 'info', blocking: false, source: 'Elsäkerhetsverket',
      text: 'Elinstallationsarbete ska utföras av ett elinstallationsföretag som är registrerat hos Elsäkerhetsverket. Ange i offerten vilket företag som gör elarbetet.',
    });
    expect(runKontroller(withLine(FASAD, 'villa').d, p, S, TODAY).some(x => x.id === 'el_behorighet')).toBe(false);
  });
});
