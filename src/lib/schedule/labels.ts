// Etiketter och texter som schemat visar. Ren logik; svensk formatering bygger på dateSv.
import { formatDaySv } from '@/lib/dateSv';
import { isoWeekOf, parseIso, weekdayIndex } from './dates';
import type { ScheduleEvent, ScheduleKind } from './events';

const DAYS_SHORT = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'];
const DAYS_LONG = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

export const KIND_LABELS: Record<ScheduleKind, string> = { montage: 'Montage', km: 'KM', leverans: 'Leverans', hamtning: 'Hämtning' };

/** "mån" … "sön". */
export function dayShort(iso: string): string {
  return DAYS_SHORT[weekdayIndex(iso)];
}

/** Dagens nummer i månaden, t.ex. "16". */
export function dayNumber(iso: string): string {
  return String(parseIso(iso).getDate());
}

/** "tisdag 17 november". */
export function dayGroupTitle(iso: string): string {
  const d = parseIso(iso);
  return `${DAYS_LONG[weekdayIndex(iso)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** "november 2026" (month 1–12). */
export function monthTitle(year: number, month: number): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** "v.47". */
export function weekChip(week: number): string {
  return `v.${week}`;
}

/** "16–22 november"; över månadsskifte "30 nov – 6 dec". */
export function weekRangeLabel(weekDates: readonly string[]): string {
  const a = parseIso(weekDates[0]);
  const b = parseIso(weekDates[weekDates.length - 1]);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_LONG[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

/** "ons 18 nov" (annat år än i dag: "18 nov 2027"). */
export function dayLabel(iso: string, today: string): string {
  return formatDaySv(iso, parseIso(today));
}

/** "ons 18 nov", "ons 18 – tors 19 nov" eller "fre 27 nov – tis 1 dec". */
export function dateRangeLabel(dates: readonly string[], today: string): string {
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return dayLabel(first, today);
  const a = parseIso(first);
  const b = parseIso(last);
  const yearNow = parseIso(today).getFullYear();
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    const year = a.getFullYear() !== yearNow ? ` ${a.getFullYear()}` : '';
    return `${dayShort(first)} ${a.getDate()} – ${dayShort(last)} ${b.getDate()} ${MONTHS_SHORT[a.getMonth()]}${year}`;
  }
  if (a.getFullYear() === yearNow && b.getFullYear() === yearNow) {
    return `${dayShort(first)} ${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${dayShort(last)} ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
  }
  return `${dayLabel(first, today)} – ${dayLabel(last, today)}`;
}

/** Bokningens "När": "mån 16 – ons 18 nov, 07:00"; veckobaserad leverans "v.47, exakt dag saknas". */
export function whenLabel(event: ScheduleEvent, today: string): string {
  if (event.weekBased) return `v.${isoWeekOf(event.startDate).week}, exakt dag saknas`;
  const range = dateRangeLabel(event.dates, today);
  return event.time ? `${range}, ${event.time}` : range;
}

const withCity = (city: string | null) => (city ? ` · ${city}` : '');

/** Rad två på en bokning i veckotavlan. */
export function eventLine(event: ScheduleEvent): string {
  switch (event.kind) {
    case 'montage': {
      const head = event.state === 'klar' ? 'Montage klart' : 'Montage';
      const units = event.units ? ` · ${event.units} enh` : '';
      return `${head}${units}${withCity(event.city)}`;
    }
    case 'km':
      return `KM ${event.time ?? 'heldag'}${withCity(event.city)}`;
    case 'leverans':
      return `Leverans${event.time ? ` ${event.time}` : ''}${withCity(event.city)}`;
    case 'hamtning':
      return `Ragn-Sells hämtar${withCity(event.city)}`;
  }
}

/** "Adress, Ort" (ort utelämnas när den saknas). */
export function placeLabel(address: string, city: string | null | undefined): string {
  return [address, city].filter(Boolean).join(', ');
}

/** "{n} av 5 dagar montage · {k} KM". */
export function teamLoadLabel(load: { montageDays: number; kmCount: number }): string {
  return `${load.montageDays} av 5 dagar montage · ${load.kmCount} KM`;
}

/** Förnamnet, t.ex. för "säljare Daniel". */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "2 KM". */
export function kmCountLabel(n: number): string {
  return `${n} KM`;
}

/** "1 leverans" / "2 leveranser". */
export function deliveryCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'leverans' : 'leveranser'}`;
}

/** "1 dag" / "3 dagar". */
export function daysWord(n: number): string {
  return `${n} ${n === 1 ? 'dag' : 'dagar'}`;
}
