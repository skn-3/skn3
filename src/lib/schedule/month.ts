// Vy-modell för månadsvyn: veckorader, montagestaplar och antal KM/leveranser per dag.
import { addDaysIso, deliveryWeekMonday, isoWeekOf, toIso, weekDates as datesOfWeek } from './dates';
import type { ScheduleEvent } from './events';
import { packLanes, segmentsFor, type WeekSegment } from './layout';
import { UNASSIGNED_LABEL } from './layout';

export const MONTH_MAX_LANES = 4;

export interface MonthWeek { year: number; week: number; dates: string[] }

/** Veckorna (måndag–söndag) som täcker månaden (month 1–12). */
export function monthWeeks(year: number, month: number): MonthWeek[] {
  const first = toIso(new Date(year, month - 1, 1));
  const last = toIso(new Date(year, month, 0));
  const out: MonthWeek[] = [];
  let { year: wy, week } = isoWeekOf(first);
  let monday = deliveryWeekMonday(wy, week);
  while (monday <= last) {
    out.push({ year: wy, week, dates: datesOfWeek(wy, week) });
    monday = addDaysIso(monday, 7);
    ({ year: wy, week } = isoWeekOf(monday));
  }
  return out;
}

/** Föregående/nästa månad. */
export function stepMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export interface MonthBar extends WeekSegment {
  label: string;
  unassigned: boolean;
}

export interface MonthWeekModel {
  bars: MonthBar[];
  /** Antal montage som inte får plats bland de fyra stapelraderna. */
  hiddenCount: number;
  perDay: Array<{ date: string; km: number; deliveries: number }>;
}

/** "{team} · {adress}" eller "Ej tilldelat · {adress}". */
export function monthBarLabel(e: ScheduleEvent): string {
  return `${e.team || UNASSIGNED_LABEL} · ${e.address}`;
}

/**
 * Montage som staplar över sina dagar (högst MONTH_MAX_LANES rader), samt KM och leveranser
 * med exakt dag som antal per dag. Veckobaserade leveranser räknas inte per dag.
 */
export function monthWeekModel(events: readonly ScheduleEvent[], weekDates: readonly string[], maxLanes = MONTH_MAX_LANES): MonthWeekModel {
  const montage = events.filter(e => e.kind === 'montage');
  const { segments } = packLanes(montage.flatMap(e => segmentsFor(e, weekDates)));
  const bars = segments.filter(s => s.lane < maxLanes).map(s => ({ ...s, label: monthBarLabel(s.event), unassigned: !s.event.team }));
  const hidden = new Set(segments.filter(s => s.lane >= maxLanes).map(s => s.event.id));
  for (const b of bars) hidden.delete(b.event.id);
  const perDay = weekDates.map(date => ({
    date,
    km: events.filter(e => e.kind === 'km' && e.startDate === date).length,
    deliveries: events.filter(e => e.kind === 'leverans' && !e.weekBased && e.startDate === date).length,
  }));
  return { bars, hiddenCount: hidden.size, perDay };
}
