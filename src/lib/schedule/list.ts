// Vy-modell för listvyn: veckans dagar som grupper.
import { isoWeekOf } from './dates';
import { compareEvents, type ScheduleEvent } from './events';
import { KIND_LABELS, dayGroupTitle, placeLabel } from './labels';
import { LOGISTICS_LABEL } from './layout';

export interface ListItem {
  key: string;
  event: ScheduleEvent;
  /** "07:00", "heldag" eller "v.47" för veckobaserad leverans. */
  timeLabel: string;
  kindLabel: string;
  place: string;
  team: string;
}

export interface ListDay { date: string; title: string; isToday: boolean; items: ListItem[] }

function toItem(e: ScheduleEvent, date: string): ListItem {
  const logistics = e.kind === 'leverans' || e.kind === 'hamtning';
  return {
    key: `${e.id}-${date}`,
    event: e,
    timeLabel: e.weekBased ? `v.${isoWeekOf(e.startDate).week}` : e.time ?? 'heldag',
    kindLabel: KIND_LABELS[e.kind],
    place: placeLabel(e.address, e.city),
    team: logistics ? LOGISTICS_LABEL : e.team ?? 'Ej tilldelat',
  };
}

/** Heldag och veckobaserat först, därefter klockslag; sedan samma ordning som tavlan. */
function byTime(a: ListItem, b: ListItem): number {
  const ta = a.event.time ?? '';
  const tb = b.event.time ?? '';
  return ta.localeCompare(tb) || compareEvents(a.event, b.event);
}

/**
 * En grupp per dag. Flerdagarsmontage syns varje dag de upptar. Veckobaserade leveranser
 * (exakt dag saknas) visas en gång, på veckans första dag i listan.
 */
export function buildListDays(events: readonly ScheduleEvent[], weekDates: readonly string[], today: string): ListDay[] {
  return weekDates.map((date, i) => {
    const items = events
      .filter(e => (e.weekBased ? (i === 0 ? e.dates.some(d => weekDates.includes(d)) : false) : e.dates.includes(date)))
      .map(e => toItem(e, date))
      .sort(byTime);
    return { date, title: dayGroupTitle(date), isToday: date === today, items };
  });
}
