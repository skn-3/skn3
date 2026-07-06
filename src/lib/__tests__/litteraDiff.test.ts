import { describe, it, expect } from 'vitest';
import { diffOverview, diffTillbehor, changedFields, canonTillbehor, litteraChangeLines, type Tillbehor } from '../litteraDiff';

const foder = (over: Partial<Tillbehor> = {}): Tillbehor => ({
  typ: 'foder', placering: 'invandig', material: 'Furu Målad Vit',
  dimension: '12x50', matt: null, kulor: null, note: null, ...over,
});

describe('diffOverview', () => {
  it('fångar ändrat mått som "original → nytt"', () => {
    const r = { width: 1060, height: 1280, imported_snapshot: { width: 1080, height: 1280 }, spec: {} };
    expect(diffOverview(r)).toEqual(['Bredd: 1080 → 1060']);
  });

  it('boolean visas som Ja/Nej och spårtyp läses ur spec', () => {
    const r = {
      set_lead: true,
      spec: { spartyp: 'B1 Två sidor' },
      imported_snapshot: { set_lead: false, spartyp: 'B2 Fyra sidor' },
    };
    const out = diffOverview(r);
    expect(out).toContain('Ledare: Nej → Ja');
    expect(out).toContain('Spårtyp: B2 Fyra sidor → B1 Två sidor');
  });
});

describe('diffTillbehor', () => {
  it('upptäcker ändrad dimension på matchande typ+placering', () => {
    const ch = diffTillbehor([foder()], [foder({ dimension: '15x70' })]);
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe('changed');
    expect(ch[0].details?.[0]).toContain('12x50 → 15x70');
  });

  it('upptäcker borttaget och tillagt', () => {
    const bank: Tillbehor = { typ: 'fonsterbank', placering: null, material: 'MDF Vit', dimension: '16x160', matt: '1360 x 0', kulor: null, note: null };
    const ch = diffTillbehor([foder()], [bank]);
    expect(ch.map((c) => c.kind).sort()).toEqual(['added', 'removed']);
  });

  it('identiska listor ger inga ändringar (canon lika)', () => {
    expect(diffTillbehor([foder()], [foder()])).toEqual([]);
    expect(canonTillbehor([foder()])).toBe(canonTillbehor([foder()]));
  });
});

describe('changedFields (montörens kort)', () => {
  it('listar korta etiketter inkl. övrigt och tillbehör', () => {
    const r = {
      width: 1060, montor_note: 'utan salningsspår',
      spec: { tillbehor: [foder({ dimension: '15x70' })], spartyp: null },
      imported_snapshot: { width: 1080, tillbehor: [foder()], spartyp: null },
    };
    const out = changedFields(r);
    expect(out).toContain('bredd');
    expect(out).toContain('övrigt');
    expect(out).toContain('tillbehör');
  });
});

describe('litteraChangeLines (PDF)', () => {
  it('använder ASCII-pil och tillbehörsnotis', () => {
    const r = {
      width: 1060,
      spec: { tillbehor: [foder({ dimension: '15x70' })] },
      imported_snapshot: { width: 1080, tillbehor: [foder()] },
    };
    const out = litteraChangeLines(r);
    expect(out[0]).toBe('Bredd: 1080 -> 1060');
    expect(out).toContain('Tillbehör justerade (se system för detalj)');
  });
});
