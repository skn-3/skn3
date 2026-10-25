// Datum som människor läser: "ons 3 nov", "ons 3 nov · 08:00", "Idag".
const DAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

type DateInput = string | Date | null | undefined;

export function toLocalDate(date: DateInput): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

/** "ons 3 nov"; annat år än i år: "3 nov 2025". */
export function formatDaySv(date: DateInput, now: Date = new Date()): string {
  const d = toLocalDate(date);
  if (!d) return '';
  if (d.getFullYear() !== now.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "ons 3 nov · 08:00" (tiden utelämnas om den saknas). */
export function formatDayTimeSv(date: DateInput, time?: string | null, now: Date = new Date()): string {
  const day = formatDaySv(date, now);
  if (!day) return '';
  return time ? `${day} · ${time.slice(0, 5)}` : day;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Idag" / "Imorgon" eller null. */
export function dayTagSv(date: DateInput, now: Date = new Date()): 'Idag' | 'Imorgon' | null {
  const d = toLocalDate(date);
  if (!d) return null;
  if (sameDay(d, now)) return 'Idag';
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return sameDay(d, t) ? 'Imorgon' : null;
}

/** "Idag" / "Imorgon" / annars formatDaySv. */
export function relativeDaySv(date: DateInput, now: Date = new Date()): string {
  return dayTagSv(date, now) ?? formatDaySv(date, now);
}
