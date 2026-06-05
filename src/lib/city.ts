// Delade ort-hjälpare. Används för både gruppering/visning och datastädning.
// Två lager:
//   - normalizeCityKey(raw) → kanonisk nyckel i gemener (för jämförelse/gruppering)
//   - cityDisplayName(raw)  → korrekt visningsnamn (Title Case + officiell stavning vid match)

/** Officiella stavningar. Utöka fritt — matchas via gemen-jämförelse. */
export const KNOWN_CITIES = [
  'Nykvarn', 'Tullinge', 'Lidingö', 'Stockholm', 'Danderyd', 'Ekerö', 'Vällingby',
  'Järfälla', 'Spånga', 'Norsborg', 'Rönninge', 'Södertälje', 'Huddinge', 'Täby',
  'Solna', 'Sundbyberg', 'Bromma', 'Nacka', 'Tyresö', 'Haninge', 'Botkyrka',
  'Sollentuna', 'Upplands Väsby', 'Upplands-Väsby', 'Kungsängen', 'Hässelby',
  'Vallentuna', 'Åkersberga', 'Vaxholm', 'Saltsjöbaden', 'Älvsjö', 'Bandhagen',
  'Hägersten', 'Skärholmen', 'Skarpnäck', 'Farsta', 'Enskede', 'Bagarmossen',
] as const;

/** Felstavningar/varianter → korrekt ort (allt i gemener). Lätt att utöka. */
export const CITY_ALIASES: Record<string, string> = {
  'hösselby': 'hässelby',
  'hesselby': 'hässelby',
  'jarfalla': 'järfälla',
  'jaerfalla': 'järfälla',
  'kungsangen': 'kungsängen',
  'upplands vasby': 'upplands väsby',
  'upplands-vasby': 'upplands väsby',
};

/** Sista delen efter komma i en adresssträng. */
export function extractCityFromAddress(address: string | null | undefined): string {
  if (!address) return '';
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts[parts.length - 1];
  return parts[0] || '';
}

function stripDigits(s: string): string {
  return s.replace(/\d+/g, '').trim();
}

/**
 * Kanonisk nyckel i gemener för gruppering/jämförelse.
 * Trimmar, kollapsar mellanslag, tar bort skiljetecken i kant, slår upp alias.
 */
export function normalizeCityKey(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).normalize('NFC').trim();
  // Plocka bort siffror (postnummer) som ibland kletas på i adressdelen
  s = stripDigits(s);
  // Kollapsa whitespace
  s = s.replace(/\s+/g, ' ');
  // Ta bort skiljetecken i kanten
  s = s.replace(/^[\s.,;:()\-–—]+|[\s.,;:()\-–—]+$/g, '');
  const lower = s.toLowerCase();
  if (!lower) return '';
  if (CITY_ALIASES[lower]) return CITY_ALIASES[lower];
  return lower;
}

/** Title-case som respekterar svenska tecken och bindestreck. */
function titleCaseSv(input: string): string {
  return input
    .split(/(\s+|-)/) // behåll separatorer
    .map(part => {
      if (/^\s+$/.test(part) || part === '-') return part;
      if (!part) return part;
      const first = part.charAt(0).toLocaleUpperCase('sv-SE');
      const rest = part.slice(1).toLocaleLowerCase('sv-SE');
      return first + rest;
    })
    .join('');
}

/** Korrekt visningsnamn (officiell stavning om känd ort, annars Title Case). */
export function cityDisplayName(raw: string | null | undefined): string {
  const key = normalizeCityKey(raw);
  if (!key) return '';
  const match = KNOWN_CITIES.find(c => c.toLocaleLowerCase('sv-SE') === key);
  if (match) return match;
  return titleCaseSv(key);
}

/** Bekvämlighet: hämta kanonisk visningsort från ett ärende. */
export function getCaseCityDisplay(c: { city?: string | null; address: string | null | undefined }): string {
  const raw = c.city && c.city.trim() ? c.city : extractCityFromAddress(c.address);
  return cityDisplayName(raw);
}

/** Bekvämlighet: hämta kanonisk nyckel från ett ärende. */
export function getCaseCityKey(c: { city?: string | null; address: string | null | undefined }): string {
  const raw = c.city && c.city.trim() ? c.city : extractCityFromAddress(c.address);
  return normalizeCityKey(raw);
}
