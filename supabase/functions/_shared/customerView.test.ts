import { describe, it, expect } from 'vitest';
import { CUSTOMER_VIEW_LIMITS, customerViewImagePaths, sanitizeCustomerView, withImageUrls } from './customerView';

const valid = () => ({
  version: 1,
  intro: 'Vi lägger nytt golv.',
  sections: [{
    id: 'rad_1', room: 'Vardagsrum', title: 'Golv', type: 'Golv', amount_ex_vat: 12345.678, text: 'Ekparkett, 21 m².', facts: ['21 m²'],
    items: [
      { label: 'Golv', name: 'Ekparkett', detail: '14 mm', color: null, swatch: { color: '#C9A877', line: 'rgba(90,62,28,0.34)', pattern: 'plank', step: 8 }, image_path: 'golv/ek.jpg' },
      { label: 'Sockel', name: 'Sockellist', detail: null, color: { system: 'NCS', code: 'S 0502-Y', name: null, hex: '#F3F0E6' }, swatch: null, image_path: null },
    ],
  }],
  common: [{ title: 'Etablering', amount_ex_vat: 2500 }],
  totals: { arbete_ex_vat: 5000, material_ex_vat: 9845.68, ovrigt_ex_vat: 0 },
});

describe('sanitizeCustomerView (public-offer)', () => {
  it('giltig kundvy går igenom med avrundade belopp', () => {
    const v = sanitizeCustomerView(valid())!;
    expect(v.sections[0].amount_ex_vat).toBe(12345.68);
    expect(v.sections[0].items[0].swatch).toEqual({ color: '#C9A877', line: 'rgba(90,62,28,0.34)', pattern: 'plank', step: 8 });
    expect(v.common).toEqual([{ title: 'Etablering', amount_ex_vat: 2500 }]);
    expect(v.intro).toBe('Vi lägger nytt golv.');
  });

  it('okända nycklar tas bort på alla nivåer', () => {
    const raw = valid() as any;
    raw.cost = 1; raw.sections[0].note = 'intern'; raw.sections[0].items[0].code = 'golv.mat.ek'; raw.sections[0].items[0].price_status = 'utkast';
    raw.sections[0].items[1].color.dark = true; raw.sections[0].items[0].swatch.url = 'x'; raw.common[0].cost = 10; raw.totals.tb = 99;
    const v = sanitizeCustomerView(raw)!;
    expect(Object.keys(v.sections[0].items[0])).toEqual(['label', 'name', 'detail', 'color', 'swatch', 'image_path']);
    const json = JSON.stringify(v);
    for (const k of ['cost', 'note', 'price_status', 'dark', 'url', '"tb"', 'golv.mat.ek', 'intern']) expect(json, k).not.toContain(k);
  });

  it('allt annat ger null: fel version, inte objekt, fel typer och överskridna gränser', () => {
    expect(sanitizeCustomerView(null)).toBeNull();
    expect(sanitizeCustomerView('x')).toBeNull();
    expect(sanitizeCustomerView([])).toBeNull();
    expect(sanitizeCustomerView({ ...valid(), version: 2 })).toBeNull();
    expect(sanitizeCustomerView({ ...valid(), sections: 'x' })).toBeNull();
    expect(sanitizeCustomerView({ ...valid(), totals: null })).toBeNull();
    expect(sanitizeCustomerView({ ...valid(), totals: { arbete_ex_vat: 'x', material_ex_vat: 0, ovrigt_ex_vat: 0 } })).toBeNull();
    const badAmount = valid(); (badAmount.sections[0] as any).amount_ex_vat = Infinity;
    expect(sanitizeCustomerView(badAmount)).toBeNull();
    const badTitle = valid(); (badTitle.sections[0] as any).title = 5;
    expect(sanitizeCustomerView(badTitle)).toBeNull();
    const many = valid(); many.sections = Array.from({ length: CUSTOMER_VIEW_LIMITS.sections + 1 }, () => valid().sections[0]);
    expect(sanitizeCustomerView(many)).toBeNull();
    const tiles = valid(); tiles.sections[0].items = Array.from({ length: CUSTOMER_VIEW_LIMITS.items + 1 }, () => valid().sections[0].items[1]);
    expect(sanitizeCustomerView(tiles)).toBeNull();
    const long = valid(); long.sections[0].text = 'a'.repeat(CUSTOMER_VIEW_LIMITS.text + 1);
    expect(sanitizeCustomerView(long)).toBeNull();
    expect(sanitizeCustomerView({ ...valid(), intro: 'a'.repeat(CUSTOMER_VIEW_LIMITS.text + 1) })).toBeNull();
    // Precis på gränsen går igenom.
    const edge = valid(); edge.sections = Array.from({ length: CUSTOMER_VIEW_LIMITS.sections }, () => valid().sections[0]);
    expect(sanitizeCustomerView(edge)?.sections).toHaveLength(CUSTOMER_VIEW_LIMITS.sections);
  });

  it('färger som inte är #hex eller rgb()/rgba() tas bort; tom intro blir null', () => {
    const raw = valid() as any;
    raw.sections[0].items[1].color.hex = 'red; background:url(https://evil)';
    raw.sections[0].items[0].swatch = { color: 'url(https://evil)', pattern: 'plank' };
    raw.intro = '   ';
    const v = sanitizeCustomerView(raw)!;
    expect(v.sections[0].items[1].color).toEqual({ system: 'NCS', code: 'S 0502-Y', name: null, hex: null });
    expect(v.sections[0].items[0].swatch).toBeNull();
    expect(v.intro).toBeNull();
  });

  it('bildsökvägar byts mot signerade länkar och skickas aldrig ut', () => {
    const v = sanitizeCustomerView(valid())!;
    expect(customerViewImagePaths(v)).toEqual(['golv/ek.jpg']);
    const pub = withImageUrls(v, { 'golv/ek.jpg': 'https://signed/ek' });
    expect(pub.sections[0].items[0].image_url).toBe('https://signed/ek');
    expect(pub.sections[0].items[1].image_url).toBeNull();
    expect(JSON.stringify(pub)).not.toContain('image_path');
    expect(JSON.stringify(pub)).not.toContain('golv/ek.jpg');
    // Sökväg som inte signerades (finns inte i price_items) ger null.
    expect(withImageUrls(v, {}).sections[0].items[0].image_url).toBeNull();
  });
});
