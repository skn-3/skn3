// Littera-diff mot imported_snapshot — ENDA källan. Används av LitterorSection (personal),
// MontorLitteraSection (montör) och montageReportPdf. imported_snapshot är immutabel baslinje.

export interface Tillbehor {
  typ: string; placering: string | null; material: string | null;
  dimension: string | null; matt: string | null; kulor: string | null; note: string | null;
}
export type TillChange = { kind: 'added' | 'removed' | 'changed'; label: string; details?: string[] };

export const TILLBEHOR_LABEL: Record<string, string> = {
  foder: 'Foder', smyg: 'Smyg', fonsterbank: 'Fönsterbänk', sockellist: 'Sockellist',
  plisse: 'Plissé', l_profil: 'L-profil / plåt', ovrigt: 'Övrigt',
};
export const PLACERING_LABEL: Record<string, string> = { invandig: 'Invändig', utvandig: 'Utvändig' };

export const TRACKED_FIELDS: { key: string; label: string; short: string }[] = [
  { key: 'width', label: 'Bredd', short: 'bredd' },
  { key: 'height', label: 'Höjd', short: 'höjd' },
  { key: 'brostning', label: 'Bröstning', short: 'bröstning' },
  { key: 'antal', label: 'Antal', short: 'antal' },
  { key: 'set_number', label: 'Set-nr', short: 'set-nr' },
  { key: 'set_position', label: 'Position', short: 'position' },
  { key: 'set_lead', label: 'Ledare', short: 'ledare' },
  { key: 'color_inside', label: 'Kulör insida', short: 'kulör insida' },
  { key: 'color_outside', label: 'Kulör utsida', short: 'kulör utsida' },
];

export function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nej';
  return String(v);
}

export function tillHead(t: Tillbehor): string {
  let s = TILLBEHOR_LABEL[t.typ] ?? t.typ;
  if (t.placering) s += ` (${PLACERING_LABEL[t.placering] ?? t.placering})`;
  return s;
}

export function tillLabel(t: Tillbehor): string {
  const meta: string[] = [];
  if (t.dimension) meta.push(t.dimension);
  if (t.matt) meta.push(`${t.matt} mm`);
  if (t.material) meta.push(t.material);
  if (t.kulor) meta.push(t.kulor);
  let s = tillHead(t);
  if (meta.length) s += ' · ' + meta.join(', ');
  if (t.note) s += ` (${t.note})`;
  return s;
}

export function canonTillbehor(arr: unknown): string {
  const list = Array.isArray(arr) ? arr : [];
  return JSON.stringify(list.map((t: any) => [
    t?.typ ?? 'ovrigt', t?.placering ?? null, t?.material ?? null,
    t?.dimension ?? null, t?.matt ?? null, t?.kulor ?? null, t?.note ?? null,
  ]));
}

function eqTill(a: Tillbehor, b: Tillbehor): boolean {
  return (['material', 'dimension', 'matt', 'kulor', 'note'] as const)
    .every((k) => ((a as any)[k] ?? null) === ((b as any)[k] ?? null));
}

export function diffTillbehor(orig: Tillbehor[], cur: Tillbehor[]): TillChange[] {
  const changes: TillChange[] = [];
  const left = [...cur];
  for (const o of orig) {
    let idx = left.findIndex((t) => t.typ === o.typ && (t.placering ?? null) === (o.placering ?? null) && eqTill(t, o));
    if (idx === -1) idx = left.findIndex((t) => t.typ === o.typ && (t.placering ?? null) === (o.placering ?? null));
    if (idx === -1) {
      changes.push({ kind: 'removed', label: tillLabel(o) });
    } else {
      const t = left[idx];
      left.splice(idx, 1);
      const details: string[] = [];
      const meta: [keyof Tillbehor, string][] = [['material', 'material'], ['dimension', 'dim'], ['matt', 'mått'], ['kulor', 'kulör'], ['note', 'notering']];
      for (const [k, lbl] of meta) {
        const a = (o as any)[k] ?? null;
        const b = (t as any)[k] ?? null;
        if (a !== b) details.push(`${lbl}: ${fmtVal(a)} → ${fmtVal(b)}`);
      }
      if (details.length) changes.push({ kind: 'changed', label: tillHead(o), details });
    }
  }
  for (const t of left) changes.push({ kind: 'added', label: tillLabel(t) });
  return changes;
}

// Personalvyn/PDF: "Fält: original → nuvarande" (inkl. spårtyp ur spec).
export function diffOverview(r: any): string[] {
  const snap = r.imported_snapshot || {};
  const out: string[] = [];
  for (const { key, label } of TRACKED_FIELDS) {
    const now = r[key] ?? null;
    const orig = snap[key] ?? null;
    if (now !== orig) out.push(`${label}: ${fmtVal(orig)} → ${fmtVal(now)}`);
  }
  const sNow = r.spec?.spartyp ?? null;
  const sOrig = snap?.spartyp ?? null;
  if (sNow !== sOrig) out.push(`Spårtyp: ${fmtVal(sOrig)} → ${fmtVal(sNow)}`);
  return out;
}

// Montörens kort: korta etiketter på det som ändrats.
export function changedFields(r: any): string[] {
  const snap = r.imported_snapshot || {};
  const diff = TRACKED_FIELDS
    .filter(({ key }) => ((r[key] ?? null) !== (snap[key] ?? null)))
    .map((f) => f.short);
  if (r.montor_note && String(r.montor_note).trim()) diff.push('övrigt');
  if (canonTillbehor(r.spec?.tillbehor) !== canonTillbehor(snap?.tillbehor)) diff.push('tillbehör');
  if ((r.spec?.spartyp ?? null) !== (snap?.spartyp ?? null)) diff.push('spårtyp');
  return diff;
}

// Montagerapportens PDF-rader (ASCII-pil, kompakt tillbehörsnotis).
export function litteraChangeLines(r: any): string[] {
  const out = diffOverview(r).map((s) => s.replace(' → ', ' -> '));
  if (canonTillbehor(r.spec?.tillbehor) !== canonTillbehor((r.imported_snapshot || {})?.tillbehor)) {
    out.push('Tillbehör justerade (se system för detalj)');
  }
  if (r.montor_note && String(r.montor_note).trim()) out.push(`Notering: ${String(r.montor_note).trim()}`);
  return out;
}
