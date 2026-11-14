import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, addRow, newGolvRow, newMalningRow, newFriRow, newGrenRow, addFriLine,
  setGrenQty, updateRowMeta, setOverride, rowLines, DEFAULT_ROOM_DIMS, setRowOptional,
  buildAiContext, validateAiProposal, proposalStatus, applyAiRow, validateAiReview, applyAiSuggestion, validateAiAnswer, scaledSize,
  findCustomerData, aiErrorText, aiPdfError, aiRowTitle, AI_TEXT, AI_MISSING_DIMS_NOTE, AI_MAX_OBSERVATIONS,
  type KalkylData, type PriceItem, type AiProposal, type AiRowProposal,
} from '@/lib/kalkyl';
import { seedPriceItems } from './kalkylFixture';

const TODAY = '2026-11-12';
let n = 0;
function pi(patch: Partial<PriceItem> & Pick<PriceItem, 'code' | 'trade' | 'kind' | 'name' | 'unit'>): PriceItem {
  n += 1;
  return {
    id: `ai-${n}`, rot_class: patch.kind === 'arbete' ? 'arbete' : 'material', slot: null, spec: null, price_ex_vat: 100, cost_ex_vat: 40,
    hours_per_unit: 0.5, level: null, pack_size: null, pack_label: null, waste_pct: 0, coverage: null, color_system: null, color_code: null,
    color_hex: null, swatch: null, image_path: null, article_no: 'ART-9', supplier: 'Grossist AB', source: 'Prisark', price_date: TODAY,
    status: 'godkand', approved_by: 'Admin', approved_at: TODAY, meta: {}, sort_order: 100, updated_by: 'Admin', ...patch,
  };
}
const ALTAN_BYGG = pi({ code: 'altan.arb.bygg', trade: 'altan', kind: 'arbete', name: 'Bygga altan', unit: 'm²', price_ex_vat: 900 });
const ALTAN_TRALL = pi({ code: 'altan.mat.trall', trade: 'altan', kind: 'material', name: 'Trall', unit: 'm²', price_ex_vat: 320 });
const ALTAN_UTAN_PRIS = pi({ code: 'altan.till.trappa', trade: 'altan', kind: 'tillbehor', name: 'Trappa', unit: 'st', price_ex_vat: null });
const ARKIVERAD = pi({ code: 'altan.mat.gammal', trade: 'altan', kind: 'material', name: 'Gammal trall', unit: 'm²', status: 'arkiverad' });
const SOCKEL_EK = pi({ code: 'golv.mat.sockel-ek', trade: 'golv', kind: 'tillbehor', slot: 'golv.sockel', name: 'Sockellist ek', unit: 'm', price_ex_vat: 89 });
const ITEMS = [...seedPriceItems(() => ({ status: 'godkand', cost_ex_vat: 55, hours_per_unit: 0.3, supplier: 'Grossist AB', price_date: TODAY })), ALTAN_BYGG, ALTAN_TRALL, ALTAN_UTAN_PRIS, ARKIVERAD, SOCKEL_EK];
const P = indexPrices(ITEMS);

function kalkyl(): KalkylData {
  let d = emptyKalkyl();
  d = { ...d, premises: { house_type: 'villa', build_year: 1972, floors: 2 } };
  const room = newRoom('Vardagsrum', { length: 5, width: 4, height: 2.5, doors: 1, windows: 2 });
  d = addRoom(d, room);
  const g = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  d = addRow(d, g, P, S);
  d = updateRowMeta(d, g.id, { note: 'Kunden Anna vill ha det klart till jul' });
  d = setOverride(d, g.id, 'golv.material', { unit_price: 450 });
  d = addRow(d, newMalningRow(room.id), P, S);
  const gren = newGrenRow(null, 'altan', 'Altan');
  d = addRow(d, gren, P, S);
  d = setGrenQty(d, gren.id, ALTAN_BYGG, 12, P);
  const fri = newFriRow(room.id, 'Fönsterbänkar');
  d = addRow(d, fri, P, S);
  d = addFriLine(d, fri.id, { description: 'Fönsterbänk', qty: 2, unit: 'st', unit_price: 900, rot_class: 'material' });
  return d;
}

const allKeys = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach(x => allKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); allKeys(x, out); }
  return out;
};

describe('buildAiContext', () => {
  const d = kalkyl();
  const ctx = buildAiContext(d, ITEMS);

  it('innehåller aldrig kunduppgifter, kostnad, timmar, anteckningar eller prisstatus', () => {
    const keys = allKeys(ctx);
    for (const k of ['cost', 'cost_ex_vat', 'hours', 'hours_per_unit', 'note', 'price_status', 'price_date', 'status', 'price_ex_vat', 'supplier', 'article_no',
      'customer_name', 'customer_email', 'customer_phone', 'customer_address', 'customer_personnummer', 'fastighetsbeteckning', 'manual', 'overrides', 'favorites']) {
      expect(keys.has(k), k).toBe(false);
    }
    const json = JSON.stringify(ctx);
    for (const s of ['Kunden Anna', 'Grossist AB', 'ART-9', TODAY, 'Prisark', 'godkand']) expect(json, s).not.toContain(s);
  });

  it('katalogen: alla rader utom arkiverade, med kod, gren, typ, valgrupp, namn, spec, enhet och nivå', () => {
    expect(ctx.catalog).toHaveLength(ITEMS.length - 1);
    expect(ctx.catalog.some(c => c.code === ARKIVERAD.code)).toBe(false);
    expect(Object.keys(ctx.catalog[0]).sort()).toEqual(['code', 'kind', 'level', 'name', 'slot', 'spec', 'trade', 'unit']);
  });

  it('kalkylen i korthet: förutsättningar, rum med mått, rader med typ, val och gällande rader med à-pris och ROT-klass', () => {
    expect(ctx.kalkyl.premises).toEqual({ house_type: 'villa', build_year: 1972, floors: 2 });
    expect(ctx.kalkyl.rooms).toEqual([{ name: 'Vardagsrum', length: 5, width: 4, height: 2.5, doors: 1, windows: 2 }]);
    expect(ctx.kalkyl.rows.map(r => r.type)).toEqual(['golv', 'malning', 'gren', 'fri']);
    const golv = ctx.kalkyl.rows[0];
    expect(golv.choices).toMatchObject({ material_code: 'golv.mat.ekparkett-3stav', material: 'Ekparkett 3-stav', options: ['underlag', 'sockel'] });
    expect(golv.choices.products).toEqual({ 'golv.underlag': 'golv.mat.underlag', 'golv.sockel': 'golv.mat.sockel-vit-12x56' }); // tröskel ingår inte
    expect(golv.lines.find(l => l.code === 'golv.mat.ekparkett-3stav')?.unit_price).toBe(450); // gällande rad efter säljarens ändring
    expect(ctx.kalkyl.rows[1].choices.kulorer?.vagg).toBe('NCS S 0502-Y Varmvit');
    expect(ctx.kalkyl.rows[2]).toMatchObject({ gren: 'altan', room: null, lines: [{ code: 'altan.arb.bygg', qty: 12, unit_price: 900, rot_class: 'arbete' }] });
    expect(ctx.kalkyl.rows[3].lines[0]).toEqual({ description: 'Fönsterbänk', code: null, qty: 2, unit: 'st', unit_price: 900, rot_class: 'material' });
  });
});

describe('validateAiProposal', () => {
  it('okänd golvkod blir "material inte valt", okänd prisrad blir egen rad utan pris, okänd gren tas bort', () => {
    const v = validateAiProposal({
      rooms: [{ name: 'Kök', length: 4, width: 3.5, height: null }],
      rows: [
        { kind: 'golv', room: 'Kök', material_code: 'golv.mat.finns-inte', options: { rivning: true, underlag: 'ja' }, products: { 'golv.sockel': 'golv.mat.sockel-ek', 'golv.troskel': 'okand' } },
        { kind: 'gren', gren: 'altan', title: 'Altan', area: 20, items: [{ code: 'altan.mat.trall', qty: 20 }, { code: 'altan.mat.hittepa', name: 'Räcke', qty: 8, unit: 'm' }, { code: ARKIVERAD.code, name: 'Gammal trall', qty: 3 }] },
        { kind: 'gren', gren: 'pool', title: 'Pool', items: [] },
        { kind: 'okand', title: 'X' },
      ],
      questions: ['Takhöjden saknas för köket', '', 42],
    }, P);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const [golv, gren] = v.proposal.rows;
    expect(v.proposal.rows).toHaveLength(2);
    expect(golv).toMatchObject({ kind: 'golv', material_code: null, options: { rivning: true }, products: { 'golv.sockel': 'golv.mat.sockel-ek' } });
    expect(gren).toMatchObject({ kind: 'gren', items: [{ code: 'altan.mat.trall', qty: 20 }] });
    expect((gren as Extract<AiRowProposal, { kind: 'gren' }>).own.map(o => o.description)).toEqual(['Räcke', 'Gammal trall']);
    expect(v.proposal.rooms).toEqual([{ name: 'Kök', length: 4, width: 3.5, height: null, doors: null, windows: null }]);
    expect(v.proposal.questions).toEqual(['Takhöjden saknas för köket']);
  });

  it('orimliga tal: negativa mängder tas bort och mått över 100 m blir null', () => {
    const v = validateAiProposal({
      rooms: [{ name: 'Hall', length: 140, width: -2, height: 2.4, doors: -1, windows: 2 }],
      rows: [{ kind: 'gren', gren: 'altan', title: 'Altan', area: 20, length: 250, items: [{ code: 'altan.mat.trall', qty: -5 }, { code: 'altan.arb.bygg', qty: 0 }, { code: 'altan.arb.bygg', qty: 'NaN' }] }],
    }, P);
    if (v.ok === false) throw new Error(v.error);
    expect(v.proposal.rooms[0]).toEqual({ name: 'Hall', length: null, width: null, height: 2.4, doors: null, windows: 2 });
    expect(v.proposal.rows[0]).toMatchObject({ area: 20, length: null, items: [], own: [] });
  });

  it('kulörkoder tolkas och ogiltiga ignoreras', () => {
    const v = validateAiProposal({ rows: [{ kind: 'malning', room: 'Sovrum', tak: true, kulor_vagg: 'ncs s 1002-y', kulor_tak: 'blå', underarbete: 'mycket' }] }, P);
    if (v.ok === false) throw new Error(v.error);
    expect(v.proposal.rows[0]).toMatchObject({ kind: 'malning', tak: true, underarbete: null, kulor_tak: null, kulor_vagg: { system: 'NCS', code: 'S 1002-Y' } });
  });

  it('inget objekt eller fel form ger fel; tomt förslag är giltigt', () => {
    expect(validateAiProposal(null, P).ok).toBe(false);
    expect(validateAiProposal({ rows: 'x' }, P).ok).toBe(false);
    expect(validateAiProposal({}, P)).toEqual({ ok: true, proposal: { rooms: [], rows: [], questions: [] } });
  });
});

describe('proposalStatus och applyAiRow', () => {
  const proposalFrom = (raw: unknown): AiProposal => { const v = validateAiProposal(raw, P); if (v.ok === false) throw new Error(v.error); return v.proposal; };

  it('"Finns redan" när kalkylen har samma slag i ett rum med samma namn, utan hänsyn till versaler', () => {
    const d = kalkyl();
    const p = proposalFrom({ rows: [
      { kind: 'golv', room: 'VARDAGSRUM', material_code: null }, { kind: 'golv', room: 'Kök', material_code: null },
      { kind: 'malning', room: 'vardagsrum' }, { kind: 'gren', gren: 'altan', title: 'Ny altan' }, { kind: 'gren', gren: 'tak', title: 'Tak' },
      { kind: 'fri', room: 'Vardagsrum', title: 'fönsterbänkar', lines: [] }, { kind: 'fri', room: 'Vardagsrum', title: 'Lister', lines: [{ description: 'Taklist', qty: 18, unit: 'm' }] },
    ] });
    expect(Object.values(proposalStatus(p, d))).toEqual(['finns', 'ny', 'finns', 'finns', 'ny', 'finns', 'ny']);
    expect(aiRowTitle(p.rows[0])).toBe('VARDAGSRUM · Golv');
  });

  it('ett pris i förslaget ger aldrig ett pris i kalkylen: priser kommer bara från prislistan', () => {
    const p = proposalFrom({ rows: [
      { kind: 'gren', gren: 'altan', title: 'Altan', area: 20, unit_price: 1, amount: 5, items: [
        { code: 'altan.mat.trall', qty: 20, unit_price: 1, price: 1, amount: 20 }, { code: 'altan.till.trappa', qty: 1, unit_price: 4999 },
        { code: 'nej', name: 'Räcke', qty: 8, unit: 'm', unit_price: 250 },
      ] },
      { kind: 'fri', title: 'Städning', lines: [{ description: 'Flyttstädning', qty: 1, unit: 'st', unit_price: 3000, price: 3000 }] },
    ] });
    let d = emptyKalkyl();
    for (const r of p.rows) d = applyAiRow(d, r, p, P, S);
    const lines = d.rows.flatMap(r => rowLines(r));
    expect(lines.find(l => l.code === 'altan.mat.trall')).toMatchObject({ qty: 20, unit_price: 320, amount: 6400 });
    expect(lines.find(l => l.code === 'altan.till.trappa')).toMatchObject({ unit_price: null, amount: 0 });
    expect(lines.find(l => l.description === 'Räcke')).toMatchObject({ code: null, qty: 8, unit: 'm', unit_price: null, amount: 0 });
    expect(lines.find(l => l.description === 'Flyttstädning')).toMatchObject({ unit_price: null, amount: 0 });
    for (const l of lines) expect([320, null]).toContain(l.unit_price);
  });

  it('rum som saknas skapas; saknade mått ger standardmått och anteckningen "Mått saknas, kontrollera rummet"', () => {
    const p = proposalFrom({
      rooms: [{ name: 'Kök', length: 4, width: 3, height: 2.5, doors: 1, windows: 1 }, { name: 'Hall', length: 3, width: null, height: null }],
      rows: [
        { kind: 'golv', room: 'Kök', material_code: 'golv.mat.laminat-ek', options: { rivning: true }, products: { 'golv.sockel': 'golv.mat.sockel-ek' } },
        { kind: 'malning', room: 'Hall', tak: false, kulor_vagg: 'NCS S 1002-Y' },
        { kind: 'malning', room: 'Sovrum' },
      ],
    });
    let d = kalkyl();
    for (const r of p.rows) d = applyAiRow(d, r, p, P, S);
    const kok = d.rooms.find(r => r.name === 'Kök')!;
    const hall = d.rooms.find(r => r.name === 'Hall')!;
    const sovrum = d.rooms.find(r => r.name === 'Sovrum')!;
    expect(kok.dims).toEqual({ length: 4, width: 3, height: 2.5, doors: 1, windows: 1 });
    expect(hall.dims).toEqual({ ...DEFAULT_ROOM_DIMS, length: 3 });
    expect(sovrum.dims).toEqual(DEFAULT_ROOM_DIMS);
    const rowIn = (roomId: string) => d.rows.find(r => r.room_id === roomId)!;
    expect(rowIn(kok.id).note).toBeUndefined();
    expect(rowIn(kok.id).input).toMatchObject({ material_code: 'golv.mat.laminat-ek', rivning: true, selections: { 'golv.sockel': 'golv.mat.sockel-ek' } });
    expect(rowIn(kok.id).lines.find(l => l.key === 'golv.sockel')).toMatchObject({ code: 'golv.mat.sockel-ek', unit_price: 89 });
    expect(rowIn(hall.id).note).toBe(AI_MISSING_DIMS_NOTE);
    expect(rowIn(hall.id).input).toMatchObject({ tak: false, kulor_vagg: { code: 'S 1002-Y' } });
    expect(rowIn(sovrum.id).note).toBe(AI_MISSING_DIMS_NOTE);
  });

  it('befintligt rum används (samma namn utan hänsyn till versaler) och golv utan känd kod får tomt material', () => {
    const d0 = kalkyl();
    const p = proposalFrom({ rows: [{ kind: 'golv', room: 'vardagsrum', material_code: 'okand' }] });
    const d = applyAiRow(d0, p.rows[0], p, P, S);
    expect(d.rooms).toHaveLength(1);
    const row = d.rows[d.rows.length - 1];
    expect(row.room_id).toBe(d0.rooms[0].id);
    expect(row.note).toBeUndefined();
    expect(row.lines.find(l => l.key === 'golv.material')).toMatchObject({ code: null, unit_price: null, amount: 0 });
  });

  it('grenrad: mått från förslaget, rum utan mått föreslår ingen yta', () => {
    const p = proposalFrom({ rows: [{ kind: 'gren', gren: 'badrum', room: 'Badrum', title: '', items: [] }, { kind: 'gren', gren: 'altan', title: 'Altan', area: 18, length: 7.5, items: [{ code: 'altan.arb.bygg', qty: 18 }] }] });
    let d = emptyKalkyl();
    for (const r of p.rows) d = applyAiRow(d, r, p, P, S);
    expect(d.rows[0]).toMatchObject({ trade: 'fri', gren: 'badrum', title: 'Badrum', note: AI_MISSING_DIMS_NOTE });
    expect(d.rows[0].measure).toBeUndefined();
    expect(d.rows[1]).toMatchObject({ gren: 'altan', measure: { area: 18, length: 7.5 } });
    expect(d.rows[1].lines[0]).toMatchObject({ code: 'altan.arb.bygg', qty: 18, unit_price: 900 });
  });
});

describe('validateAiReview och applyAiSuggestion', () => {
  const d = kalkyl();
  const [golv, , gren] = d.rows;

  it('behåller bara iakttagelser på rader som finns och förslag med giltig, icke arkiverad kod', () => {
    const obs = validateAiReview({ observations: [
      { title: 'Tröskel saknas', text: 'Rummet har en dörr.', row_id: golv.id, suggestion: { type: 'add_line', code: 'golv.mat.troskel-ek', qty: 1, unit_price: 5 } },
      { title: 'Okänd rad', text: '', row_id: 'rad_finns_inte', suggestion: null },
      { title: 'Arkiverad kod', text: 'x', row_id: gren.id, suggestion: { type: 'add_line', code: ARKIVERAD.code, qty: 2 } },
      { title: 'Okänd kod', text: 'x', row_id: gren.id, suggestion: { type: 'add_line', code: 'hittepa', qty: 2 } },
      { title: 'Öppna', text: 'x', row_id: gren.id, suggestion: { type: 'open_row' } },
      { title: '', text: 'utan rubrik', row_id: gren.id },
    ] }, d, P);
    expect(obs.map(o => o.title)).toEqual(['Tröskel saknas', 'Arkiverad kod', 'Okänd kod', 'Öppna']);
    expect(obs.map(o => o.suggestion?.type ?? null)).toEqual(['add_line', null, null, 'open_row']);
    expect(validateAiReview(null, d, P)).toEqual([]);
  });

  it('högst åtta iakttagelser', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `Iakttagelse ${i}`, text: '', row_id: golv.id }));
    expect(validateAiReview({ observations: many }, d, P)).toHaveLength(AI_MAX_OBSERVATIONS);
  });

  it('"Lägg till" lägger prisraden i raden med prislistans pris (grenens lista när grenen stämmer)', () => {
    const [obs] = validateAiReview({ observations: [{ title: 'Trall saknas', text: '', row_id: gren.id, suggestion: { type: 'add_line', code: 'altan.mat.trall', qty: 12 } }] }, d, P);
    const next = applyAiSuggestion(d, obs, P);
    expect(next.rows[2].lines.find(l => l.code === 'altan.mat.trall')).toMatchObject({ qty: 12, unit_price: 320 });
    const [obs2] = validateAiReview({ observations: [{ title: 'Tröskel', text: '', row_id: golv.id, suggestion: { type: 'add_line', code: 'golv.mat.troskel-ek', qty: 1 } }] }, d, P);
    const line = applyAiSuggestion(d, obs2, P).rows[0].lines.find(l => l.key.startsWith('egen.'));
    expect(line).toMatchObject({ code: 'golv.mat.troskel-ek', unit_price: P['golv.mat.troskel-ek'].price_ex_vat });
    expect(applyAiSuggestion(d, { ...obs2, suggestion: { type: 'open_row' } }, P)).toBe(d);
  });
});

describe('fråga, bilagor, kunduppgifter och feltexter', () => {
  it('validateAiAnswer', () => {
    expect(validateAiAnswer('  Ja, golvet ingår.  ')).toBe('Ja, golvet ingår.');
    expect(validateAiAnswer('')).toBeNull();
    expect(validateAiAnswer(5)).toBeNull();
    expect(validateAiAnswer('a'.repeat(3000))).toHaveLength(2000);
  });

  it('scaledSize: längsta sidan högst 1 600 px, aldrig uppskalning', () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('aiPdfError: bara PDF upp till 10 MB', () => {
    expect(aiPdfError({ size: 1000, type: 'application/pdf', name: 'ue.pdf' })).toBeNull();
    expect(aiPdfError({ size: 10 * 1024 * 1024 + 1, type: 'application/pdf', name: 'ue.pdf' })).toMatch(/10 MB/);
    expect(aiPdfError({ size: 1000, type: 'image/png', name: 'ue.png' })).toMatch(/PDF/);
    expect(aiPdfError({ size: 0, type: 'application/pdf', name: 'ue.pdf' })).toMatch(/tom/);
  });

  it('findCustomerData hittar personnummer och offertens kunduppgifter', () => {
    const c = { customer_name: 'Anna Andersson', customer_phone: '070-123 45 67', customer_email: 'anna@example.se', customer_address: 'Storgatan 1', customer_personnummer: '19800101-1234', fastighetsbeteckning: 'Huddinge 1:2' };
    expect(findCustomerData('Golv i köket, 4 x 3 m, ek.', c)).toEqual([]);
    expect(findCustomerData('pnr 800101-1234', {})).toEqual(['personnummer']);
    expect(findCustomerData('pnr 198001011234', {})).toEqual(['personnummer']);
    expect(findCustomerData('ring 0701234567', {})).toEqual([]);
    expect(findCustomerData('ANNA ANDERSSON ringer på 0701234567, Storgatan 1', c)).toEqual(['kundens namn', 'adress', 'telefon']);
    expect(findCustomerData('mejla anna@example.se, fastighet huddinge 1:2', c)).toEqual(['e-post', 'fastighetsbeteckning']);
  });

  it('aiErrorText: tak, tjänstefel och serverns egen text', () => {
    expect(aiErrorText('limit', 'x')).toBe(AI_TEXT.limit);
    expect(aiErrorText('gateway', 'x')).toBe('AI-tjänsten svarade inte. Försök igen.');
    expect(aiErrorText(null)).toBe(AI_TEXT.failed);
    expect(aiErrorText('too_large', 'Anteckningen får vara högst 4000 tecken.')).toBe('Anteckningen får vara högst 4000 tecken.');
  });
});

describe('buildAiContext: tillval', () => {
  it('märker tillvalsrader med optional: true och bara dem', () => {
    const d = kalkyl();
    const altan = d.rows[2].id;
    expect(buildAiContext(d, ITEMS).kalkyl.rows.map(r => r.optional)).toEqual([false, false, false, false]);
    const ctx = buildAiContext(setRowOptional(d, altan, true), ITEMS);
    expect(ctx.kalkyl.rows.map(r => [r.id === altan, r.optional])).toEqual([[false, false], [false, false], [true, true], [false, false]]);
  });
});
