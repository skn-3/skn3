// Köerna "Att boka" (KM, montage) och "Saknar datum".
import { formatDayMonthSv } from '@/lib/dateSv';
import { addDaysIso, daysBetween, deliveryWeekMonday, isIsoDate, isoDateOf, parseIso, suggestedMontageDays } from './dates';
import { montageDaysOf, type ScheduleCase } from './types';

export type QueueName = 'km' | 'montage' | 'datum';

export interface QueueItem {
  caseId: string;
  queue: QueueName;
  kind: 'km' | 'montage';
  status: string;
  address: string;
  city: string | null;
  customerName: string;
  units: number | null;
  seller: string | null;
  /** Förvalt team: km_team för KM, team för montage. */
  team: string | null;
  waitingDays: number;
  /** "Levererad v.45", "Leverans v.48", "Leverans 18 nov" eller null. */
  deliveryLabel: string | null;
  /** Föreslaget antal arbetsdagar (bara montage). */
  suggestedDays: number | null;
  /** Väntar sedan (ISO-datum), för sortering. */
  waitingSince: string | null;
  /** Leveransens första dag (ISO-datum), för sortering. */
  deliveryStart: string | null;
}

export interface Queues {
  km: QueueItem[];
  montage: QueueItem[];
  datum: QueueItem[];
}

const MONTAGE_QUEUE = new Set(['godkand', 'i_produktion', 'leverans_klar']);

function waitingSince(c: ScheduleCase): string | null {
  return isoDateOf(c.status_changed_at) ?? isoDateOf(c.created_at);
}

export function deliveryStartOf(c: ScheduleCase): string | null {
  if (isIsoDate(c.delivery_date)) return c.delivery_date;
  if (c.delivery_week && c.delivery_year) return deliveryWeekMonday(c.delivery_year, c.delivery_week);
  return null;
}

export function deliveryLabelOf(c: ScheduleCase, today: string): string | null {
  const now = parseIso(today);
  if (isIsoDate(c.delivery_date)) {
    const delivered = c.status === 'leverans_klar' || c.delivery_date < today;
    return `${delivered ? 'Levererad' : 'Leverans'} ${formatDayMonthSv(c.delivery_date, now)}`;
  }
  if (c.delivery_week && c.delivery_year) {
    const sunday = addDaysIso(deliveryWeekMonday(c.delivery_year, c.delivery_week), 6);
    const delivered = c.status === 'leverans_klar' || sunday < today;
    const year = c.delivery_year !== now.getFullYear() ? ` ${c.delivery_year}` : '';
    return `${delivered ? 'Levererad' : 'Leverans'} v.${c.delivery_week}${year}`;
  }
  return null;
}

function item(c: ScheduleCase, queue: QueueName, kind: 'km' | 'montage', today: string): QueueItem {
  const since = waitingSince(c);
  return {
    caseId: c.id,
    queue,
    kind,
    status: c.status,
    address: c.address ?? '',
    city: c.city ?? null,
    customerName: c.customer_name ?? '',
    units: typeof c.units === 'number' ? c.units : null,
    seller: c.seller ?? null,
    team: (kind === 'km' ? c.km_team : c.team) || null,
    waitingDays: since ? Math.max(0, daysBetween(since, today)) : 0,
    deliveryLabel: deliveryLabelOf(c, today),
    suggestedDays: kind === 'montage' ? (montageDaysOf(c) ?? suggestedMontageDays(c.units)) : null,
    waitingSince: since,
    deliveryStart: deliveryStartOf(c),
  };
}

/** Äldst väntan först; saknat datum sist. */
function byWaiting(a: QueueItem, b: QueueItem): number {
  return (a.waitingSince ?? '9999-12-31').localeCompare(b.waitingSince ?? '9999-12-31')
    || a.address.localeCompare(b.address, 'sv')
    || a.caseId.localeCompare(b.caseId);
}

function byMontage(a: QueueItem, b: QueueItem): number {
  const delivered = Number(b.status === 'leverans_klar') - Number(a.status === 'leverans_klar');
  return delivered
    || (a.deliveryStart ?? '9999-12-31').localeCompare(b.deliveryStart ?? '9999-12-31')
    || byWaiting(a, b);
}

export function buildQueues(cases: readonly ScheduleCase[], today: string): Queues {
  const km: QueueItem[] = [];
  const montage: QueueItem[] = [];
  const datum: QueueItem[] = [];
  for (const c of cases) {
    if (!c || c.status === 'pausad') continue;
    if (c.status === 'vantar_km' && !c.km_date) km.push(item(c, 'km', 'km', today));
    else if (MONTAGE_QUEUE.has(c.status) && !c.montage_date) montage.push(item(c, 'montage', 'montage', today));
    else if (c.status === 'km_bokad' && !c.km_date) datum.push(item(c, 'datum', 'km', today));
    else if ((c.status === 'montage_bokat' || c.status === 'montage_pagar') && !c.montage_date) datum.push(item(c, 'datum', 'montage', today));
  }
  return { km: km.sort(byWaiting), montage: montage.sort(byMontage), datum: datum.sort(byWaiting) };
}
