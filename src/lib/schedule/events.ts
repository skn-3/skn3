// Bygger schemats händelser ur ärenden. Inga ekonomifält: montörvyn använder samma modul.
import { deliveryWeekMonday, addDaysIso, isIsoDate, montageDates } from './dates';
import { montageDaysOf, type ScheduleCase } from './types';

export type ScheduleKind = 'km' | 'montage' | 'leverans' | 'hamtning';
export type ScheduleState = 'bokad' | 'pagar' | 'klar';

export interface ScheduleEvent {
  /** caseId + kind, t.ex. "abc-montage". */
  id: string;
  caseId: string;
  kind: ScheduleKind;
  /** KM: km_team. Montage: team. Leverans/hämtning: ärendets montageteam (raden är alltid Logistik). */
  team: string | null;
  startDate: string;
  endDate: string;
  /** Dagarna händelsen upptar, i ordning. */
  dates: string[];
  /** HH:MM eller null. */
  time: string | null;
  weekBased: boolean;
  state: ScheduleState;
  status: string;
  address: string;
  city: string | null;
  customerName: string;
  customerPhone: string | null;
  units: number | null;
  seller: string | null;
  /** Antal arbetsdagar (bara montage, annars 1). */
  days: number;
}

const KIND_ORDER: Record<ScheduleKind, number> = { leverans: 0, hamtning: 1, km: 2, montage: 3 };
const KM_DONE = new Set(['km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat', 'montage_pagar', 'montage_klart', 'fakturerad']);
const DELIVERED = new Set(['leverans_klar', 'montage_bokat', 'montage_pagar', 'montage_klart', 'fakturerad']);

export function montageState(status: string): ScheduleState {
  if (status === 'montage_pagar') return 'pagar';
  if (status === 'montage_klart' || status === 'fakturerad') return 'klar';
  return 'bokad';
}

export function kmState(status: string): ScheduleState {
  return KM_DONE.has(status) ? 'klar' : 'bokad';
}

function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function base(c: ScheduleCase) {
  return {
    caseId: c.id,
    status: c.status,
    address: c.address ?? '',
    city: c.city ?? null,
    customerName: c.customer_name ?? '',
    customerPhone: c.customer_phone || null,
    units: typeof c.units === 'number' ? c.units : null,
    seller: c.seller ?? null,
  };
}

function make(c: ScheduleCase, kind: ScheduleKind, dates: string[], rest: Pick<ScheduleEvent, 'team' | 'time' | 'weekBased' | 'state' | 'days'>): ScheduleEvent {
  return { id: `${c.id}-${kind}`, kind, startDate: dates[0], endDate: dates[dates.length - 1], dates, ...base(c), ...rest };
}

export function compareEvents(a: ScheduleEvent, b: ScheduleEvent): number {
  return a.startDate.localeCompare(b.startDate)
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
    || a.address.localeCompare(b.address, 'sv')
    || a.id.localeCompare(b.id);
}

/** Händelser för KM, montage, leverans och hämtning. Pausade ärenden tas inte med. */
export function buildScheduleEvents(cases: readonly ScheduleCase[]): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  for (const c of cases) {
    if (!c || c.status === 'pausad') continue;
    if (isIsoDate(c.km_date)) {
      out.push(make(c, 'km', [c.km_date], { team: c.km_team || null, time: hhmm(c.km_time), weekBased: false, state: kmState(c.status), days: 1 }));
    }
    if (isIsoDate(c.montage_date)) {
      const days = montageDaysOf(c) ?? 1;
      out.push(make(c, 'montage', montageDates(c.montage_date, days), { team: c.team || null, time: hhmm(c.montage_time), weekBased: false, state: montageState(c.status), days }));
    }
    const deliveryState: ScheduleState = DELIVERED.has(c.status) ? 'klar' : 'bokad';
    if (isIsoDate(c.delivery_date)) {
      out.push(make(c, 'leverans', [c.delivery_date], { team: c.team || null, time: hhmm(c.delivery_time), weekBased: false, state: deliveryState, days: 1 }));
    } else if (c.delivery_week && c.delivery_year) {
      const monday = deliveryWeekMonday(c.delivery_year, c.delivery_week);
      const dates = [0, 1, 2, 3, 4].map(i => addDaysIso(monday, i));
      out.push(make(c, 'leverans', dates, { team: c.team || null, time: null, weekBased: true, state: deliveryState, days: 1 }));
    }
    if (isIsoDate(c.waste_pickup_date)) {
      out.push(make(c, 'hamtning', [c.waste_pickup_date], { team: c.team || null, time: null, weekBased: false, state: 'bokad', days: 1 }));
    }
  }
  return out.sort(compareEvents);
}
