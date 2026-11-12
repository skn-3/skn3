import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, newGolvRow, newFriRow, addRow, updateRowInput,
  setOverride, addFriLine, updateFriLine, addCommonLine, repriceKalkyl, priceChanges, runKontroller, sendCheck, kontrollFix,
  overrideFromForm, sameAmount, localDraftKey, stripLocalMeta, isLocalDraftExpired, localDraftKeysToRemove, offerMetaFromRow,
  shouldClearPdf, kalkylInsertDefaults, canApprovePrices, priceDiffers,
  type KalkylData, type GolvInput,
} from '@/lib/kalkyl';
import { DEFAULT_OFFER_TERMS } from '@/lib/offerTerms';
import { seedPriceItems } from './kalkylFixture';

const draftPrices = indexPrices(seedPriceItems());
/** Ekparketten har fått nytt pris 360 och allt i prislistan är godkänt. */
const approved360 = indexPrices(seedPriceItems(i => ({ status: 'godkand', ...(i.code === 'golv.mat.ekparkett-3stav' ? { price_ex_vat: 360 } : {}) })));
const allApproved = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
const GOLV: Partial<GolvInput> = { underlag: true, sockel: true, troskel: false, rivning: false, flytspackling: false, mobelflytt: false, bortforsling: false };
const TODAY = '2026-11-12';

/** Kalkylen räknad på utkastpriset 343,20 för ekparketten. */
function build() {
  let d: KalkylData = emptyKalkyl();
  const room = newRoom('Vardagsrum', { length: 6.0, width: 4.1, height: 2.5, doors: 2, windows: 2 });
  d = addRoom(d, room);
  const g = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  d = addRow(d, g, draftPrices, S);
  d = updateRowInput(d, g.id, GOLV, draftPrices, S);
  d = addCommonLine(d, draftPrices['gem.ovr.etablering']);
  d = { ...d, premises: { house_type: 'villa', build_year: 1968, floors: 1 } };
  return { d, g, room };
}
const ids = (list: { id: string; blocking: boolean }[]) => list.filter(k => k.blocking).map(k => k.id);

describe('pris_andrat: kalkylens pris stämmer inte längre med prislistan', () => {
  it('(a) utkastpris 343,20 som sedan blivit 360 och godkänt stoppas', () => {
    const { d, g } = build();
    const material = d.rows[0].lines.find(l => l.key === 'golv.material')!;
    expect(material.unit_price).toBe(343.2);
    const list = runKontroller(d, approved360, S, TODAY, { status: 'draft' });
    expect(ids(list)).toEqual([`pris_andrat:${g.id}`]);
    const k = list.find(x => x.id === `pris_andrat:${g.id}`)!;
    expect(k).toMatchObject({ title: 'Priset har ändrats', source: 'Prislistan', level: 'atgard', row_id: g.id });
    expect(k.text).toBe('Golv: Ekparkett 3-stav har ett annat pris i prislistan än i kalkylen. Uppdatera priserna innan offerten skickas.');
    const c = sendCheck(d, approved360, S, TODAY, { status: 'draft' });
    expect(c.can_send).toBe(false);
    expect(c.messages).toEqual(['1 pris har ändrats i prislistan sedan kalkylen räknades']);
    // Saknad status räknas som utkast.
    expect(sendCheck(d, approved360, S, TODAY).can_send).toBe(false);
  });

  it('(b) efter repriceKalkyl släpps offerten igenom när priset är godkänt', () => {
    const { d } = build();
    const next = repriceKalkyl(d, approved360, S, '2026-11-12T10:00:00.000Z');
    expect(next.rows[0].lines.find(l => l.key === 'golv.material')!.unit_price).toBe(360);
    expect(sendCheck(next, approved360, S, TODAY, { status: 'draft' }).can_send).toBe(true);
    expect(priceChanges(next, approved360)).toEqual([]);
  });

  it('(c) eget à-pris stoppas inte, men ändrad mängd räcker inte', () => {
    const { d, g } = build();
    const own = setOverride(d, g.id, 'golv.material', { unit_price: 343.2 });
    expect(runKontroller(own, approved360, S, TODAY, { status: 'draft' }).some(k => k.id.startsWith('pris_andrat'))).toBe(false);
    expect(sendCheck(own, approved360, S, TODAY, { status: 'draft' }).can_send).toBe(true);
    const qtyOnly = setOverride(d, g.id, 'golv.material', { qty: 30 });
    expect(ids(runKontroller(qtyOnly, approved360, S, TODAY, { status: 'draft' }))).toEqual([`pris_andrat:${g.id}`]);
  });

  it('(d) skickad offert stoppas inte av kontrollen', () => {
    const { d } = build();
    expect(runKontroller(d, approved360, S, TODAY, { status: 'sent' }).some(k => k.id.startsWith('pris_andrat'))).toBe(false);
    expect(sendCheck(d, approved360, S, TODAY, { status: 'sent' }).can_send).toBe(true);
    expect(runKontroller(d, approved360, S, TODAY, { status: 'accepted' }).some(k => k.id.startsWith('pris_andrat'))).toBe(false);
  });

  it('(e) egen rad med kod i en golvrad räknas om av repriceKalkyl', () => {
    let { d, g } = build();
    d = addFriLine(d, g.id, draftPrices['gem.ovr.mobelflytt']);
    const key = d.rows[0].lines.find(l => l.key.startsWith('egen.'))!.key;
    const changed = indexPrices(seedPriceItems(i => ({ status: 'godkand', ...(i.code === 'gem.ovr.mobelflytt' ? { price_ex_vat: 1500 } : {}) })));
    expect(ids(runKontroller(d, changed, S, TODAY))).toEqual([`pris_andrat:${g.id}`]);
    const next = repriceKalkyl(d, changed, S, '2026-11-12T10:00:00.000Z');
    const own = next.rows[0].lines.find(l => l.key === key)!;
    expect(own.unit_price).toBe(1500);
    expect(own.amount).toBe(1500);
    expect(sendCheck(next, changed, S, TODAY).can_send).toBe(true);
  });

  it('gemensamma rader och manuella fria rader', () => {
    let { d } = build();
    const etab = indexPrices(seedPriceItems(i => ({ status: 'godkand', ...(i.code === 'gem.ovr.etablering' ? { price_ex_vat: 3000 } : {}) })));
    expect(ids(runKontroller(d, etab, S, TODAY))).toEqual(['pris_andrat:gemensamt']);
    const fri = newFriRow(null, 'Badrum');
    d = addRow(d, fri, allApproved, S);
    d = addFriLine(d, fri.id, allApproved['gem.ovr.mobelflytt']);
    const key = d.rows[1].lines[0].key;
    d = updateFriLine(d, fri.id, key, { unit_price: 999 }, allApproved);
    const moved = indexPrices(seedPriceItems(i => ({ status: 'godkand', ...(i.code === 'gem.ovr.mobelflytt' ? { price_ex_vat: 1500 } : {}) })));
    expect(runKontroller(d, moved, S, TODAY).some(k => k.id === `pris_andrat:${fri.id}`)).toBe(false);
  });

  it('kontrollFix ger "Uppdatera priser" som omräkning', () => {
    expect(kontrollFix({ id: 'pris_andrat:gemensamt' })).toEqual({ label: 'Uppdatera priser', reprice: true });
  });

  it('jämförelsen är avrundad och null-säker', () => {
    expect(priceDiffers({ unit_price: 343.2 }, { price_ex_vat: 343.204 })).toBe(false);
    expect(priceDiffers({ unit_price: null }, { price_ex_vat: null })).toBe(false);
    expect(priceDiffers({ unit_price: null }, { price_ex_vat: 10 })).toBe(true);
    expect(priceDiffers({ unit_price: 10 }, undefined)).toBe(false);
  });
});

describe('ändrat à-pris låser inte mängden', () => {
  it('mängd med fler decimaler räknas som oförändrad', () => {
    expect(overrideFromForm({ qty: 24.6049, unit_price: 343.2 }, 24.6, 300)).toEqual({ unit_price: 300 });
    expect(overrideFromForm({ qty: 24.6, unit_price: 343.2 }, 24.6, 343.2)).toBeNull();
    expect(overrideFromForm({ qty: 24.6, unit_price: 343.2 }, 25, 343.2)).toEqual({ qty: 25 });
    expect(overrideFromForm({ qty: 2, unit_price: 343.204 }, 2, 343.2)).toBeNull();
    expect(sameAmount(1, 1.006)).toBe(false);
    expect(sameAmount(1, 1.004)).toBe(true);
    expect(sameAmount(null, null)).toBe(true);
  });
});

describe('fria rader från prislistan: kostnad och timmar', () => {
  it('mängd 0 → 5 räknar kostnad och timmar från prisraden', () => {
    const p = indexPrices(seedPriceItems(i => (i.code === 'gem.ovr.mobelflytt' ? { cost_ex_vat: 700, hours_per_unit: 2 } : {})));
    let d = emptyKalkyl();
    const fri = newFriRow(null, 'Flytt');
    d = addRow(d, fri, p, S);
    d = addFriLine(d, fri.id, p['gem.ovr.mobelflytt']);
    const key = d.rows[0].lines[0].key;
    d = updateFriLine(d, fri.id, key, { qty: 0 }, p);
    expect(d.rows[0].lines[0]).toMatchObject({ qty: 0, cost: 0, hours: 0 });
    d = updateFriLine(d, fri.id, key, { qty: 5 }, p);
    expect(d.rows[0].lines[0]).toMatchObject({ qty: 5, amount: 6000, cost: 3500, hours: 10 });
    // Reserv utan prisraden: skalning går inte från 0, så kostnaden blir okänd i stället för 0.
    const zero = updateFriLine(d, fri.id, key, { qty: 0 }, p);
    expect(updateFriLine(zero, fri.id, key, { qty: 5 }).rows[0].lines[0].cost).toBeNull();
    // Reserv med mängd > 0 skalar både kostnad och timmar.
    expect(updateFriLine(d, fri.id, key, { qty: 10 }).rows[0].lines[0]).toMatchObject({ cost: 7000, hours: 20 });
  });
});

describe('lokalt sparad kalkyl', () => {
  it('nyckeln innehåller användaren och personnummer sparas aldrig', () => {
    expect(localDraftKey('Daniel Malke', 'abc')).toBe('n3prenad-kalkyl:Daniel%20Malke:abc');
    expect(localDraftKey('Mirna', null)).toBe('n3prenad-kalkyl:Mirna:ny');
    const meta = { ...offerMetaFromRow(null), customer_personnummer: '19800101-1234' };
    const stripped = stripLocalMeta({ saved_at: '2026-11-12T10:00:00Z', data: emptyKalkyl(), meta });
    expect(stripped.meta.customer_personnummer).toBe('');
    expect(meta.customer_personnummer).toBe('19800101-1234');
  });

  it('versioner äldre än 14 dagar och gamla nycklar utan användare tas bort', () => {
    const now = '2026-11-12T12:00:00Z';
    expect(isLocalDraftExpired('2026-10-29T12:00:00Z', now)).toBe(false);
    expect(isLocalDraftExpired('2026-10-29T11:59:00Z', now)).toBe(true);
    expect(isLocalDraftExpired(null, now)).toBe(true);
    const fresh = JSON.stringify({ saved_at: '2026-11-11T12:00:00Z' });
    const old = JSON.stringify({ saved_at: '2026-10-01T12:00:00Z' });
    expect(localDraftKeysToRemove([
      ['n3prenad-kalkyl:Mirna:abc', fresh],
      ['n3prenad-kalkyl:Mirna:ny', old],
      ['n3prenad-kalkyl:abc', fresh],
      ['n3prenad-kalkyl:Mirna:trasig', '{'],
      ['annat', old],
    ], now)).toEqual(['n3prenad-kalkyl:Mirna:ny', 'n3prenad-kalkyl:abc', 'n3prenad-kalkyl:Mirna:trasig']);
  });
});

describe('sparning, villkor och godkännande', () => {
  it('pdf_path nollas bara för befintlig offert med ändringar', () => {
    expect(shouldClearPdf('offer-1', true)).toBe(true);
    expect(shouldClearPdf('offer-1', false)).toBe(false);
    expect(shouldClearPdf(null, true)).toBe(false);
  });

  it('ny kalkyloffert får standardvillkoren', () => {
    expect(kalkylInsertDefaults('Daniel')).toEqual({ status: 'draft', created_by: 'Daniel', source: 'kalkyl', terms_text: DEFAULT_OFFER_TERMS });
  });

  it('bara administratör godkänner priser', () => {
    expect(canApprovePrices({ isAdmin: true })).toBe(true);
    expect(canApprovePrices({ isAdmin: false })).toBe(false);
    expect(canApprovePrices(null)).toBe(false);
  });

  it('femårsregeln: bara återställande arbete ger ROT i hus yngre än fem år', () => {
    const { d } = build();
    const k = runKontroller({ ...d, premises: { ...d.premises, build_year: 2023 } }, allApproved, S, TODAY).find(x => x.id === 'rot_femarsregeln')!;
    expect(k.text).toBe('Huset är byggt 2023. I hus som är yngre än fem år ger bara återställande arbete (reparation) ROT, inte förbättringar eller om- och tillbyggnad. Kontrollera innan ROT dras.');
    expect(k.source).toBe('Skatteverket (ROT)');
  });
});
