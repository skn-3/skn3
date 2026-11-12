import type { ColorSystem, Kulor } from './types';

// Startpalett. Hex-värdena är ungefärliga skärmfärger för att visa en provbit,
// inte exakta kulörer – kunden ska alltid se en fysisk färgprovkarta före beslut.
export const KULOR_PALETTE: Kulor[] = [
  { system: 'NCS', code: 'S 0500-N', name: 'Vit', hex: '#F4F3EF' },
  { system: 'NCS', code: 'S 0502-Y', name: 'Varmvit', hex: '#F3F0E6' },
  { system: 'NCS', code: 'S 1002-Y', name: 'Äggskal', hex: '#E6E1D3' },
  { system: 'NCS', code: 'S 1005-Y20R', name: 'Ljus sand', hex: '#E8DCC6' },
  { system: 'NCS', code: 'S 2005-Y20R', name: 'Greige', hex: '#CFC3AD' },
  { system: 'NCS', code: 'S 3005-Y20R', name: 'Lin', hex: '#B5A892' },
  { system: 'NCS', code: 'S 2002-Y', name: 'Varmgrå', hex: '#CDCAC0' },
  { system: 'NCS', code: 'S 3000-N', name: 'Mellangrå', hex: '#B4B4B2' },
  { system: 'NCS', code: 'S 2010-G30Y', name: 'Ljus salvia', hex: '#BEC9AE' },
  { system: 'NCS', code: 'S 4010-G30Y', name: 'Salvia', hex: '#8E9A80' },
  { system: 'NCS', code: 'S 2010-B', name: 'Ljus dimblå', hex: '#B7C6CE' },
  { system: 'NCS', code: 'S 4020-B', name: 'Dimblå', hex: '#7B98A9' },
  { system: 'NCS', code: 'S 2020-Y30R', name: 'Ockra ljus', hex: '#D6B98C' },
  { system: 'NCS', code: 'S 3020-Y80R', name: 'Terrakotta', hex: '#BD8E7C' },
  { system: 'NCS', code: 'S 5040-Y80R', name: 'Faluröd', hex: '#8E3B2E', dark: true },
  { system: 'NCS', code: 'S 7502-B', name: 'Skiffer', hex: '#4C5154', dark: true },
  { system: 'RAL', code: 'RAL 9010', name: 'Renvit', hex: '#F1ECE1' },
  { system: 'RAL', code: 'RAL 7035', name: 'Ljusgrå', hex: '#C5C7C4' },
  { system: 'RAL', code: 'RAL 7043', name: 'Trafikgrå B', hex: '#4E5451', dark: true },
  { system: 'RAL', code: 'RAL 7016', name: 'Antracitgrå', hex: '#383E42', dark: true },
  { system: 'RAL', code: 'RAL 9005', name: 'Svart', hex: '#0E0E10', dark: true },
  { system: 'RAL', code: 'RAL 8004', name: 'Kopparbrun', hex: '#8F4E35', dark: true },
  { system: 'RAL', code: 'RAL 8017', name: 'Chokladbrun', hex: '#442F29', dark: true },
  { system: 'RAL', code: 'RAL 3009', name: 'Oxidröd', hex: '#6D342D', dark: true },
];

const BY_CODE = new Map(KULOR_PALETTE.map(k => [k.code, k]));

// NCS: svarthet + kulörthet (4 siffror) och kulörton: N, Y/R/B/G eller t.ex. Y20R.
const NCS_RE = /^(?:NCS\s*)?S?\s*(\d{2})(\d{2})\s*-?\s*(N|[YRBG](?:\d{2}[YRBG])?)$/i;
const RAL_RE = /^(?:RAL\s*)?([1-9]\d{3})$/i;
const NEXT_HUE: Record<string, string> = { Y: 'R', R: 'B', B: 'G', G: 'Y' };

function parseNcs(raw: string): string | null {
  const m = NCS_RE.exec(raw);
  if (!m) return null;
  const s = Number(m[1]);
  const c = Number(m[2]);
  const hue = m[3].toUpperCase();
  if (s + c > 100) return null;
  if (hue === 'N') { if (c !== 0) return null; }
  else {
    if (c === 0) return null;
    if (hue.length > 1) {
      const from = hue[0]; const pct = Number(hue.slice(1, 3)); const to = hue[3];
      if (NEXT_HUE[from] !== to || pct < 1 || pct > 99) return null;
    }
  }
  return `S ${m[1]}${m[2]}-${hue}`;
}

function parseRal(raw: string): string | null {
  const m = RAL_RE.exec(raw);
  return m ? `RAL ${m[1]}` : null;
}

/**
 * Normaliserar och validerar en kulörkod. Ogiltig kod ger null; giltig men okänd kod ger
 * en Kulor utan hex. "7016" tolkas som RAL bara när system är RAL.
 */
export function parseKulor(text: string | null | undefined, system?: ColorSystem): Kulor | null {
  const raw = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  let code: string | null = null;
  let sys: ColorSystem | null = null;
  const looksRal = /^RAL\b/i.test(raw);
  if (system === 'RAL' || (!system && looksRal)) {
    code = parseRal(raw); sys = 'RAL';
  } else if (system === 'NCS' || !system) {
    code = parseNcs(raw); sys = 'NCS';
  }
  if (!code || !sys) return null;
  const known = BY_CODE.get(code);
  return known ? { ...known } : { system: sys, code };
}
