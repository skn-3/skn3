// Regler för kalkylens lokala kopia på enheten (localStorage). Själva läsningen och skrivningen sker i komponentlagret.
import type { OfferMeta } from './offerMeta';

export const LOCAL_DRAFT_PREFIX = 'n3prenad-kalkyl:';
export const LOCAL_DRAFT_MAX_AGE_DAYS = 14;
const DAY = 86_400_000;

/** Nyckeln innehåller användaren, så att en lokal version aldrig visas för någon annan som loggar in på enheten. */
export function localDraftKey(user: string, offerId: string | null): string {
  return `${LOCAL_DRAFT_PREFIX}${encodeURIComponent(user.trim() || 'okand')}:${offerId ?? 'ny'}`;
}

/** Personnummer sparas aldrig lokalt. */
export function stripLocalMeta<T extends { meta: OfferMeta }>(draft: T): T {
  return { ...draft, meta: { ...draft.meta, customer_personnummer: '' } };
}

/** Äldre än 14 dagar, eller utan läsbart datum. */
export function isLocalDraftExpired(savedAt: string | null | undefined, now: Date | string, maxAgeDays = LOCAL_DRAFT_MAX_AGE_DAYS): boolean {
  const t = savedAt ? Date.parse(savedAt) : NaN;
  if (Number.isNaN(t)) return true;
  const n = typeof now === 'string' ? Date.parse(now) : now.getTime();
  return n - t > maxAgeDays * DAY;
}

/**
 * Lokala kalkylnycklar som ska tas bort: gamla nycklar utan användare (från etapp 2, kan innehålla personnummer),
 * oläsbara och utgångna versioner.
 */
export function localDraftKeysToRemove(entries: [key: string, raw: string | null][], now: Date | string): string[] {
  const out: string[] = [];
  for (const [key, raw] of entries) {
    if (!key.startsWith(LOCAL_DRAFT_PREFIX)) continue;
    const rest = key.slice(LOCAL_DRAFT_PREFIX.length);
    if (!rest.includes(':')) { out.push(key); continue; }
    let savedAt: string | null = null;
    try { savedAt = (JSON.parse(raw ?? 'null') as { saved_at?: string } | null)?.saved_at ?? null; } catch { savedAt = null; }
    if (isLocalDraftExpired(savedAt, now)) out.push(key);
  }
  return out;
}
