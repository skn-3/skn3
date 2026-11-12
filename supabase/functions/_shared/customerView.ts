// Kundvyn för offertsidan (offers.customer_view), version 1.
// Ren modul utan beroenden: typerna används av kalkylen (src/lib/kalkyl/customerView.ts), saneringen och
// bildlänkarna av public-offer. Kundvyn innehåller aldrig kostnad, timmar, TB, prisstatus, prisdatum,
// prislistekoder, anteckningar, kontroller, favoriter eller säljarens ändringsmärkning.

export interface CustomerColor { system: string | null; code: string; name: string | null; hex: string | null }
export interface CustomerSwatch { color: string; line?: string; pattern?: string; step?: number }
export interface CustomerItem {
  label: string;
  name: string;
  detail: string | null;
  color: CustomerColor | null;
  swatch: CustomerSwatch | null;
  /** Sökväg i catalog-images. Skickas aldrig ut: public-offer byter den mot image_url. */
  image_path: string | null;
}
export interface CustomerSection {
  id: string;
  room: string | null;
  title: string;
  type: string;
  amount_ex_vat: number;
  text: string;
  facts: string[];
  items: CustomerItem[];
}
export interface CustomerCommonLine { title: string; amount_ex_vat: number }
export interface CustomerTotals { arbete_ex_vat: number; material_ex_vat: number; ovrigt_ex_vat: number }
export interface CustomerView {
  version: 1;
  intro: string | null;
  sections: CustomerSection[];
  common: CustomerCommonLine[];
  totals: CustomerTotals;
}

/** Det kunden får: image_path är utbytt mot en kortlivad länk. */
export type PublicCustomerItem = Omit<CustomerItem, 'image_path'> & { image_url: string | null };
export type PublicCustomerSection = Omit<CustomerSection, 'items'> & { items: PublicCustomerItem[] };
export type PublicCustomerView = Omit<CustomerView, 'sections'> & { sections: PublicCustomerSection[] };

export const CUSTOMER_VIEW_LIMITS = { sections: 100, items: 12, facts: 12, common: 100, text: 2000, path: 500 } as const;

/** De enda nycklar som får finnas i en kundvy, per nivå. */
export const CUSTOMER_VIEW_KEYS = {
  root: ['version', 'intro', 'sections', 'common', 'totals'],
  section: ['id', 'room', 'title', 'type', 'amount_ex_vat', 'text', 'facts', 'items'],
  item: ['label', 'name', 'detail', 'color', 'swatch', 'image_path'],
  color: ['system', 'code', 'name', 'hex'],
  swatch: ['color', 'line', 'pattern', 'step'],
  common: ['title', 'amount_ex_vat'],
  totals: ['arbete_ex_vat', 'material_ex_vat', 'ovrigt_ex_vat'],
} as const;

class Invalid extends Error {}
const fail = (): never => { throw new Invalid(); };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const reqStr = (v: unknown, max: number = CUSTOMER_VIEW_LIMITS.text): string =>
  typeof v === 'string' && v.length <= max ? v : fail();
const optStr = (v: unknown, max: number = CUSTOMER_VIEW_LIMITS.text): string | null => (v == null ? null : reqStr(v, max));
const money = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e10 ? Math.round(v * 100) / 100 : fail();
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : fail());

/** Bara färgvärden som inte kan bära annat innehåll i en stil: #hex eller rgb()/rgba() med siffror. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/i;
const cssColor = (v: unknown): string | null => (typeof v === 'string' && v.length <= 64 && COLOR_RE.test(v.trim()) ? v.trim() : null);

function color(v: unknown): CustomerColor | null {
  if (v == null) return null;
  if (!isObj(v)) return fail();
  return { system: optStr(v.system, 20), code: reqStr(v.code, 60), name: optStr(v.name, 120), hex: cssColor(v.hex) };
}

function swatch(v: unknown): CustomerSwatch | null {
  if (v == null) return null;
  if (!isObj(v)) return fail();
  const c = cssColor(v.color);
  if (!c) return null;
  const out: CustomerSwatch = { color: c };
  const line = cssColor(v.line);
  if (line) out.line = line;
  if (typeof v.pattern === 'string' && /^[a-z]{1,20}$/.test(v.pattern)) out.pattern = v.pattern;
  if (typeof v.step === 'number' && Number.isFinite(v.step) && v.step > 0 && v.step <= 100) out.step = v.step;
  return out;
}

function item(v: unknown): CustomerItem {
  if (!isObj(v)) return fail();
  return {
    label: reqStr(v.label, 120),
    name: reqStr(v.name, 300),
    detail: optStr(v.detail, 300),
    color: color(v.color),
    swatch: swatch(v.swatch),
    image_path: optStr(v.image_path, CUSTOMER_VIEW_LIMITS.path),
  };
}

function section(v: unknown): CustomerSection {
  if (!isObj(v)) return fail();
  return {
    id: reqStr(v.id, 120),
    room: optStr(v.room, 300),
    title: reqStr(v.title, 300),
    type: reqStr(v.type, 120),
    amount_ex_vat: money(v.amount_ex_vat),
    text: v.text == null ? '' : reqStr(v.text),
    facts: list(v.facts ?? [], CUSTOMER_VIEW_LIMITS.facts).map(f => reqStr(f, 120)),
    items: list(v.items ?? [], CUSTOMER_VIEW_LIMITS.items).map(item),
  };
}

function common(v: unknown): CustomerCommonLine {
  if (!isObj(v)) return fail();
  return { title: reqStr(v.title, 300), amount_ex_vat: money(v.amount_ex_vat) };
}

/**
 * Bygger en ny kundvy med bara de kända nycklarna och rätt typer för version 1.
 * Okänd version, fel typ på ett fält eller en överskriden gräns ger null (kundsidan visas då som tidigare).
 * Färger som inte är #hex eller rgb()/rgba() tas bort, så att inget annat kan hamna i en stil.
 */
export function sanitizeCustomerView(raw: unknown): CustomerView | null {
  try {
    if (!isObj(raw) || raw.version !== 1) return null;
    const t = raw.totals;
    if (!isObj(t)) return null;
    const intro = optStr(raw.intro);
    return {
      version: 1,
      intro: intro && intro.trim() ? intro : null,
      sections: list(raw.sections, CUSTOMER_VIEW_LIMITS.sections).map(section),
      common: list(raw.common ?? [], CUSTOMER_VIEW_LIMITS.common).map(common),
      totals: { arbete_ex_vat: money(t.arbete_ex_vat), material_ex_vat: money(t.material_ex_vat), ovrigt_ex_vat: money(t.ovrigt_ex_vat) },
    };
  } catch (e) {
    if (e instanceof Invalid) return null;
    throw e;
  }
}

/** Unika bildsökvägar i kundvyn, i ordning. */
export function customerViewImagePaths(view: CustomerView): string[] {
  const out: string[] = [];
  for (const s of view.sections) for (const i of s.items) if (i.image_path && !out.includes(i.image_path)) out.push(i.image_path);
  return out;
}

/** Byter image_path mot image_url. En sökväg utan signerad länk ger image_url null; sökvägen skickas aldrig ut. */
export function withImageUrls(view: CustomerView, urls: Record<string, string | null | undefined>): PublicCustomerView {
  return {
    ...view,
    sections: view.sections.map(s => ({
      ...s,
      items: s.items.map(({ image_path, ...rest }) => ({ ...rest, image_url: (image_path && urls[image_path]) || null })),
    })),
  };
}
