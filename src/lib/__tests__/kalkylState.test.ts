import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, updateRoom, newGolvRow, newMalningRow, newFriRow,
  addRow, updateRowInput, setOverride, duplicateRow, moveRow, removeRow, addFriLine, updateFriLine, removeFriLine,
  addCommonLine, removeCommonLine, addAdjustment, removeAdjustment, toggleFavorite, repriceKalkyl, priceChanges, rowLines,
  buildOfferPayloadFromKalkyl, offerScopeText, defaultOfferTitle, rowSpecText, rowQuantityLabel, fitRoom, unfoldWalls,
  elevationLayout, golvOptions, sendCheck, rowFigures, isLocalNewer, displayAmount, shares, floorArea,
  type KalkylData, type GolvInput, type MalningInput,
} from '@/lib/kalkyl';
import { calcOfferTotals } from '@/lib/offerCalc';
import { seedPriceItems } from './kalkylFixture';

const prices = indexPrices(seedPriceItems());
const GOLV: Partial<GolvInput> = { underlag: true, sockel: true, troskel: true, rivning: true, flytspackling: false, mobelflytt: false, bortforsling: true };
const MALNING: Partial<MalningInput> = { underarbete: 'normal', tak: true, snickerier: false, kulor_vagg: null, kulor_tak: null, kulor_snickerier: null };

/** Rummet 6,0 × 4,1 från etapp 1 med golv, målning och etablering. */
function build() {
  let d: KalkylData = emptyKalkyl();
  const room = newRoom('Vardagsrum', { length: 6.0, width: 4.1, height: 2.5, doors: 2, windows: 2 });
  d = addRoom(d, room);
  const g = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  d = addRow(d, g, prices, S);
  d = updateRowInput(d, g.id, GOLV, prices, S);
  const m = newMalningRow(room.id);
  d = addRow(d, m, prices, S);
  d = updateRowInput(d, m.id, MALNING, prices, S);
  d = addCommonLine(d, prices['gem.ovr.etablering']);
  d = { ...d, premises: { house_type: 'villa', build_year: 1968, floors: 1 } };
  return { d, room, g, m };
}

const line = (d: KalkylData, rowId: string, key: string) => rowLines(d.rows.find(r => r.id === rowId)!).find(l => l.key === key)!;

describe('state', () => {
  it('rummet 6,0 × 4,1 ger golvraden 24,6 m²', () => {
    const { d, g } = build();
    expect(line(d, g.id, 'golv.laggning').qty).toBe(24.6);
  });

  it('updateRoom till 5,0 × 4,0 räknar om golv- och målningsraden', () => {
    const { d, room, g, m } = build();
    const before = line(d, m.id, 'malning.vagg').qty;
    const next = updateRoom(d, room.id, { dims: { length: 5.0, width: 4.0 } }, prices, S);
    expect(line(next, g.id, 'golv.laggning').qty).toBe(20);
    expect(line(next, g.id, 'golv.rivning').qty).toBe(20);
    expect(before).toBe(43.6);
    expect(line(next, m.id, 'malning.vagg').qty).toBe(38.1);
    expect(line(next, m.id, 'malning.tak').qty).toBe(20);
    expect(d.rooms[0].dims.length).toBe(6); // oföränderlig
  });

  it('duplicateRow ger nytt id direkt efter originalet', () => {
    const { d, g } = build();
    const next = duplicateRow(d, g.id);
    expect(next.rows).toHaveLength(3);
    expect(next.rows[1].id).not.toBe(g.id);
    expect(next.rows[1].lines).toEqual(next.rows[0].lines);
  });

  it('moveRow byter plats och stannar vid kanten', () => {
    const { d, g, m } = build();
    const next = moveRow(d, m.id, 'up');
    expect(next.rows.map(r => r.id)).toEqual([m.id, g.id]);
    expect(moveRow(next, m.id, 'up')).toBe(next);
    expect(removeRow(next, m.id).rows.map(r => r.id)).toEqual([g.id]);
  });

  it('setOverride qty ger manual och nytt belopp, null återställer', () => {
    const { d, g } = build();
    const next = setOverride(d, g.id, 'golv.rivning', { qty: 30 });
    const l = line(next, g.id, 'golv.rivning');
    expect(l.manual).toBe(true);
    expect(l.qty).toBe(30);
    expect(l.amount).toBe(2280);
    const reset = setOverride(next, g.id, 'golv.rivning', null);
    expect(line(reset, g.id, 'golv.rivning').amount).toBe(1869.6);
    expect(reset.rows[0].overrides).toBeUndefined();
  });

  it('fria rader: lägg till, ändra och ta bort', () => {
    let { d } = build();
    const fri = newFriRow(null, 'Badrum');
    d = addRow(d, fri, prices, S);
    d = addFriLine(d, fri.id, { description: 'Kakelsättning', qty: 8, unit: 'm²', unit_price: 950, rot_class: 'arbete' });
    d = addFriLine(d, fri.id, prices['gem.ovr.mobelflytt']);
    const row = () => d.rows.find(r => r.id === fri.id)!;
    expect(row().lines.map(l => l.amount)).toEqual([7600, 1200]);
    expect(row().lines[1].code).toBe('gem.ovr.mobelflytt');
    d = updateFriLine(d, fri.id, row().lines[0].key, { qty: 10 });
    expect(row().lines[0].amount).toBe(9500);
    d = updateFriLine(d, fri.id, row().lines[0].key, { unit_price: null });
    expect(row().lines[0].amount).toBe(0);
    d = removeFriLine(d, fri.id, row().lines[0].key);
    expect(row().lines).toHaveLength(1);
  });

  it('gemensamma rader, justeringar och favoriter', () => {
    let { d } = build();
    d = addCommonLine(d, { description: 'Parkering', qty: 1, unit: 'fast', unit_price: 300, rot_class: 'ovrigt' });
    expect(d.common).toHaveLength(2);
    d = removeCommonLine(d, d.common[1].key);
    expect(d.common).toHaveLength(1);
    d = addAdjustment(d, { label: 'Rabatt', amount: -500, rot_class: 'arbete' });
    expect(d.adjustments[0].amount).toBe(-500);
    d = removeAdjustment(d, d.adjustments[0].id);
    expect(d.adjustments).toHaveLength(0);
    d = toggleFavorite(d, 'golv.mat.fiskben-ek');
    expect(d.favorites).toEqual(['golv.mat.fiskben-ek']);
    expect(toggleFavorite(d, 'golv.mat.fiskben-ek').favorites).toEqual([]);
  });

  it('priceChanges hittar ändrat pris, repriceKalkyl uppdaterar och sätter priced_at', () => {
    const { d, g } = build();
    expect(priceChanges(d, prices)).toEqual([]);
    const changed = indexPrices(seedPriceItems(i => (i.code === 'golv.mat.ekparkett-3stav' ? { price_ex_vat: 359.9 } : {})));
    expect(priceChanges(d, changed)).toEqual([{ code: 'golv.mat.ekparkett-3stav', name: 'Ekparkett 3-stav', old: 343.2, new: 359.9 }]);
    const next = repriceKalkyl(d, changed, S, '2026-11-12T10:00:00.000Z');
    expect(next.priced_at).toBe('2026-11-12T10:00:00.000Z');
    expect(line(next, g.id, 'golv.material').unit_price).toBe(359.9);
    expect(priceChanges(next, changed)).toEqual([]);
  });
});

describe('offer', () => {
  it('buildOfferPayloadFromKalkyl ger samma tal som etapp 1 (35 984,46 ex moms)', () => {
    const { d } = build();
    const p = buildOfferPayloadFromKalkyl(d, { vat_mode: 'vanlig', rot_enabled: false, rot_percent: 30 });
    expect(p.line_items).toHaveLength(6);
    expect(p.total_ex_vat).toBeCloseTo(35984.46, 2);
    expect(p.calc_version).toBe(1);
    expect(p.calc_data).toBe(d);
    const t = calcOfferTotals(p.line_items, { vat_mode: 'vanlig', rot_enabled: false, rot_percent: 30 });
    expect(p.total_incl_vat).toBe(t.total_incl_vat);
  });

  it('ROT går genom calcOfferTotals med tak', () => {
    const { d } = build();
    const p = buildOfferPayloadFromKalkyl(d, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 1, rot_cap_per_person: 50000, rot_used: 0 });
    expect(p.rot_base).toBeCloseTo(17884 * 1.25, 2);
    expect(p.rot_amount).toBe(Math.round(17884 * 1.25 * 0.3));
  });

  it('offerScopeText enligt exemplet', () => {
    const { d } = build();
    expect(offerScopeText(d, prices, S).split('\n')[0]).toBe(
      'Vardagsrum – Golv: Ekparkett 3-stav 14 mm, mattlack, 24,6 m². Rivning befintligt golv, underlag med ångspärr, sockellist vit 12×56 (NCS S 0502-Y), trösklar ek, bortforsling.',
    );
    expect(offerScopeText(d, prices, S)).toContain('Gemensamt: Etablering och resor.');
  });

  it('defaultOfferTitle: "Golv och målning, Vardagsrum och Hall"', () => {
    let { d } = build();
    const hall = newRoom('Hall', { length: 3, width: 2, height: 2.4, doors: 3, windows: 0 });
    d = addRoom(d, hall);
    d = addRow(d, newMalningRow(hall.id), prices, S);
    expect(defaultOfferTitle(d)).toBe('Golv och målning, Vardagsrum och Hall');
    expect(defaultOfferTitle(emptyKalkyl())).toBe('Offert');
  });

  it('rowSpecText och rowQuantityLabel', () => {
    const { d, g, m, room } = build();
    expect(rowSpecText(d.rows[0], prices)).toBe('Ekparkett 3-stav, 14 mm, mattlack · längs · underlag med ångspärr · sockellist vit 12×56 (NCS S 0502-Y) · trösklar ek · rivning · bortforsling');
    expect(rowQuantityLabel(d.rows.find(r => r.id === g.id)!, room, S)).toBe('24,6 m²');
    expect(rowQuantityLabel(d.rows.find(r => r.id === m.id)!, room, S)).toBe('43,6 + 24,6 m²');
  });
});

describe('vyn', () => {
  it('golvOptions visar pris även för avstängda tillval', () => {
    const { d, g, room } = build();
    const opts = golvOptions(d.rows.find(r => r.id === g.id)!, room, prices, S);
    const flyt = opts.find(o => o.flag === 'flytspackling')!;
    expect(flyt.enabled).toBe(false);
    expect(flyt.amount).toBe(4821.6); // (78,4 + 117,6) × 24,6
    const underlag = opts.find(o => o.flag === 'underlag')!;
    expect(underlag.detail).toBe('2 rullar (30 m²) · material');
    expect(opts.find(o => o.flag === 'bortforsling')!.detail).toBe('Fast pris · övrigt, inget ROT');
  });

  it('rowFigures räknar golvraden via offertvägen', () => {
    const { d, g } = build();
    const f = rowFigures(d, g.id, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30 })!;
    expect(f.summary.total_ex_vat).toBeCloseTo(21950.06, 2);
    expect(f.per_m2).toBeCloseTo(21950.06 / 24.6, 2);
    expect(f.shares.material + f.shares.arbete + f.shares.ovrigt).toBeCloseTo(100, 1);
  });

  it('sendCheck sammanfattar det som stoppar', () => {
    const { d } = build();
    const c = sendCheck(d, prices, S, '2026-11-12');
    expect(c.can_send).toBe(false);
    expect(c.messages[0]).toMatch(/^\d+ priser är inte godkända i prislistan$/);
    const ok = indexPrices(seedPriceItems(() => ({ status: 'godkand' })));
    expect(sendCheck(d, ok, S, '2026-11-12').can_send).toBe(true);
    expect(sendCheck(null, prices, S, '2026-11-12').can_send).toBe(true);
  });

  it('visning och lokala versioner', () => {
    expect(displayAmount(100, 'inkl')).toBe(125);
    expect(displayAmount(100, 'exkl')).toBe(100);
    expect(shares({ material: 0, arbete: 0, ovrigt: 0 })).toEqual({ material: 0, arbete: 0, ovrigt: 0 });
    expect(isLocalNewer('2026-11-12T14:32:00Z', '2026-11-12T14:00:00Z')).toBe(true);
    expect(isLocalNewer('2026-11-12T13:00:00Z', '2026-11-12T14:00:00Z')).toBe(false);
    expect(isLocalNewer(null, null)).toBe(false);
  });
});

describe('plan', () => {
  it('fitRoom skalar 6,0 × 4,1 in i 300 × 200 och placerar dörrar', () => {
    const f = fitRoom({ length: 6, width: 4.1, height: 2.5, doors: 2, windows: 2 }, 300, 260, S);
    expect(f.scale).toBe(50);
    expect(f.w).toBe(300);
    expect(f.h).toBeCloseTo(205, 6);
    expect(f.doors).toHaveLength(2);
  });
  it('fitRoom begränsas av höjden när rummet är djupt', () => {
    const f = fitRoom({ length: 4, width: 4, height: 2.4, doors: 2, windows: 0 }, 300, 200, S);
    expect(f.scale).toBe(50);
    expect([f.w, f.h]).toEqual([200, 200]);
    expect(f.doors.map(d => d.wall)).toEqual(['bottom', 'right']);
    expect(f.doors[0].width).toBe(45);
    expect(f.doors[0].offset).toBe(50);
  });
  it('tomma mått ger ingen ritning', () => {
    expect(fitRoom({ length: 0, width: 4, height: 2.4, doors: 0, windows: 0 }, 300, 200).w).toBe(0);
  });
  it('unfoldWalls och elevationLayout', () => {
    const walls = unfoldWalls({ length: 6, width: 4, height: 2.5, doors: 2, windows: 2 }, 212, 4);
    expect(walls.map(w => w.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(walls[0].w).toBe(60);
    expect(walls[1].w).toBe(40);
    const e = elevationLayout({ length: 6, width: 4, height: 2.5, doors: 2, windows: 2 }, S, 600, 300);
    expect(e.scale).toBe(100);
    expect(e.door).not.toBeNull();
    expect(e.windows).toHaveLength(2);
    expect(floorArea({ length: 6, width: 4, height: 2.5, doors: 0, windows: 0 })).toBe(24);
  });
});

import { offerMetaFromRow, kalkylFromRow, offerOptions, kalkylSaveFields, offerEditMode, validateMeta } from '@/lib/kalkyl';

describe('offertuppgifter', () => {
  it('ny offert: ROT på, 30 dagars giltighet, namn krävs', () => {
    const m = offerMetaFromRow(null, new Date('2026-11-12T10:00:00Z'));
    expect(m.rot_enabled).toBe(true);
    expect(m.valid_until).toBe('2026-12-12');
    expect(validateMeta(m)).toEqual(['namn_saknas']);
    expect(validateMeta({ ...m, customer_name: 'Anna' })).toEqual([]);
  });
  it('företag får aldrig ROT', () => {
    const m = { ...offerMetaFromRow(null), customer_type: 'foretag' as const };
    expect(offerOptions(m).rot_enabled).toBe(false);
  });
  it('spara fyller tom titel och beskrivning men skriver aldrig över', () => {
    const { d } = build();
    const m = { ...offerMetaFromRow(null), customer_name: 'Anna', rot_enabled: false };
    const f = kalkylSaveFields(m, d, prices, S);
    expect(f.title).toBe('Golv och målning, Vardagsrum');
    expect(f.description?.startsWith('Vardagsrum – Golv: Ekparkett 3-stav')).toBe(true);
    expect(f.total_ex_vat).toBeCloseTo(35984.46, 2);
    const own = kalkylSaveFields({ ...m, title: 'Min titel', description: 'Egen text' }, d, prices, S);
    expect([own.title, own.description]).toEqual(['Min titel', 'Egen text']);
  });
  it('status styr redigering och okänd kalkyl blir tom', () => {
    expect(offerEditMode('accepted')).toBe('readonly');
    expect(offerEditMode('sent')).toBe('sent');
    expect(offerEditMode('draft')).toBe('edit');
    expect(kalkylFromRow({ calc_data: { version: 2 } }).rows).toEqual([]);
  });
});

import { summaryView, kalkylTotals, summarizeKalkyl } from '@/lib/kalkyl';

describe('summaryView', () => {
  it('privat inkl. moms med ROT och handpenning från calcOfferTotals', () => {
    const { d } = build();
    const opts = { vat_mode: 'vanlig' as const, rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_cap_per_person: 50000, rot_used: 0, handpenning_percent: 25 };
    const t = kalkylTotals(d, opts);
    const v = summaryView(t, summarizeKalkyl(d), 'inkl', opts);
    expect(v.sum).toBeCloseTo(44980.58, 2);
    expect(v.rot).toBe(6707);
    expect(v.pay).toBeCloseTo(38273.58, 1);
    expect(v.payLabel).toBe('Att betala efter ROT');
    expect(v.handpenning).toBe(11245);
    expect(v.arbete).toBeCloseTo(17884 * 1.25, 2);
  });
  it('exklusive moms visar summan utan moms', () => {
    const { d } = build();
    const opts = { vat_mode: 'vanlig' as const, rot_enabled: false, rot_percent: 30 };
    const v = summaryView(kalkylTotals(d, opts), summarizeKalkyl(d), 'exkl', opts);
    expect(v.sum).toBeCloseTo(35984.46, 2);
    expect(v.sumLabel).toBe('Summa exkl. moms');
  });
});

import { malningOptions, kontrollFix } from '@/lib/kalkyl';

describe('egna rader och snabbåtgärder', () => {
  it('egen rad i golvraden följer med när rummet ändras', () => {
    let { d, g, room } = build();
    d = addFriLine(d, g.id, { description: 'Lister runt pelare', qty: 1, unit: 'st', unit_price: 450, rot_class: 'arbete' });
    const own = d.rows[0].lines.find(l => l.key.startsWith('egen.'))!;
    expect(own.amount).toBe(450);
    d = updateRoom(d, room.id, { dims: { length: 5 } }, prices, S);
    expect(d.rows[0].lines.some(l => l.key === own.key)).toBe(true);
    d = updateFriLine(d, g.id, own.key, { qty: 2 });
    expect(d.rows[0].lines.find(l => l.key === own.key)!.amount).toBe(900);
    d = removeFriLine(d, g.id, own.key);
    expect(d.rows[0].lines.some(l => l.key.startsWith('egen.'))).toBe(false);
    expect(removeFriLine(d, g.id, 'golv.material').rows[0].lines.length).toBe(d.rows[0].lines.length);
  });
  it('malningOptions visar priset för avstängda snickerier', () => {
    const { d, m, room } = build();
    const o = malningOptions(d.rows.find(r => r.id === m.id)!, room, prices, S);
    expect(o.tak.enabled).toBe(true);
    expect(o.snickerier.enabled).toBe(false);
    expect(o.snickerier.amount).toBe(2232.32); // 1 280 + 640,32 + 312
  });
  it('kontrollFix ger direkta åtgärder', () => {
    expect(kontrollFix({ id: 'golv_avjamning:g' })).toEqual({ label: 'Lägg till flytspackling', patch: { flytspackling: true } });
    expect(kontrollFix({ id: 'pris_saknas:g' })).toBeNull();
  });
});

import { insertRow } from '@/lib/kalkyl';
describe('ångra', () => {
  it('insertRow sätter tillbaka raden på samma plats', () => {
    const { d, g, m } = build();
    const removed = removeRow(d, g.id);
    expect(insertRow(removed, d.rows[0], 0).rows.map(r => r.id)).toEqual([g.id, m.id]);
  });
});
