// Kontroll innan en KM eller ett montage läggs på en dag. Svenska skäl för UI:t.
import { formatDaySv } from '@/lib/dateSv';
import { canEnterStatus } from '@/lib/statusRules';
import { addDaysIso, deliveryWeekMonday, isIsoDate, isoWeekOf, isWeekend, montageDates, parseIso } from './dates';
import type { ScheduleEvent } from './events';
import type { ScheduleCase } from './types';

export type PlacementLevel = 'ok' | 'warn' | 'blocked';

export interface PlacementInput {
  caseData: ScheduleCase;
  kind: 'km' | 'montage';
  date: string;
  days?: number | null;
  team?: string | null;
  events: readonly ScheduleEvent[];
  today: string;
  /** Tillåt passerade dagar (kön "Saknar datum"). */
  allowPast?: boolean;
}

export interface PlacementResult {
  level: PlacementLevel;
  reasons: string[];
}

export function checkPlacement(input: PlacementInput): PlacementResult {
  const { caseData, kind, date, days, events, today, allowPast } = input;
  const team = input.team || null;
  const blocked: string[] = [];
  const warn: string[] = [];
  const now = parseIso(today);

  if (!isIsoDate(date)) return { level: 'blocked', reasons: ['Ogiltigt datum'] };
  if (date < today && !allowPast) blocked.push('Dagen har passerat');

  if (kind === 'montage') {
    const hasDelivery = !!(caseData.delivery_date || caseData.delivery_week);
    if (!team) blocked.push('Montage kräver ett team');
    // Leveransspärren ägs av statusRules; utan team gäller dess skäl bara saknad leverans.
    const check = canEnterStatus('montage_bokat', { ...caseData, team, montage_date: date });
    if (!check.ok && (team || !hasDelivery)) blocked.push(check.reason || 'Förutsättning saknas');

    if (isIsoDate(caseData.delivery_date)) {
      if (date < caseData.delivery_date) blocked.push(`Före leveransen ${formatDaySv(caseData.delivery_date, now)}`);
    } else if (caseData.delivery_week) {
      const year = caseData.delivery_year || isoWeekOf(today).year;
      const monday = deliveryWeekMonday(year, caseData.delivery_week);
      const sunday = addDaysIso(monday, 6);
      if (date < monday) blocked.push(`Före leveransveckan v.${caseData.delivery_week}`);
      else if (date <= sunday) warn.push(`Leveransen är planerad till v.${caseData.delivery_week}, exakt dag saknas`);
    }
  }

  if (isWeekend(date)) warn.push('Helgdag');

  if (kind === 'montage' && team) {
    const busy = new Set<string>();
    for (const d of montageDates(date, days)) {
      const taken = events.some(e => e.kind === 'montage' && e.team === team && e.caseId !== caseData.id && e.dates.includes(d));
      if (taken && !busy.has(d)) {
        busy.add(d);
        warn.push(`${team} har redan montage ${formatDaySv(d, now)}`);
      }
    }
  }

  const reasons = [...blocked, ...warn];
  return { level: blocked.length ? 'blocked' : warn.length ? 'warn' : 'ok', reasons };
}
