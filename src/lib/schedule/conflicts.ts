// Krockar inom ett team och teamets belastning en vecka.
import type { ScheduleEvent } from './events';
import { isWeekend } from './dates';

export interface ConflictPair {
  kind: 'montage' | 'km';
  a: ScheduleEvent;
  b: ScheduleEvent;
  /** Gemensamma dagar. */
  dates: string[];
}

export interface ConflictResult {
  pairs: ConflictPair[];
  /** Händelse-id -> krockarna den ingår i. */
  byEvent: Map<string, ConflictPair[]>;
}

/**
 * Samma team med två montage som delar minst en dag, eller två KM med samma datum och samma
 * klockslag (KM utan klockslag krockar aldrig). Händelser utan team krockar aldrig.
 */
export function findConflicts(events: readonly ScheduleEvent[]): ConflictResult {
  const pairs: ConflictPair[] = [];
  const relevant = events.filter(e => e.team && (e.kind === 'montage' || e.kind === 'km'));
  for (let i = 0; i < relevant.length; i++) {
    for (let j = i + 1; j < relevant.length; j++) {
      const a = relevant[i];
      const b = relevant[j];
      if (a.kind !== b.kind || a.team !== b.team || a.caseId === b.caseId) continue;
      if (a.kind === 'montage') {
        const shared = a.dates.filter(d => b.dates.includes(d));
        if (shared.length) pairs.push({ kind: 'montage', a, b, dates: shared });
      } else if (a.startDate === b.startDate && a.time && a.time === b.time) {
        pairs.push({ kind: 'km', a, b, dates: [a.startDate] });
      }
    }
  }
  const byEvent = new Map<string, ConflictPair[]>();
  for (const p of pairs) {
    for (const id of [p.a.id, p.b.id]) byEvent.set(id, [...(byEvent.get(id) ?? []), p]);
  }
  return { pairs, byEvent };
}

/** montageDays = antal av veckans vardagar med montage för teamet; kmCount = antal KM i veckan. */
export function teamLoad(events: readonly ScheduleEvent[], weekDates: readonly string[], team: string): { montageDays: number; kmCount: number } {
  const weekdays = weekDates.filter(d => !isWeekend(d));
  const own = events.filter(e => e.team === team);
  const montageDays = weekdays.filter(d => own.some(e => e.kind === 'montage' && e.dates.includes(d))).length;
  const kmCount = own.filter(e => e.kind === 'km' && weekDates.includes(e.startDate)).length;
  return { montageDays, kmCount };
}
