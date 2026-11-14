// Vy-modell för kontorets veckotavla: filter, rader, leveransveckor, sammanfattning,
// krockchip och placeringsläget. Ren logik ovanpå events/layout/conflicts/placement.
import { isWeekend, isoWeekOf } from './dates';
import type { ScheduleEvent, ScheduleKind } from './events';
import { layoutWeek, packLanes, type WeekRow, type WeekSegment } from './layout';
import { teamLoad, type ConflictResult } from './conflicts';
import { checkPlacement, type PlacementResult } from './placement';
import type { QueueItem } from './queues';
import type { ScheduleCase } from './types';
import { dayLabel, dayShort, placeLabel } from './labels';

export const ALL_KINDS: readonly ScheduleKind[] = ['montage', 'km', 'leverans', 'hamtning'];

export interface ScheduleFilter {
  kinds: readonly ScheduleKind[];
  /** Tom lista = alla team. */
  teams: readonly string[];
  /** Tom lista = alla säljare. */
  sellers: readonly string[];
}

export const EMPTY_FILTER: ScheduleFilter = { kinds: ALL_KINDS, teams: [], sellers: [] };

export function filterEvents(events: readonly ScheduleEvent[], f: ScheduleFilter): ScheduleEvent[] {
  return events.filter(e =>
    f.kinds.includes(e.kind)
    && (!f.teams.length || (!!e.team && f.teams.includes(e.team)))
    && (!f.sellers.length || (!!e.seller && f.sellers.includes(e.seller))));
}

/** Filterknappens text: "Alla team", "Samy", "3 team", "2 säljare", "2 team · 1 säljare". */
export function filterLabel(f: Pick<ScheduleFilter, 'teams' | 'sellers'>): string {
  const t = f.teams.length;
  const s = f.sellers.length;
  if (!t && !s) return 'Alla team';
  if (t && !s) return t === 1 ? f.teams[0] : `${t} team`;
  if (s && !t) return s === 1 ? f.sellers[0] : `${s} säljare`;
  return `${t} team · ${s} säljare`;
}

/** Teamraderna som visas: valda team (i given ordning) eller alla. */
export function visibleTeams(teamNames: readonly string[], f: Pick<ScheduleFilter, 'teams'>): string[] {
  const sorted = [...teamNames].sort((a, b) => a.localeCompare(b, 'sv'));
  return f.teams.length ? sorted.filter(t => f.teams.includes(t)) : sorted;
}

// ---------------------------------------------------------------------------
// Sammanfattning och krockar

export interface WeekSummary { todayMontage: number; todayKm: number; weekMontage: number; weekKm: number; weekDeliveries: number }

export function weekSummary(events: readonly ScheduleEvent[], weekDates: readonly string[], today: string): WeekSummary {
  const inWeek = (e: ScheduleEvent) => e.dates.some(d => weekDates.includes(d));
  return {
    todayMontage: events.filter(e => e.kind === 'montage' && e.state !== 'klar' && e.dates.includes(today)).length,
    todayKm: events.filter(e => e.kind === 'km' && e.startDate === today).length,
    weekMontage: events.filter(e => e.kind === 'montage' && inWeek(e)).length,
    weekKm: events.filter(e => e.kind === 'km' && inWeek(e)).length,
    weekDeliveries: events.filter(e => e.kind === 'leverans' && inWeek(e)).length,
  };
}

/** "Idag: 2 montage pågår · 1 KM. Veckan: 7 montage · 4 KM · 3 leveranser." */
export function summaryText(s: WeekSummary): string {
  const lev = `${s.weekDeliveries} ${s.weekDeliveries === 1 ? 'leverans' : 'leveranser'}`;
  return `Idag: ${s.todayMontage} montage pågår · ${s.todayKm} KM. Veckan: ${s.weekMontage} montage · ${s.weekKm} KM · ${lev}.`;
}

/** Krockchip för veckan: "1 krock: Alex NBD fre". eventId = första krockande bokningen. */
export function conflictChip(conflicts: ConflictResult, weekDates: readonly string[]): { text: string; eventId: string } | null {
  const inWeek = conflicts.pairs
    .map(p => ({ p, day: p.dates.find(d => weekDates.includes(d)) }))
    .filter((x): x is { p: ConflictResult['pairs'][number]; day: string } => !!x.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!inWeek.length) return null;
  const n = inWeek.length;
  const { p, day } = inWeek[0];
  return { text: `${n} ${n === 1 ? 'krock' : 'krockar'}: ${p.a.team} ${dayShort(day)}`, eventId: p.a.id };
}

/** Fem kapacitetsstreck måndag–fredag: true de dagar teamet har montage. */
export function capacityBars(events: readonly ScheduleEvent[], weekDates: readonly string[], team: string): boolean[] {
  return weekDates.filter(d => !isWeekend(d)).map(d => events.some(e => e.kind === 'montage' && e.team === team && e.dates.includes(d)));
}

// ---------------------------------------------------------------------------
// Rader med leveransveckor

export interface DeliveryGroup { week: number; year: number; events: ScheduleEvent[] }

export interface BoardRow extends WeekRow {
  /** Syntetiskt händelse-id -> leveransvecka (veckobaserade leveranser i Logistik). */
  groups: Record<string, DeliveryGroup>;
}

export function deliveryGroupId(year: number, week: number): string {
  return `leveransvecka-${year}-${week}`;
}

/** "Leveransvecka 47" och "3 ärenden utan exakt dag". */
export function deliveryGroupLabels(g: DeliveryGroup): { title: string; sub: string } {
  const k = g.events.length;
  return { title: `Leveransvecka ${g.week}`, sub: `${k} ${k === 1 ? 'ärende' : 'ärenden'} utan exakt dag` };
}

/** Slår ihop veckobaserade leveranser i en rad till en stapel per vecka och packar om lanes. */
export function groupWeekDeliveries(row: WeekRow): BoardRow {
  const keep: Omit<WeekSegment, 'lane'>[] = [];
  const byWeek = new Map<string, { seg: Omit<WeekSegment, 'lane'>; group: DeliveryGroup }>();
  for (const s of row.segments) {
    const { lane: _lane, ...seg } = s;
    if (s.event.kind !== 'leverans' || !s.event.weekBased) { keep.push(seg); continue; }
    const { year, week } = isoWeekOf(s.event.startDate);
    const id = deliveryGroupId(year, week);
    const hit = byWeek.get(id);
    if (hit) {
      if (!hit.group.events.some(e => e.id === s.event.id)) hit.group.events.push(s.event);
      continue;
    }
    const synthetic: ScheduleEvent = { ...s.event, id, caseId: '', address: `Leveransvecka ${week}`, city: null, customerName: '', customerPhone: null, units: null, seller: null };
    byWeek.set(id, { seg: { ...seg, event: synthetic }, group: { week, year, events: [s.event] } });
  }
  const { segments, laneCount } = packLanes([...keep, ...[...byWeek.values()].map(v => v.seg)]);
  const groups: Record<string, DeliveryGroup> = {};
  for (const [id, v] of byWeek) groups[id] = v.group;
  return { ...row, segments, laneCount, groups };
}

export interface BoardInput {
  events: readonly ScheduleEvent[];
  weekDates: readonly string[];
  teamNames: readonly string[];
  filter: ScheduleFilter;
  /** Placerar en KM just nu: raden Ej tilldelat visas även när den är tom. */
  placingKm?: boolean;
}

/** Veckotavlans rader: Logistik, teamen i namnordning, extra team, Ej tilldelat (vid behov). */
export function buildBoardRows({ events, weekDates, teamNames, filter, placingKm }: BoardInput): BoardRow[] {
  const visible = filterEvents(events, filter);
  return layoutWeek(visible, weekDates, visibleTeams(teamNames, filter))
    .filter(r => r.kind !== 'ej_tilldelat' || r.segments.length > 0 || !!placingKm)
    .map(groupWeekDeliveries);
}

/** Underraden för ett team: "{n} av 5 dagar montage · {k} KM". */
export function teamRowLoad(events: readonly ScheduleEvent[], weekDates: readonly string[], team: string) {
  return teamLoad(events, weekDates, team);
}

// ---------------------------------------------------------------------------
// Placeringsläget

export interface PlacementCellsInput {
  rows: readonly WeekRow[];
  weekDates: readonly string[];
  caseData: ScheduleCase;
  kind: 'km' | 'montage';
  days?: number | null;
  /** Alla händelser (ofiltrerade), så att krockar mot dolda bokningar också syns. */
  events: readonly ScheduleEvent[];
  today: string;
  allowPast?: boolean;
}

/** Värdering per rad och dag. Logistik är aldrig mål; Ej tilldelat bara för KM. */
export function placementCells(input: PlacementCellsInput): Record<string, PlacementResult[]> {
  const out: Record<string, PlacementResult[]> = {};
  for (const row of input.rows) {
    if (row.kind === 'logistik') continue;
    if (row.kind === 'ej_tilldelat' && input.kind !== 'km') continue;
    out[row.key] = input.weekDates.map(date => checkPlacement({
      caseData: input.caseData, kind: input.kind, date, days: input.days, team: row.team,
      events: input.events, today: input.today, allowPast: input.allowPast,
    }));
  }
  return out;
}

/** Raden ovanför tavlan under placeringen. */
export function placementPrompt(item: Pick<QueueItem, 'kind' | 'address' | 'city' | 'deliveryLabel' | 'deliveryStart'>, weekDates: readonly string[], today: string): { lead: string; hint: string } {
  const lead = `Placera ${item.kind === 'km' ? 'KM' : 'montage'}: ${placeLabel(item.address, item.city)}.`;
  const start = item.deliveryStart;
  if (item.kind === 'montage' && item.deliveryLabel && start && start > today && start >= weekDates[0]) {
    const day = dayLabel(start, today);
    if (start > weekDates[weekDates.length - 1]) return { lead, hint: `${item.deliveryLabel}. Tidigast ${day}, byt vecka med pilarna.` };
    return { lead, hint: `${item.deliveryLabel}. Tryck på en dag från ${day}.` };
  }
  return { lead, hint: 'Tryck på en dag i schemat.' };
}

/** Aria-etiketten för en målcell: "Boka Samy ons 18 nov". */
export function targetCellLabel(rowLabel: string, date: string, today: string): string {
  return `Boka ${rowLabel} ${dayLabel(date, today)}`;
}
