// Datumlogik för schemat. Arbetar med ISO-datumsträngar (YYYY-MM-DD) och bygger lokala
// datum med new Date(år, månad - 1, dag); 'YYYY-MM-DD' tolkas aldrig med new Date(sträng).
// Svenska helgdagar hanteras inte (se AGENTS.md).

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const UNITS_PER_DAY = 5;
export const MAX_MONTAGE_DAYS = 30;

export function isIsoDate(iso: unknown): iso is string {
  if (typeof iso !== 'string') return false;
  const m = ISO_RE.exec(iso);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Lokalt datum (midnatt) för en ISO-datumsträng. Kastar vid ogiltig sträng. */
export function parseIso(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Ogiltigt datum: ${iso}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Datumdelen (lokal tid) av en tidsstämpel eller ett ISO-datum; null om ogiltigt. */
export function isoDateOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.slice(0, 10);
  if (value.length === 10) return isIsoDate(head) ? head : null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : toIso(d);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIso(iso);
  return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** Antal dagar från a till b (b - a), oberoende av sommartid. */
export function daysBetween(a: string, b: string): number {
  const da = parseIso(a);
  const db = parseIso(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / DAY_MS);
}

/** 0 = måndag … 6 = söndag. */
export function weekdayIndex(iso: string): number {
  return (parseIso(iso).getDay() + 6) % 7;
}

export function isWeekend(iso: string): boolean {
  return weekdayIndex(iso) >= 5;
}

/** ISO-vecka (vecka 1 innehåller årets första torsdag). */
export function isoWeekOf(iso: string): { year: number; week: number } {
  const thursday = addDaysIso(iso, 3 - weekdayIndex(iso));
  const year = parseIso(thursday).getFullYear();
  const firstMonday = deliveryWeekMonday(year, 1);
  return { year, week: Math.floor(daysBetween(firstMonday, thursday) / 7) + 1 };
}

/** Måndagen i ISO-vecka `week` år `year`. */
export function deliveryWeekMonday(year: number, week: number): string {
  const jan4 = toIso(new Date(year, 0, 4));
  const mondayWeek1 = addDaysIso(jan4, -weekdayIndex(jan4));
  return addDaysIso(mondayWeek1, (week - 1) * 7);
}

/** Sju ISO-datum, måndag till söndag. */
export function weekDates(year: number, week: number): string[] {
  const monday = deliveryWeekMonday(year, week);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
}

function normalizeDays(days: number | null | undefined): number {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 1) return 1;
  return Math.min(MAX_MONTAGE_DAYS, Math.floor(days));
}

/**
 * Dagarna montaget upptar. Startdagen är alltid dag 1 (även en helgdag); följande dagar är
 * nästkommande vardagar. days null eller mindre än 1 räknas som 1.
 */
export function montageDates(start: string, days: number | null | undefined): string[] {
  const n = normalizeDays(days);
  const out = [start];
  let cur = start;
  while (out.length < n) {
    cur = addDaysIso(cur, 1);
    if (!isWeekend(cur)) out.push(cur);
  }
  return out;
}

export function montageEnd(start: string, days: number | null | undefined): string {
  const d = montageDates(start, days);
  return d[d.length - 1];
}

/** Föreslaget antal arbetsdagar utifrån antal enheter (1–30). */
export function suggestedMontageDays(units: number | null | undefined): number {
  if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0) return 1;
  return Math.min(MAX_MONTAGE_DAYS, Math.max(1, Math.ceil(units / UNITS_PER_DAY)));
}
