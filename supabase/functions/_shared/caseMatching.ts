// Gemensam, ren ärendematchning för hela appen (frontend + edge-funktioner).
// Inga beroenden: används av komponenter via src/lib/caseMatching.ts och av
// N3prenad-AI via relativ import. Ändra reglerna här och i testerna, aldrig
// i komponenterna.

export interface ParsedAddress {
  street: string;
  number: string;
  letter: string;
  city: string;
  /** gatunyckel + '#' + nummer + bokstav, tom när valid=false */
  key: string;
  /** gatunyckel utan nummer (diakritiska tecken/skiljetecken borttagna, förkortningar expanderade) */
  streetKey: string;
  valid: boolean;
}

export interface CaseLike {
  id: string;
  address?: string | null;
  city?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  order_number?: string | number | null;
  status?: string | null;
}

export interface MatchTarget {
  address?: string | null;
  city?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  mockfjardsOrderNumber?: string | number | null;
}

export type MatchLevel = 'auto' | 'suggest' | 'none';

export interface CaseScore {
  score: number;
  reasons: string[];
  /** Poäng enbart från adressen (inkl. ort), för tester och felsökning. */
  addressScore: number;
}

export interface RankedCase<T extends CaseLike = CaseLike> extends CaseScore {
  case: T;
  level: MatchLevel;
  /** Läsbar motivering, t.ex. "adress + ort + namn". */
  label: string;
}

export const AUTO_THRESHOLD = 90;
export const SUGGEST_THRESHOLD = 55;
export const AMBIGUITY_MARGIN = 10;
export const INVOICED_PENALTY = 5;

const PREFIX_WORDS = /^(?:rättelse|rattelse|komplettering(?:sfaktura)?|tillägg|tillagg|korrigering|ändring|andring)(?:\s+(?:av|till|för|for|på|pa))?[\s:.\-–—]*/u;

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function basicNormalize(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .trim();
}

function expandAbbreviations(street: string): string {
  let s = street.trim();
  const rules: [RegExp, string][] = [
    [/(?:^|\s|(?<=\p{L}))gr\.?$/u, 'gränd'],
    [/(?:^|\s|(?<=\p{L}))st\.$/u, 'stigen'],
    [/(?:^|\s)st$/u, 'stigen'],
    [/(?:^|\s|(?<=\p{L}))v\.$/u, 'vägen'],
    [/(?:^|\s)v$/u, 'vägen'],
    [/(?:^|\s|(?<=\p{L}))g\.$/u, 'gatan'],
    [/(?:^|\s)g$/u, 'gatan'],
  ];
  for (const [re, rep] of rules) {
    if (re.test(s)) { s = s.replace(re, rep); break; }
  }
  return s;
}

export function streetKeyOf(street: string): string {
  return stripDiacritics(expandAbbreviations(street)).replace(/[^a-z]/g, '');
}

export function cityKeyOf(city: string | null | undefined): string {
  return stripDiacritics(basicNormalize(city))
    .replace(/\b\d{3}\s?\d{2}\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

const ADDRESS_RE = /^(\p{L}[\p{L}.'\- ]*?)\s*(\d{1,4})(?!\d)(?:\s?([a-z])(?![\p{L}\p{N}]))?(.*)$/u;

function tryParse(segment: string): ParsedAddress | null {
  let s = segment.trim();
  // ledande ord som "rättelse", "komplettering av"
  for (let i = 0; i < 3; i++) {
    const next = s.replace(PREFIX_WORDS, '').trim();
    if (next === s) break;
    s = next;
  }
  const m = s.match(ADDRESS_RE);
  if (!m) return null;
  const rawStreet = m[1].replace(/[,]/g, ' ').trim();
  const number = m[2];
  const rest = m[4] ?? '';
  // Postnummer (3+2 siffror) får aldrig tolkas som husnummer.
  if (number.length === 3 && /^\s?\d{2}(?!\d)/.test(rest)) return null;
  // Gatan måste sluta med en bokstav eller punkt (förkortning) och inte vara ett skiljeord.
  if (!/[\p{L}.]$/u.test(rawStreet)) return null;
  const letter = m[3] ?? '';
  const streetKey = streetKeyOf(rawStreet);
  if (streetKey.length < 2) return null;
  let cityPart = rest.replace(/^[\s,]+/, '');
  if (cityPart.includes(',')) {
    const parts = cityPart.split(',').map(p => p.trim()).filter(Boolean);
    cityPart = parts[parts.length - 1] ?? '';
  }
  const city = cityPart
    .replace(/\b(?:lgh|lägenhet|vån|våning|uppg|nb|bv)\.?\s*\d*\b/gu, ' ')
    .replace(/\d{3}\s?\d{2}(?!\d)/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^\p{L}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    street: expandAbbreviations(rawStreet.replace(/\s+/g, ' ')),
    number,
    letter,
    city,
    streetKey,
    key: `${streetKey}#${number}${letter}`,
    valid: true,
  };
}

const INVALID: ParsedAddress = { street: '', number: '', letter: '', city: '', key: '', streetKey: '', valid: false };

export function parseAddress(raw: unknown): ParsedAddress {
  const s = basicNormalize(raw);
  if (!s) return { ...INVALID };
  // Prefixtext före sista " - " (t.ex. "Rättelse - Hallongränd 19").
  const segments = s.split(/\s[-–—]\s/);
  for (let i = segments.length - 1; i >= 0; i--) {
    const parsed = tryParse(segments.slice(i).join(' - '));
    if (parsed) return parsed;
  }
  // Fallback: hela strängen om segmenten inte gav något.
  return tryParse(s) ?? { ...INVALID };
}

/** Damerau-Levenshtein (optimal string alignment). */
export function damerauLevenshtein(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m];
}

/** Avstånd mellan två adressers gatunycklar (Infinity om någon saknar gata). */
export function streetDistance(a: unknown, b: unknown): number {
  const ka = typeof a === 'string' && !/\d/.test(a) && !a.includes(' ') && a === a.toLowerCase() ? a : parseAddress(a).streetKey;
  const kb = typeof b === 'string' && !/\d/.test(b) && !b.includes(' ') && b === b.toLowerCase() ? b : parseAddress(b).streetKey;
  if (!ka || !kb) return Infinity;
  return damerauLevenshtein(ka, kb);
}

function lettersCompatible(a: ParsedAddress, b: ParsedAddress) {
  return !a.letter || !b.letter || a.letter === b.letter;
}

/** Samma gata + husnummer (bokstav jämförs bara när båda har en). Används för dubblettvarningar. */
export function sameStreetKey(a: unknown, b: unknown): boolean {
  const pa = parseAddress(a), pb = parseAddress(b);
  return pa.valid && pb.valid && pa.streetKey === pb.streetKey && pa.number === pb.number && lettersCompatible(pa, pb);
}

// ---- Namn -------------------------------------------------------------------
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail', 'googlemail', 'hotmail', 'outlook', 'live', 'msn', 'yahoo', 'icloud', 'me', 'mac',
  'telia', 'tele2', 'comhem', 'bredband', 'bahnhof', 'spray', 'passagen', 'home', 'mail', 'email',
  'protonmail', 'proton', 'aol', 'gmx', 'swipnet', 'glocalnet', 'ownit', 'tiscali', 'post',
]);

export function normalizeName(s: unknown): string {
  return stripDiacritics(String(s ?? '').normalize('NFKC').toLowerCase())
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(s: unknown): string[] {
  return normalizeName(s).split(' ').filter(t => t.length >= 3);
}

export function emailTokens(email: unknown): string[] {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at <= 0) return [];
  const local = e.slice(0, at);
  const domainLabel = e.slice(at + 1).split('.')[0] ?? '';
  const out = nameTokens(local.replace(/[._\-+\d]/g, ' '));
  if (domainLabel && !GENERIC_EMAIL_DOMAINS.has(domainLabel)) out.push(...nameTokens(domainLabel));
  return out;
}

function nameScore(target: MatchTarget, c: CaseLike): { score: number; reason: string | null } {
  const tName = normalizeName(target.name);
  const cName = normalizeName(c.customer_name);
  if (tName && cName) {
    if (tName === cName) return { score: 40, reason: 'namn' };
    const tRev = tName.split(' ').reverse().join(' ');
    if (tRev === cName && tName.includes(' ')) return { score: 35, reason: 'namn (omvänd ordning)' };
    const shorter = tName.length <= cName.length ? tName : cName;
    const longer = shorter === tName ? cName : tName;
    if (shorter.length >= 3 && ` ${longer} `.includes(` ${shorter} `)) return { score: 30, reason: 'namn (delvis)' };
  }
  const tTokens = new Set([...nameTokens(target.name), ...emailTokens(target.email)]);
  const cTokens = new Set([...nameTokens(c.customer_name), ...emailTokens(c.customer_email)]);
  let hits = 0;
  tTokens.forEach(t => { if (cTokens.has(t)) hits++; });
  if (hits > 0) return { score: Math.min(30, hits * 15), reason: hits === 1 ? 'namn (ett ord)' : 'namn (flera ord)' };
  return { score: 0, reason: null };
}

const digitsOnly = (v: unknown) => String(v ?? '').replace(/\D+/g, '');
const orderKey = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toLowerCase();

function citiesFor(addr: ParsedAddress, explicitCity: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const a = cityKeyOf(addr.city);
  const b = cityKeyOf(explicitCity);
  if (a) out.add(a);
  if (b) out.add(b);
  return out;
}

/** Poängsätt ett ärende mot ett mål. Varje signal ger en svensk motivering. */
export function scoreCase(candidate: CaseLike, target: MatchTarget): CaseScore {
  let score = 0;
  let addressScore = 0;
  const reasons: string[] = [];

  const tOrder = orderKey(target.mockfjardsOrderNumber);
  const cOrder = orderKey(candidate.order_number);
  if (tOrder && cOrder && tOrder === cOrder) { score += 100; reasons.push('ordernummer'); }

  const ta = parseAddress(target.address);
  const ca = parseAddress(candidate.address);
  if (ta.valid && ca.valid && ta.number === ca.number && lettersCompatible(ta, ca)) {
    let base = 0;
    if (ta.streetKey === ca.streetKey) { base = 70; reasons.push('adress'); }
    else {
      const minLen = Math.min(ta.streetKey.length, ca.streetKey.length);
      const limit = minLen < 6 ? 1 : 2;
      if (damerauLevenshtein(ta.streetKey, ca.streetKey) <= limit) { base = 55; reasons.push('adress (liknande stavning)'); }
    }
    if (base > 0) {
      addressScore = base;
      const tc = citiesFor(ta, target.city);
      const cc = citiesFor(ca, candidate.city);
      if (tc.size && cc.size) {
        let same = false;
        tc.forEach(x => { if (cc.has(x)) same = true; });
        if (same) { addressScore += 10; reasons.push('ort'); }
        else { addressScore -= 20; reasons.push('annan ort'); }
      }
      score += addressScore;
    }
  }

  const n = nameScore(target, candidate);
  if (n.score > 0 && n.reason) { score += n.score; reasons.push(n.reason); }

  const tp = digitsOnly(target.phone);
  const cp = digitsOnly(candidate.phone ?? (candidate as CaseLike).customer_phone);
  if (tp.length >= 7 && cp.length >= 7 && tp.slice(-7) === cp.slice(-7)) { score += 40; reasons.push('telefon'); }

  return { score, reasons, addressScore };
}

export interface RankOptions {
  /** Ta med kandidater under förslagsnivån (nivå 'none'), t.ex. för att sortera hela listor. */
  includeAll?: boolean;
  limit?: number;
  excludeIds?: Iterable<string>;
}

export function levelFor(score: number): MatchLevel {
  if (score >= AUTO_THRESHOLD) return 'auto';
  if (score >= SUGGEST_THRESHOLD) return 'suggest';
  return 'none';
}

export function matchLabel(reasons: string[]): string {
  return reasons.filter(r => r !== 'annan ort').join(' + ');
}

/** Rangordna ärenden mot ett mål. Tvetydiga topträffar blir aldrig 'auto'. */
export function rankCases<T extends CaseLike>(cases: readonly T[], target: MatchTarget, options: RankOptions = {}): RankedCase<T>[] {
  const exclude = new Set(options.excludeIds ?? []);
  const scored: RankedCase<T>[] = [];
  for (const c of cases) {
    if (exclude.has(c.id)) continue;
    const s = scoreCase(c, target);
    let score = s.score;
    if (score > 0 && c.status === 'fakturerad') score -= INVOICED_PENALTY;
    const level = levelFor(score);
    if (level === 'none' && !options.includeAll) continue;
    scored.push({ ...s, score, case: c, level, label: matchLabel(s.reasons) });
  }
  scored.sort((a, b) => b.score - a.score || String(a.case.address ?? '').localeCompare(String(b.case.address ?? ''), 'sv'));
  if (scored.length >= 2 && scored[0].level === 'auto' && scored[1].level === 'auto' && scored[0].score - scored[1].score <= AMBIGUITY_MARGIN) {
    for (const r of scored) if (r.level === 'auto') r.level = 'suggest';
  }
  return options.limit ? scored.slice(0, options.limit) : scored;
}

/** Bästa kandidat om den är på nivå auto eller suggest. */
export function bestMatch<T extends CaseLike>(cases: readonly T[], target: MatchTarget, options: RankOptions = {}): RankedCase<T> | null {
  const top = rankCases(cases, target, { ...options, includeAll: false, limit: 1 })[0];
  return top ?? null;
}

/** Hitta ärenden på samma gata + husnummer (dubblettvarning). */
export function findSameAddress<T extends CaseLike>(cases: readonly T[], address: unknown, excludeId?: string | null): T[] {
  if (!parseAddress(address).valid) return [];
  return cases.filter(c => c.id !== excludeId && sameStreetKey(c.address, address));
}

// ---- Fritextsökning (comboboxar och söklistor) -----------------------------
export function searchTokens(s: unknown): string[] {
  return stripDiacritics(String(s ?? '').normalize('NFKC').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Sant när varje sökord finns i fälten: siffror måste vara början på ett ord
 * ("6" träffar "6" och "6b" men inte "16"), bokstavsord får vara delsträngar
 * ("sopran 6" träffar "Soprangränd 6", "6 vällingby" träffar "..., Vällingby").
 */
export function matchesSearch(fields: readonly unknown[], query: string): boolean {
  const q = searchTokens(query);
  if (!q.length) return true;
  const hay = searchTokens(fields.filter(Boolean).join(' '));
  return q.every(t => /^\d/.test(t) ? hay.some(h => h.startsWith(t)) : hay.some(h => h.includes(t)));
}
