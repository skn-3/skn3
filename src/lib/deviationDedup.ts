/**
 * Dubblettspärr för avvikelser som montörer rapporterar.
 * Samma ärende + samma rapportör + samma beskrivning inom fönstret räknas som samma avvikelse,
 * så att ett nytt tryck på "Skapa ärende" efter ett fel inte skapar en ny rad.
 */
export const DEVIATION_DEDUP_WINDOW_MS = 15 * 60 * 1000;

export interface DeviationDedupCandidate {
  id: string;
  case_id: string | null;
  created_by: string;
  description: string;
  created_at: string;
  image_urls?: string[] | null;
}

export function normalizeDeviationDescription(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Returnerar den senaste befintliga avvikelsen som räknas som dubblett, annars null. */
export function findDuplicateDeviation<T extends DeviationDedupCandidate>(
  existing: T[],
  input: { case_id: string; created_by: string; description: string },
  now: Date = new Date(),
  windowMs: number = DEVIATION_DEDUP_WINDOW_MS,
): T | null {
  const desc = normalizeDeviationDescription(input.description);
  if (!desc) return null;
  const cutoff = now.getTime() - windowMs;
  const matches = existing.filter(d => {
    const t = new Date(d.created_at).getTime();
    return (
      d.case_id === input.case_id &&
      d.created_by === input.created_by &&
      normalizeDeviationDescription(d.description) === desc &&
      Number.isFinite(t) &&
      t >= cutoff &&
      t <= now.getTime() + 60_000
    );
  });
  if (matches.length === 0) return null;
  return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}
