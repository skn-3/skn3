import { describe, it, expect } from 'vitest';
import { parseKulor, applyPriceEdit, parsePriceImport, diffPriceImport } from '@/lib/kalkyl';
import { seedPriceItems } from './kalkylFixture';

describe('parseKulor', () => {
  it('normaliserar NCS', () => {
    expect(parseKulor('s2005-y20r')).toMatchObject({ system: 'NCS', code: 'S 2005-Y20R', name: 'Greige', hex: '#CFC3AD' });
    expect(parseKulor('S 0500-N')?.code).toBe('S 0500-N');
    expect(parseKulor('NCS S 7502-B')).toMatchObject({ code: 'S 7502-B', dark: true });
  });
  it('okänd men giltig kod saknar hex', () => {
    const k = parseKulor('S 1510-Y40R');
    expect(k).toEqual({ system: 'NCS', code: 'S 1510-Y40R' });
  });
  it('ogiltiga NCS-koder ger null', () => {
    expect(parseKulor('S 2005-Q')).toBeNull();
    expect(parseKulor('S 2010-N')).toBeNull();
    expect(parseKulor('S 2005-Y20B')).toBeNull();
    expect(parseKulor('S 8030-Y')).toBeNull();
    expect(parseKulor('')).toBeNull();
  });
  it('RAL', () => {
    expect(parseKulor('RAL 7016')).toMatchObject({ system: 'RAL', code: 'RAL 7016', dark: true });
    expect(parseKulor('7016', 'RAL')?.code).toBe('RAL 7016');
    expect(parseKulor('7016')).toBeNull();
    expect(parseKulor('RAL 0123')).toBeNull();
    expect(parseKulor('ral1015', 'RAL')).toEqual({ system: 'RAL', code: 'RAL 1015' });
    expect(parseKulor('RAL 7016', 'NCS')).toBeNull();
  });
});

describe('applyPriceEdit', () => {
  const base = seedPriceItems()[1];
  const approved = { ...base, status: 'godkand' as const, approved_by: 'Mirna', approved_at: '2026-11-01T10:00:00.000Z' };
  const now = new Date('2026-11-12T08:00:00.000Z');

  it('ändrat pris på godkänd rad utan godkännande blir utkast', () => {
    const next = applyPriceEdit(approved, { price_ex_vat: 360 }, 'Johannes', now, false);
    expect(next).toMatchObject({ status: 'utkast', approved_by: null, approved_at: null, updated_by: 'Johannes', price_ex_vat: 360 });
  });
  it('annan ändring behåller godkännandet', () => {
    const next = applyPriceEdit(approved, { spec: '14 mm, matt', price_ex_vat: 343.2 }, 'Johannes', now, false);
    expect(next).toMatchObject({ status: 'godkand', approved_by: 'Mirna' });
  });
  it('approve sätter godkänd, vem och när', () => {
    const next = applyPriceEdit(base, { price_ex_vat: 350 }, 'Mirna', now, true);
    expect(next).toMatchObject({ status: 'godkand', approved_by: 'Mirna', approved_at: '2026-11-12T08:00:00.000Z', updated_by: 'Mirna' });
  });
  it('sätter alltid updated_by', () => {
    expect(applyPriceEdit(base, {}, 'Daniel', now).updated_by).toBe('Daniel');
  });
});

describe('prisimport', () => {
  const header = 'kod;gren;typ;rot;valgrupp;namn;spec;enhet;pris_ex_moms;kostnad_ex_moms;forpackning;spill_procent;prisdatum';

  it('tolkar semikolon och decimalkomma', () => {
    const r = parsePriceImport(`${header}\nGOLV.MAT.EKPARKETT-3STAV;golv;material;material;golv.golvtyp;Ekparkett 3-stav;14 mm, mattlack;m2;359,90;210,50;3,18;8;2026-11-20`);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].errors).toEqual([]);
    expect(r.rows[0].code).toBe('golv.mat.ekparkett-3stav');
    expect(r.rows[0].values).toMatchObject({ unit: 'm²', price_ex_vat: 359.9, cost_ex_vat: 210.5, pack_size: 3.18, waste_pct: 8, price_date: '2026-11-20' });
  });
  it('tolkar tabbar och citattecken', () => {
    const r = parsePriceImport('kod\tgren\ttyp\trot\tnamn\tenhet\tpris_ex_moms\nx.y\tgolv\tarbete\tarbete\t"Läggning, special"\tm²\t1 200,50');
    expect(r.rows[0].values).toMatchObject({ name: 'Läggning, special', price_ex_vat: 1200.5 });
  });
  it('tomt pris blir NULL, inte noll', () => {
    const r = parsePriceImport(`${header}\nny.rad;golv;material;material;;Ny;;m²;;;;;`);
    expect(r.rows[0].values.price_ex_vat).toBeNull();
  });
  it('fel per rad', () => {
    const r = parsePriceImport(`${header}\na;golvet;material;material;;A;;m²;1;;;;\nb;golv;sak;material;;B;;m²;1;;;;\nc;golv;material;moms;;C;;m²;1;;;;\nd;golv;material;material;;D;;ton;1;;;;\n;golv;material;material;;E;;m²;1;;;;\nf;golv;material;material;;;;m²;1;;;;`);
    expect(r.rows.map(x => x.errors[0])).toEqual([
      'Okänd gren: "golvet"', 'Okänd typ: "sak"', 'Okänd rot: "moms"', 'Okänd enhet: "ton"', 'Kod saknas', 'Namn saknas',
    ]);
  });
  it('saknad rubrik ger fel för hela importen', () => {
    expect(parsePriceImport('kod;namn\na;A').errors.length).toBeGreaterThan(0);
  });
  it('diff: ny, ändrad med gammalt → nytt, oförändrad, fel', () => {
    const existing = seedPriceItems();
    const r = parsePriceImport([
      'kod;gren;typ;rot;namn;enhet;pris_ex_moms',
      'golv.mat.ekparkett-3stav;golv;material;material;Ekparkett 3-stav;m²;359,90',
      'golv.mat.laminat-ek;golv;material;material;Laminat ek;m²;199,20',
      'golv.mat.ny;golv;material;material;Ny matta;m²;100',
      'trasig;golv;fel;material;X;m²;1',
    ].join('\n'));
    const d = diffPriceImport(r.rows, existing);
    expect(d.map(x => x.status)).toEqual(['andrad', 'oforandrad', 'ny', 'fel']);
    expect(d[0].changes).toEqual([{ field: 'price_ex_vat', old: 343.2, new: 359.9 }]);
  });
});

describe('prislistans hjälpfunktioner', () => {
  it('behöver kontroll: utkast, saknat pris eller gammalt pris', async () => {
    const { needsReview, reviewReasons, priceListSummary, itemTbPct, inclVat, priceAgeLabel } = await import('@/lib/kalkyl');
    const [a] = seedPriceItems();
    expect(reviewReasons(a, '2026-11-12', 60)).toEqual(['utkast']);
    const ok = { ...a, status: 'godkand' as const };
    expect(needsReview(ok, '2026-11-12', 60)).toBe(false);
    expect(reviewReasons({ ...ok, price_ex_vat: null }, '2026-11-12', 60)).toEqual(['saknar_pris']);
    expect(reviewReasons({ ...ok, price_date: '2026-08-14' }, '2026-11-12', 60)).toEqual(['gammalt']);
    expect(needsReview({ ...a, status: 'arkiverad' }, '2026-11-12', 60)).toBe(false);
    expect(priceListSummary(seedPriceItems(), '2026-11-12', 60)).toMatchObject({ total: 29, utkast: 29, godkand: 0, saknar_pris: 0 });
    expect(itemTbPct({ price_ex_vat: 200, cost_ex_vat: 150 })).toBe(25);
    expect(itemTbPct({ price_ex_vat: 200, cost_ex_vat: null })).toBeNull();
    expect(inclVat(343.2)).toBe(429);
    expect(inclVat(null)).toBeNull();
    expect(priceAgeLabel({ price_date: '2026-08-14' }, '2026-11-12')).toBe('90 dagar');
    expect(priceAgeLabel({ price_date: '2026-11-12' }, '2026-11-12')).toBe('i dag');
  });
  it('kalkylinställningar faller tillbaka på standard och valideras', async () => {
    const { parseKalkylSettings, validateKalkylSettings } = await import('@/lib/kalkyl');
    const s = parseKalkylSettings({ margin_target_pct: 30, door_width_m: 'x' });
    expect(s).toMatchObject({ margin_target_pct: 30, door_width_m: 0.9, price_max_age_days: 60 });
    expect(validateKalkylSettings({ ...s, price_max_age_days: 0 }).price_max_age_days).toBeTruthy();
    expect(validateKalkylSettings(s)).toEqual({});
  });
});
