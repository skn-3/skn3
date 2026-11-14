import { describe, it, expect } from 'vitest';
import { buildOfferDocDef, offerPdfCustomerView, offerPdfItemText, offerPdfSwatchColor, type OfferForPdf, type OfferPdfOptions } from '../offerPdf';
import { buildOfferDocDef as legacyDocDef } from './fixtures/offerPdfLegacy';
import { calcOfferTotals, fmtKr } from '../offerCalc';
import {
  DEFAULT_KALKYL_SETTINGS as S, indexPrices, emptyKalkyl, newRoom, addRoom, addRow, newGolvRow, newGrenRow, setGrenQty, addCommonLine, addAdjustment,
  setRowOptional, buildOfferPayloadFromKalkyl, buildCustomerView, sanitizeCustomerView, type PriceItem, type KalkylOfferOptions,
} from '@/lib/kalkyl';
import { withImageUrls as withImageUrlsForTest } from '../../../supabase/functions/_shared/customerView';
import { seedPriceItems } from './kalkylFixture';

const ASSETS = { logoWhite: null, sans: 'Roboto', display: 'Roboto' };
const SIGN: OfferPdfOptions = { signature: { name: 'Anna Kund', acceptedAt: '2026-11-12T10:00:00Z', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' } };

/** Hela dokumentdefinitionen som JSON. Funktioner (bakgrund, sidfot, tabellayout) ersätts av sin källkod i båda, och bakgrund/sidfot körs även. */
function serialize(doc: any): string {
  const fn = (_k: string, v: unknown) => (typeof v === 'function' ? `fn:${v.toString()}` : v);
  return JSON.stringify({ doc, bg1: doc.background(1), bg2: doc.background(2), foot: doc.footer(1, 3) }, fn);
}

const TERMS = '1. Omfattning\nArbetet utförs enligt offerten.\n\n2. Accept\nAccept via offertportalen likställs med skriftlig överenskommelse.';

/** Offerter utan kundvy, som dagens: enkel tabell, tabell med antal och à-pris, omvänd moms, ROT med tak, med och utan beskrivning och villkor. */
const LEGACY_OFFERS: OfferForPdf[] = [
  {
    id: 'o1', offer_number: '2026-0017', created_at: '2026-11-01T08:00:00Z', sent_at: '2026-11-02T08:00:00Z', valid_until: '2026-12-01', payment_terms: '10 dagar netto',
    customer_type: 'privat', customer_name: 'Anna Kund', customer_email: 'anna@example.se', customer_phone: '070-1', customer_address: 'Gatan 1, Segeltorp',
    customer_personnummer: '19800101-1234', fastighetsbeteckning: 'Segeltorp 1:2', title: 'Nytt golv', description: 'Vi lägger nytt golv.\n\n- Rivning\n- Läggning',
    line_items: [
      { id: '1', description: 'Läggning', is_labor: true, qty: 1, unit: 'st', unit_price: 21280, amount: 21280 },
      { id: '2', description: 'Material', is_labor: false, qty: 1, unit: 'st', unit_price: 9800, amount: 9800 },
    ],
    vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 1, rot_cap_per_person: 50000, rot_used: 0, handpenning_percent: 25,
    terms_text: TERMS, created_by: 'Johannes',
  },
  {
    offer_number: '2026-0018', created_at: '2026-11-01T08:00:00Z', customer_type: 'foretag', customer_name: 'BRF Eken', title: 'Målning',
    line_items: [
      { id: '1', description: 'Målning vägg', is_labor: true, qty: 120, unit: 'm²', unit_price: 95, amount: 11400 },
      { id: '2', description: 'Färg', is_labor: false, qty: 8, unit: 'l', unit_price: 310, amount: 2480 },
    ],
    vat_mode: 'omvand', rot_enabled: false, rot_percent: 30, handpenning_percent: 0,
  },
  {
    offer_number: null, customer_type: 'privat', customer_name: 'Bo', description: null,
    line_items: [{ id: '1', description: 'Stort arbete', is_labor: true, qty: 1, unit: 'st', unit_price: 900000, amount: 900000 }],
    vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_used: 12000, handpenning_percent: 25, terms_text: TERMS,
  },
];

describe('offert-PDF utan kundvy: identisk med före etapp 3d', () => {
  LEGACY_OFFERS.forEach((offer, i) => {
    it(`offert ${i + 1}, utan och med signatur`, () => {
      expect(serialize(buildOfferDocDef(offer, {}, ASSETS))).toBe(serialize(legacyDocDef(offer, {}, ASSETS)));
      expect(serialize(buildOfferDocDef(offer, SIGN, ASSETS))).toBe(serialize(legacyDocDef(offer, SIGN, ASSETS)));
    });
  });

  it('ogiltig kundvy eller okänd version ger dagens dokument', () => {
    const offer = LEGACY_OFFERS[0];
    for (const bad of [null, 'x', [], { version: 2, intro: null, sections: [], common: [], totals: { arbete_ex_vat: 0, material_ex_vat: 0, ovrigt_ex_vat: 0 } },
      { version: 1, sections: 'x', totals: {} }, { version: 1, sections: [{ id: 1 }], common: [], totals: { arbete_ex_vat: 0, material_ex_vat: 0, ovrigt_ex_vat: 0 } }]) {
      expect(offerPdfCustomerView(bad)).toBeNull();
      expect(serialize(buildOfferDocDef({ ...offer, customer_view: bad }, SIGN, ASSETS))).toBe(serialize(legacyDocDef(offer, SIGN, ASSETS)));
    }
  });
});

// ── Offert från kalkylen ────────────────────────────────────────────────────
const T = '2026-11-12';
const mk = (p: Partial<PriceItem> & Pick<PriceItem, 'code' | 'trade' | 'kind' | 'name' | 'unit'>): PriceItem => ({
  id: p.code, rot_class: p.kind === 'arbete' ? 'arbete' : p.kind === 'ovrigt' ? 'ovrigt' : 'material', slot: null, spec: null, price_ex_vat: 100, cost_ex_vat: 40,
  hours_per_unit: 0.5, level: null, pack_size: null, pack_label: null, waste_pct: 0, coverage: null, color_system: null, color_code: null, color_hex: null,
  swatch: null, image_path: null, article_no: null, supplier: null, source: null, price_date: T, status: 'godkand', approved_by: 'A', approved_at: T, meta: {},
  sort_order: 100, updated_by: 'A', ...p,
});
const BYGG = mk({ code: 'altan.arb.bygg', trade: 'altan', kind: 'arbete', name: 'Bygga altan', unit: 'm²', price_ex_vat: 900 });
const TRALL = mk({ code: 'altan.mat.trall', trade: 'altan', kind: 'material', name: 'Trall', spec: '28×120', unit: 'm²', price_ex_vat: 320.4, image_path: 'altan/trall.jpg', swatch: { color: '#A07850' } });
const ETABL = mk({ code: 'gem.ovr.etablering', trade: 'gemensamt', kind: 'ovrigt', name: 'Etablering', unit: 'st', price_ex_vat: 2500 });
const P = indexPrices([...seedPriceItems(() => ({ status: 'godkand', cost_ex_vat: 50 })), BYGG, TRALL, ETABL]);
const KOPTS: KalkylOfferOptions = { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, rot_persons: 2, rot_used: 0, handpenning_percent: 25 };

function kalkylOffer(withOption: boolean): { offer: OfferForPdf; altanId: string } {
  let d = emptyKalkyl();
  const room = newRoom('Vardagsrum', { length: 5, width: 4.2, height: 2.5, doors: 2, windows: 1 });
  d = addRoom(d, room);
  const golv = newGolvRow(room.id, 'golv.mat.ekparkett-3stav');
  golv.input = { ...(golv.input as object), sockel: true } as typeof golv.input;
  d = addRow(d, golv, P, S);
  const altan = newGrenRow(null, 'altan', 'Altan på baksidan');
  d = addRow(d, altan, P, S);
  d = setGrenQty(d, altan.id, BYGG, 18, P);
  d = setGrenQty(d, altan.id, TRALL, 17.3, P);
  d = addCommonLine(d, ETABL);
  d = addAdjustment(d, { label: 'Rabatt', amount: -1000, rot_class: 'arbete' });
  if (withOption) d = setRowOptional(d, altan.id, true);
  const payload = buildOfferPayloadFromKalkyl(d, KOPTS);
  const view = buildCustomerView(d, P, S, 'Vi lägger nytt golv i vardagsrummet.');
  return {
    altanId: altan.id,
    offer: {
      id: 'o9', offer_number: '2026-0101', created_at: '2026-11-12T08:00:00Z', customer_type: 'privat', customer_name: 'Anna Kund', title: 'Golv och altan',
      description: 'Automatisk beskrivning som inte ska synas', line_items: payload.line_items, vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30,
      rot_persons: 2, rot_used: 0, handpenning_percent: 25, terms_text: TERMS, customer_view: JSON.parse(JSON.stringify(view)),
    },
  };
}

/** Summablocket (summor, totalruta, betalplan, ROT-text): det andra unbreakable-blocket efter "Pris". */
const sumBlock = (doc: any) => {
  const i = doc.content.findIndex((c: any) => c.unbreakable && JSON.stringify(c).includes('"PRIS"'));
  return JSON.stringify(doc.content.slice(i + 1), (_k, v) => (typeof v === 'function' ? `fn:${v.toString()}` : v));
};

describe('offert-PDF med kundvy', () => {
  const { offer } = kalkylOffer(false);
  const view = offerPdfCustomerView(offer.customer_view)!;
  const doc = buildOfferDocDef(offer, {}, ASSETS);
  const json = JSON.stringify(doc.content);

  it('"Det här ingår" med intro, rubriker, texter, uppgifter, val och belopp ersätter Omfattning', () => {
    expect(json).toContain('"DET HÄR INGÅR"');
    expect(json).not.toContain('"OMFATTNING"');
    expect(json).not.toContain('Automatisk beskrivning som inte ska synas');
    expect(json).toContain('Vi lägger nytt golv i vardagsrummet.');
    for (const s of view.sections) {
      expect(json).toContain(JSON.stringify(s.room ? `${s.room} · ${s.title}` : s.title));
      expect(json).toContain(JSON.stringify(s.text));
      expect(json).toContain(JSON.stringify(fmtKr(s.amount_ex_vat * 1.25)));
    }
    expect(json).toContain('"Vardagsrum · Golv"');
    expect(json).toContain('21 m²');
    expect(json).toContain('"Sockel: "');
    expect(json).toMatch(/NCS S 0502-Y/);
    expect(json).toContain('"Etablering"');
    expect(json).toContain('"Rabatt"');
    expect(json).not.toContain('altan/trall.jpg');
    expect(json).not.toContain('"image"');
    // Varje avsnitt är ett block som inte delas över två sidor.
    const blocks: any[] = [];
    const walk = (n: any) => { if (!n || typeof n !== 'object') return; if (n.unbreakable && n.stack?.[0]?.columns?.[0]?.text) blocks.push(n); Object.values(n).forEach(walk); };
    walk(doc.content);
    expect(blocks.filter(b => b.stack[0].columns[0].text === 'Vardagsrum · Golv')).toHaveLength(1);
    // Rubriken "Det här ingår" hålls ihop med första blocket.
    const first = doc.content.find((c: any) => c.unbreakable && JSON.stringify(c.stack?.[0] ?? '').includes('DET HÄR INGÅR'));
    expect(first.stack.at(-1).stack[0].columns[0].text).toBe(blocks[0].stack[0].columns[0].text);
  });

  it('gemensamma rader och justeringar hålls ihop med sista avsnittet i ett block', () => {
    const titleOf = (n: any) => n?.stack?.[0]?.columns?.[0]?.text;
    const holder = doc.content.find((c: any) => c.unbreakable && JSON.stringify(c).includes('"Etablering"'));
    expect(holder).toBeTruthy();
    expect(JSON.stringify(holder)).toContain('"Rabatt"');
    const last = view.sections.at(-1)!;
    expect(holder.stack.some((n: any) => titleOf(n) === (last.room ? `${last.room} · ${last.title}` : last.title))).toBe(true);
    // Sista avsnittet finns bara en gång, och inget gemensamt står utanför blocket.
    expect(doc.content.filter((c: any) => JSON.stringify(c).includes('"Etablering"'))).toHaveLength(1);
  });

  it('ett enda avsnitt: rubriken, avsnittet och de gemensamma raderna i samma block', () => {
    const one = { ...(offer.customer_view as any), sections: [(offer.customer_view as any).sections[0]] };
    const d = buildOfferDocDef({ ...offer, customer_view: one }, {}, ASSETS);
    const holder = d.content.find((c: any) => c.unbreakable && JSON.stringify(c).includes('"Etablering"'));
    const js = JSON.stringify(holder);
    expect(js).toContain('DET HÄR INGÅR');
    expect(js).toContain(JSON.stringify(one.sections[0].room ? `${one.sections[0].room} · ${one.sections[0].title}` : one.sections[0].title));
    expect(js).toContain('"Rabatt"');
  });

  it('inga avsnitt: rubriken och de gemensamma raderna i samma block', () => {
    const none = { ...(offer.customer_view as any), sections: [] };
    const d = buildOfferDocDef({ ...offer, customer_view: none }, {}, ASSETS);
    const holder = d.content.find((c: any) => c.unbreakable && JSON.stringify(c).includes('"Etablering"'));
    expect(JSON.stringify(holder)).toContain('DET HÄR INGÅR');
  });

  it('avsnitt + gemensamt gånger 1,25 = ordersumman före avrundning till hela kronor', () => {
    const totals = calcOfferTotals(offer.line_items, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, handpenning_percent: 25, rot_persons: 2, rot_used: 0 });
    const sum = [...view.sections, ...view.common].reduce((s, x) => s + x.amount_ex_vat, 0) * 1.25;
    expect(sum).toBeCloseTo(totals.total_incl_vat, 6);
    expect(Math.round(sum)).toBe(Math.round(totals.total_incl_vat));
  });

  it('Pris: Arbete, Material, Övrigt med ROT-raden under Arbete; inga offertrader', () => {
    expect(json).toContain('"PRIS"');
    expect(json).toContain('"Arbete"');
    expect(json).toContain('"Material"');
    expect(json).toContain('"Övrigt"');
    expect(json).toContain('ROT-berättigat arbete redovisas nedan');
    expect(json).toContain('"SUMMA INKL. MOMS"');
    expect(json).toContain(JSON.stringify(fmtKr(view.totals.arbete_ex_vat * 1.25)));
    // Radernas offertrader visas inte; gemensamma rader och rabatt finns kvar som egna rader.
    const rowItems = offer.line_items.filter(li => !li.id.startsWith('common:') && !li.id.startsWith('adj:'));
    expect(rowItems.length).toBeGreaterThan(0);
    for (const li of rowItems) expect(json).not.toContain(JSON.stringify(li.description));
  });

  it('summor, totalruta, betalplan, villkor och signeringsverifikat är desamma som utan kundvy', () => {
    const without = buildOfferDocDef({ ...offer, customer_view: null }, {}, ASSETS);
    expect(sumBlock(doc)).toBe(sumBlock(without));
    const signed = buildOfferDocDef(offer, SIGN, ASSETS);
    const signedWithout = buildOfferDocDef({ ...offer, customer_view: null }, SIGN, ASSETS);
    expect(sumBlock(signed)).toBe(sumBlock(signedWithout));
    expect(serialize({ ...signed, content: [] })).toBe(serialize({ ...signedWithout, content: [] }));
  });

  it('kundsidans variant med image_url godtas och ger samma dokument', () => {
    const pub = withImageUrlsForTest(sanitizeCustomerView(offer.customer_view)!, { 'altan/trall.jpg': 'https://signed/trall' });
    expect(serialize(buildOfferDocDef({ ...offer, customer_view: pub }, SIGN, ASSETS))).toBe(serialize(buildOfferDocDef(offer, SIGN, ASSETS)));
  });

  it('ROT av och omvänd moms: ingen ROT-rad under Arbete, belopp exkl. moms', () => {
    const omv = JSON.stringify(buildOfferDocDef({ ...offer, vat_mode: 'omvand', rot_enabled: false }, {}, ASSETS).content);
    expect(omv).not.toContain('ROT-berättigat arbete redovisas nedan');
    expect(omv).toContain('"SUMMA EXKL. MOMS"');
    expect(omv).toContain(JSON.stringify(fmtKr(view.sections[0].amount_ex_vat)));
  });
});

describe('offert-PDF med tillval', () => {
  const { offer } = kalkylOffer(true);
  const view = offerPdfCustomerView(offer.customer_view)!;
  const doc = buildOfferDocDef(offer, {}, ASSETS);
  const json = JSON.stringify(doc.content);

  it('tillvalen visas med rubrik, plustecken och text, och sist uppmaningen', () => {
    expect(view.options).toHaveLength(1);
    expect(json).toContain('"TILLVAL, INGÅR INTE I PRISET"');
    expect(json).toContain('"Altan på baksidan"');
    expect(json).toContain(JSON.stringify(`+ ${fmtKr(view.options[0].amount_ex_vat * 1.25)}`));
    expect(json).toContain(JSON.stringify(view.options[0].text));
    expect(json).toContain('Hör av dig till din kontakt om du vill lägga till något.');
  });

  it('tillvalen påverkar inga summor', () => {
    const totals = calcOfferTotals(offer.line_items, { vat_mode: 'vanlig', rot_enabled: true, rot_percent: 30, handpenning_percent: 25, rot_persons: 2, rot_used: 0 });
    const sum = [...view.sections, ...view.common].reduce((s, x) => s + x.amount_ex_vat, 0) * 1.25;
    expect(sum).toBeCloseTo(totals.total_incl_vat, 6);
    const noOptions = buildOfferDocDef({ ...offer, customer_view: { ...(offer.customer_view as object), options: [] } }, {}, ASSETS);
    expect(sumBlock(doc)).toBe(sumBlock(noOptions));
    expect(sumBlock(doc)).toBe(sumBlock(buildOfferDocDef({ ...offer, customer_view: null }, {}, ASSETS)));
    expect(JSON.stringify(noOptions.content)).not.toContain('TILLVAL');
  });
});

describe('offert-PDF: hjälpfunktioner', () => {
  it('valrad: namn, spec och kulörkod åtskilda med " · "', () => {
    expect(offerPdfItemText({ name: 'Sockellist furu vit', detail: '12×56', color: { system: 'NCS', code: 'S 0502-Y', name: null, hex: '#F3F0E6' } })).toBe('Sockellist furu vit · 12×56 · NCS S 0502-Y');
    expect(offerPdfItemText({ name: 'Underlag med ångspärr', detail: 'Foam, rulle 15 m²', color: null })).toBe('Underlag med ångspärr · Foam, rulle 15 m²');
    expect(offerPdfItemText({ name: 'Sockellist vit 12×56', detail: 'Målad, längd 2,4 m', color: { system: 'NCS', code: 'S 0502-Y', name: null, hex: null } })).toBe('Sockellist vit 12×56 · Målad, längd 2,4 m · NCS S 0502-Y');
    expect(offerPdfItemText({ name: 'Trall', detail: null, color: null })).toBe('Trall');
    expect(offerPdfItemText({ name: 'Takfärg', detail: null, color: { system: 'RAL', code: 'RAL 9010', name: null, hex: null } })).toBe('Takfärg · RAL 9010');
  });

  it('färgruta från kulörens hex eller provbitens färg, annars ingen', () => {
    expect(offerPdfSwatchColor({ color: { system: 'NCS', code: 'x', name: null, hex: '#f3f0e6' }, swatch: { color: '#000000' } })).toBe('#F3F0E6');
    expect(offerPdfSwatchColor({ color: null, swatch: { color: '#abc' } })).toBe('#AABBCC');
    expect(offerPdfSwatchColor({ color: null, swatch: { color: 'rgba(90,62,28,0.34)' } })).toBe('#5A3E1C');
    expect(offerPdfSwatchColor({ color: null, swatch: null })).toBeNull();
  });
});
