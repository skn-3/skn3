// Vy-modeller för montörens Schema. Ren logik; inga ekonomifält (ScheduleEvent saknar dem).
import { addDaysIso, daysBetween, isoDateOf, isoWeekOf, weekDates } from './dates';
import { buildScheduleEvents, compareEvents, type ScheduleEvent } from './events';
import { KIND_LABELS, dayGroupTitle, dayNumber, dayShort, placeLabel } from './labels';
import { canMontorBookKm, canMontorBookMontage } from './montorBooking';
import type { ScheduleCase } from './types';

/** Teamet en händelse hör till i montörens schema: montage via team, KM via km_team (team som reserv). */
function montorTeamOf(e: ScheduleEvent, c: ScheduleCase | undefined): string | null {
  if (e.kind === 'km') return c?.km_team || c?.team || null;
  return e.team;
}

/** KM och montage för teamet (team null = alla, t.ex. admin utan filter). Leveranser och hämtningar visas inte. */
export function montorScheduleEvents(cases: readonly ScheduleCase[], team: string | null): ScheduleEvent[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return buildScheduleEvents(cases).filter((e) => {
    if (e.kind !== 'km' && e.kind !== 'montage') return false;
    return team === null || montorTeamOf(e, byId.get(e.caseId)) === team;
  });
}

const NEUTER = ['inga', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio'];
const COMMON = ['inga', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio'];
const word = (n: number, list: string[]) => (n <= 10 ? list[n] : String(n));

/** "ett montage och två kontrollmätningar"; inget: "inget bokat". */
export function dayCountPhrase(montage: number, km: number): string {
  const parts: string[] = [];
  if (montage > 0) parts.push(`${word(montage, NEUTER)} montage`);
  if (km > 0) parts.push(`${word(km, COMMON)} ${km === 1 ? 'kontrollmätning' : 'kontrollmätningar'}`);
  return parts.length ? parts.join(' och ') : 'inget bokat';
}

export interface StripDay {
  date: string;
  short: string;
  number: string;
  dots: Array<'montage' | 'km'>;
  isToday: boolean;
  ariaLabel: string;
}

export const MAX_DOTS = 3;

/** Veckoremsan (mån–sön) för veckan som innehåller vald dag. */
export function weekStrip(selected: string, events: readonly ScheduleEvent[], today: string): StripDay[] {
  const { year, week } = isoWeekOf(selected);
  return weekDates(year, week).map((date) => {
    const on = events.filter((e) => e.dates.includes(date));
    const montage = on.filter((e) => e.kind === 'montage').length;
    const km = on.filter((e) => e.kind === 'km').length;
    const dots = [...Array(montage).fill('montage'), ...Array(km).fill('km')].slice(0, MAX_DOTS) as Array<'montage' | 'km'>;
    return { date, short: dayShort(date), number: dayNumber(date), dots, isToday: date === today, ariaLabel: `${dayGroupTitle(date)}, ${dayCountPhrase(montage, km)}` };
  });
}

export function stepWeek(selected: string, delta: number): string {
  return addDaysIso(selected, delta * 7);
}

export function statusChipLabel(e: Pick<ScheduleEvent, 'kind' | 'state'>): string {
  if (e.kind === 'km') return 'KM';
  if (e.state === 'pagar') return 'Montage pågår';
  if (e.state === 'klar') return 'Montage klart';
  return 'Montage bokat';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Idag från 07:00 · dag 2 av 3", "09:00" eller "Heldag". */
export function cardTimeLine(e: Pick<ScheduleEvent, 'kind' | 'time' | 'days' | 'dates'>, selected: string, today: string): string {
  let t = e.time ? (e.kind === 'montage' ? `från ${e.time}` : e.time) : 'heldag';
  t = selected === today ? `Idag ${t}` : cap(t);
  if (e.kind === 'montage' && e.days > 1) t += ` · dag ${e.dates.indexOf(selected) + 1} av ${e.days}`;
  return t;
}

/** "{ort} · {n} enheter · {kund}" (tomma delar utelämnas). */
export function cardSubLine(e: Pick<ScheduleEvent, 'city' | 'units' | 'customerName'>): string {
  return [e.city, typeof e.units === 'number' && e.units > 0 ? `${e.units} enheter` : null, e.customerName || null].filter(Boolean).join(' · ');
}

export interface DayCard { event: ScheduleEvent; chip: string; timeLine: string; sub: string }

export function dayCards(selected: string, events: readonly ScheduleEvent[], today: string): DayCard[] {
  return events
    .filter((e) => e.dates.includes(selected))
    .sort(compareEvents)
    .map((event) => ({ event, chip: statusChipLabel(event), timeLine: cardTimeLine(event, selected, today), sub: cardSubLine(event) }));
}

export const UPCOMING_LIMIT = 10;

export interface UpcomingRow { event: ScheduleEvent; day: string; time: string; place: string; chip: string }

/** De tio nästa bokningarna som börjar efter vald dag. */
export function upcomingRows(events: readonly ScheduleEvent[], selected: string, limit = UPCOMING_LIMIT): UpcomingRow[] {
  return events
    .filter((e) => e.startDate > selected)
    .sort(compareEvents)
    .slice(0, limit)
    .map((event) => ({
      event,
      day: `${dayShort(event.startDate)} ${dayNumber(event.startDate)}`,
      time: event.time ?? 'heldag',
      place: `${placeLabel(event.address, event.city)}${event.kind === 'montage' && event.units ? ` · ${event.units} enh` : ''}`,
      chip: KIND_LABELS[event.kind],
    }));
}

export interface ToBookRow { caseData: ScheduleCase; kind: 'km' | 'montage'; waitingDays: number; text: string }

/** Teamets ärenden som montören själv får boka (samma villkor som ärendesidan), äldst först. */
export function montorToBook(cases: readonly ScheduleCase[], team: string | null, today: string): ToBookRow[] {
  const rows: ToBookRow[] = [];
  for (const c of cases) {
    if (c.status === 'pausad') continue;
    let kind: 'km' | 'montage' | null = null;
    if (canMontorBookKm(c) && (team === null || (c.km_team || c.team) === team)) kind = 'km';
    else if (canMontorBookMontage(c) && (team === null || c.team === team)) kind = 'montage';
    if (!kind) continue;
    const since = isoDateOf(c.status_changed_at ?? c.created_at ?? null);
    const waitingDays = since ? Math.max(0, daysBetween(since, today)) : 0;
    rows.push({ caseData: c, kind, waitingDays, text: `${placeLabel(c.address ?? '', c.city)} · ${kind === 'km' ? 'KM' : 'Montage'} · väntat ${waitingDays} d` });
  }
  return rows.sort((a, b) => b.waitingDays - a.waitingDays || (a.caseData.address ?? '').localeCompare(b.caseData.address ?? '', 'sv'));
}

export const MONTOR_SCHEDULE_TEXTS = {
  emptyDay: 'Inget bokat den här dagen.',
  upcomingTitle: 'Kommande',
  upcomingEmpty: 'Inget mer bokat.',
  toBookTitle: 'Att boka',
  bookButton: 'Boka dag',
} as const;
