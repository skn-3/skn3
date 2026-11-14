// Veckotavlans rader och segment. Ingen bokning får döljas.
import type { ScheduleEvent } from './events';
import { compareEvents } from './events';

export type WeekRowKind = 'logistik' | 'team' | 'ej_tilldelat';

export interface WeekSegment {
  event: ScheduleEvent;
  /** 0 = måndag … 6 = söndag. */
  start: number;
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
}

export interface WeekRow {
  key: string;
  kind: WeekRowKind;
  label: string;
  team: string | null;
  segments: WeekSegment[];
  laneCount: number;
}

export const LOGISTICS_LABEL = 'Logistik';
export const UNASSIGNED_LABEL = 'Ej tilldelat';

function isLogistics(e: ScheduleEvent) {
  return e.kind === 'leverans' || e.kind === 'hamtning';
}

/** Segment för en händelse inom veckan; sammanhängande dagar bildar ett segment. */
export function segmentsFor(event: ScheduleEvent, weekDates: readonly string[]): Omit<WeekSegment, 'lane'>[] {
  const idx = event.dates.map(d => weekDates.indexOf(d)).filter(i => i >= 0).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else if (!last || last[last.length - 1] !== i) runs.push([i]);
  }
  return runs.map(run => {
    const first = weekDates[run[0]];
    const lastDate = weekDates[run[run.length - 1]];
    return {
      event,
      start: run[0],
      span: run.length,
      continuesBefore: event.dates.some(d => d < first),
      continuesAfter: event.dates.some(d => d > lastDate),
    };
  });
}

/** Packar segment i så få lanes som möjligt (girig tilldelning sorterad på start). */
export function packLanes(segs: Omit<WeekSegment, 'lane'>[]): { segments: WeekSegment[]; laneCount: number } {
  const sorted = [...segs].sort((a, b) => a.start - b.start || b.span - a.span || compareEvents(a.event, b.event));
  const laneEnds: number[] = [];
  const segments = sorted.map(s => {
    let lane = laneEnds.findIndex(end => end < s.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(-1); }
    laneEnds[lane] = s.start + s.span - 1;
    return { ...s, lane };
  });
  return { segments, laneCount: laneEnds.length };
}

/**
 * Rader: Logistik, teamen i given ordning, team med bokningar i veckan som saknas i listan
 * (i bokstavsordning), sist Ej tilldelat (KM och montage utan team).
 */
export function layoutWeek(events: readonly ScheduleEvent[], weekDates: readonly string[], teamNames: readonly string[]): WeekRow[] {
  const buckets = new Map<string, Omit<WeekSegment, 'lane'>[]>();
  const push = (key: string, segs: Omit<WeekSegment, 'lane'>[]) => {
    if (!segs.length) return;
    buckets.set(key, [...(buckets.get(key) ?? []), ...segs]);
  };
  const extraTeams = new Set<string>();
  for (const e of events) {
    const segs = segmentsFor(e, weekDates);
    if (!segs.length) continue;
    if (isLogistics(e)) push('logistik', segs);
    else if (!e.team) push('ej_tilldelat', segs);
    else {
      if (!teamNames.includes(e.team)) extraTeams.add(e.team);
      push(`team:${e.team}`, segs);
    }
  }
  const row = (key: string, kind: WeekRowKind, label: string, team: string | null): WeekRow => {
    const { segments, laneCount } = packLanes(buckets.get(key) ?? []);
    return { key, kind, label, team, segments, laneCount };
  };
  const teams = [...teamNames.filter((t, i) => teamNames.indexOf(t) === i), ...[...extraTeams].sort((a, b) => a.localeCompare(b, 'sv'))];
  return [
    row('logistik', 'logistik', LOGISTICS_LABEL, null),
    ...teams.map(t => row(`team:${t}`, 'team', t, t)),
    row('ej_tilldelat', 'ej_tilldelat', UNASSIGNED_LABEL, null),
  ];
}
