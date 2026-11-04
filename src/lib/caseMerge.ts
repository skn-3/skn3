import { parseAddress, sameStreetKey } from './caseMatching';

/** Fält som kan kompletteras på det behållna ärendet vid sammanslagning (samma lista som merge_cases). */
export const MERGE_FIELDS = [
  { key: 'customer_name', label: 'Kundnamn' },
  { key: 'address', label: 'Adress' },
  { key: 'city', label: 'Ort' },
  { key: 'customer_phone', label: 'Telefon' },
  { key: 'customer_email', label: 'E-post' },
  { key: 'order_number', label: 'Ordernummer' },
  { key: 'offer_number', label: 'Affärsförslag' },
  { key: 'status', label: 'Status' },
] as const;

export type MergeFieldKey = typeof MERGE_FIELDS[number]['key'];
export type MergeChoice = 'keep' | 'drop';
export type MergeChoices = Partial<Record<MergeFieldKey, MergeChoice>>;

export interface MergeCase {
  id: string;
  created_at?: string | null;
  seller?: string | null;
  address?: string | null;
  [key: string]: unknown;
}

export function isUnknownSeller(seller: unknown): boolean {
  const s = String(seller ?? '').trim().toLowerCase();
  return s === '' || s === 'okänd' || s === 'okand' || s === 'unknown';
}

/**
 * Förval av vilket ärende som behålls: aldrig ett med okänd säljare om det andra har en riktig,
 * annars det äldre ärendet. Returnerar [behåll, dubblett].
 */
export function pickKeep<T extends MergeCase>(a: T, b: T): [T, T] {
  const ua = isUnknownSeller(a.seller), ub = isUnknownSeller(b.seller);
  if (ua !== ub) return ua ? [b, a] : [a, b];
  const ta = Date.parse(String(a.created_at ?? '')), tb = Date.parse(String(b.created_at ?? ''));
  if (Number.isFinite(ta) && Number.isFinite(tb) && tb < ta) return [b, a];
  if (!Number.isFinite(ta) && Number.isFinite(tb)) return [b, a];
  return [a, b];
}

const clean = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
};

export interface MergeFieldRow {
  key: MergeFieldKey;
  label: string;
  keepValue: string | null;
  dropValue: string | null;
  result: string | null;
  /** Tomt fält på det behållna ärendet fylls alltid från dubbletten. */
  autoFilled: boolean;
  changed: boolean;
  /** Ett val behövs bara när båda har olika, ifyllda värden. */
  needsChoice: boolean;
}

/** Fältsammanslagning — samma regler som merge_cases i databasen. */
export function mergeFieldPlan(keep: MergeCase, drop: MergeCase, choices: MergeChoices = {}): MergeFieldRow[] {
  return MERGE_FIELDS.map(({ key, label }) => {
    const kv = clean(keep[key]), dv = clean(drop[key]);
    const choice: MergeChoice = choices[key] === 'drop' ? 'drop' : 'keep';
    const result = kv == null || choice === 'drop' ? (dv ?? kv) : kv;
    return {
      key, label, keepValue: kv, dropValue: dv, result,
      autoFilled: kv == null && dv != null,
      changed: result !== kv,
      needsChoice: kv != null && dv != null && kv !== dv,
    };
  });
}

export interface DuplicatePair<T> { keep: T; drop: T }

/** Par av ärenden med samma gata + husnummer. Visar bara — slår aldrig ihop något. */
export function findDuplicatePairs<T extends MergeCase>(cases: readonly T[]): DuplicatePair<T>[] {
  const buckets = new Map<string, T[]>();
  for (const c of cases) {
    const p = parseAddress(c.address);
    if (!p.valid) continue;
    const k = `${p.streetKey}|${p.number}`;
    const list = buckets.get(k);
    if (list) list.push(c); else buckets.set(k, [c]);
  }
  const pairs: DuplicatePair<T>[] = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!sameStreetKey(list[i].address, list[j].address)) continue;
        const [keep, drop] = pickKeep(list[i], list[j]);
        pairs.push({ keep, drop });
      }
    }
  }
  return pairs.sort((x, y) => String(x.keep.address ?? '').localeCompare(String(y.keep.address ?? ''), 'sv'));
}

const TABLE_LABELS: Record<string, [string, string]> = {
  a_orders: ['A-order', 'A-ordrar'],
  case_documents: ['dokument', 'dokument'],
  case_events: ['händelse', 'händelser'],
  visits: ['besök', 'besök'],
  litteror: ['littera', 'litteror'],
  case_costs: ['kostnad', 'kostnader'],
  deviations: ['avvikelse', 'avvikelser'],
  offers: ['offert', 'offerter'],
  future_jobs: ['framtida jobb', 'framtida jobb'],
  messages: ['chattmeddelande', 'chattmeddelanden'],
  case_climate_compensation: ['klimatkompensation', 'klimatkompensationer'],
  climate_events: ['klimathändelse', 'klimathändelser'],
  sheet_metal_orders: ['plåtbeställning', 'plåtbeställningar'],
  montor_debit_invoices: ['montörfaktura', 'montörfakturor'],
  notifications: ['notis', 'notiser'],
};
const ORDER = Object.keys(TABLE_LABELS);

/** "1 A-order, 1 dokument, 2 händelser, 1 besök" från merge_cases-resultatets antal. */
export function movedSummary(moved: Record<string, number>, notifications = 0): string {
  const entries = Object.entries({ ...moved, ...(notifications > 0 ? { notifications } : {}) })
    .filter(([, n]) => Number(n) > 0)
    .sort(([a], [b]) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)));
  if (entries.length === 0) return 'inget';
  return entries.map(([t, n]) => {
    const l = TABLE_LABELS[t.split('.')[0]];
    return `${n} ${l ? (Number(n) === 1 ? l[0] : l[1]) : t}`;
  }).join(', ');
}
