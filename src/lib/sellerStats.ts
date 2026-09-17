/**
 * Säljstatistik: endast ärenden med en riktig säljare ska räknas.
 * Ärenden utan säljare (null/tom) eller med 'Okänd' (t.ex. efterregistrerade
 * ärenden från utbetalningsimporten) exkluderas från all säljstatistik.
 */
export function hasRealSeller(c: { seller?: string | null } | null | undefined): boolean {
  const s = (c?.seller ?? '').trim();
  if (!s) return false;
  return s.toLowerCase() !== 'okänd';
}
