// Enkel märkning för A-orderns beskrivning. Texten lagras som vanlig text i
// databasen med två markörer som sätts via knapparna i formuläret:
//   **text**  → fet
//   ==text==  → röd
// Markörerna kan kombineras (**==text==**). En markör utan avslutande partner
// på samma rad visas som vanlig text, så "Obs==" eller "a**b" förstör inget.

export type RichSegment = { text: string; bold: boolean; red: boolean };
export type RichLine = RichSegment[];

const BOLD = '**';
const RED = '==';
const SPLIT = /(\*\*|==)/;

export function hasRichMarkup(input: string | null | undefined): boolean {
  return /\*\*|==/.test(String(input ?? ''));
}

export function parseRichText(input: string | null | undefined): RichLine[] {
  return String(input ?? '').split(/\r?\n/).map(parseLine);
}

function parseLine(line: string): RichLine {
  const parts = line.split(SPLIT);
  // Bara markörer med en partner räknas; en udda sista markör blir vanlig text.
  const boldTotal = parts.filter((p) => p === BOLD).length;
  const redTotal = parts.filter((p) => p === RED).length;
  const boldUsable = boldTotal - (boldTotal % 2);
  const redUsable = redTotal - (redTotal % 2);

  const segs: RichSegment[] = [];
  let bold = false;
  let red = false;
  let boldSeen = 0;
  let redSeen = 0;

  const push = (text: string) => {
    if (!text) return;
    const last = segs[segs.length - 1];
    if (last && last.bold === bold && last.red === red) last.text += text;
    else segs.push({ text, bold, red });
  };

  for (const p of parts) {
    if (p === BOLD) {
      boldSeen++;
      if (boldSeen <= boldUsable) bold = !bold;
      else push(p);
    } else if (p === RED) {
      redSeen++;
      if (redSeen <= redUsable) red = !red;
      else push(p);
    } else {
      push(p);
    }
  }
  return segs;
}

/** Texten utan markörer — för listor, sökning och trunkerade visningar. */
export function stripRichText(input: string | null | undefined): string {
  return parseRichText(input)
    .map((line) => line.map((s) => s.text).join(''))
    .join('\n');
}

/**
 * Slår på/av en markör runt markeringen [start, end) i text.
 * Returnerar ny text och var markeringen ska hamna efteråt.
 */
export function toggleRichMarker(
  text: string,
  start: number,
  end: number,
  marker: '**' | '==',
): { text: string; selectionStart: number; selectionEnd: number } {
  const m = marker.length;
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  // Markeringen ligger inuti markörer → ta bort dem
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text: before.slice(0, -m) + selected + after.slice(m),
      selectionStart: start - m,
      selectionEnd: end - m,
    };
  }
  // Markeringen inkluderar markörerna → ta bort dem
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, -m);
    return { text: before + inner + after, selectionStart: start, selectionEnd: start + inner.length };
  }
  // Annars: lägg på markörer. Utan markering hamnar markören mellan dem.
  return {
    text: before + marker + selected + marker + after,
    selectionStart: start + m,
    selectionEnd: end + m,
  };
}