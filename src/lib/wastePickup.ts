// Skräphämtning (Ragn-Sells): montören begär, kontoret bokar. Ändrar aldrig ärendets status.
import { differenceInCalendarDays } from 'date-fns';
import { formatDaySv } from '@/lib/dateSv';

export const WASTE_REQUEST_STATUSES = ['montage_bokat', 'montage_pagar', 'montage_klart', 'fakturerad'] as const;
export const WASTE_OVERDUE_DAYS = 2;

export interface WasteFields {
  id?: string;
  status: string;
  address?: string | null;
  waste_pickup_requested_at?: string | null;
  waste_pickup_requested_by?: string | null;
  waste_pickup_note?: string | null;
  waste_pickup_earliest?: string | null;
  waste_pickup_booked_at?: string | null;
  waste_pickup_booked_by?: string | null;
  waste_pickup_date?: string | null;
}

export type WastePatch = Partial<Pick<WasteFields,
  'waste_pickup_requested_at' | 'waste_pickup_requested_by' | 'waste_pickup_note' | 'waste_pickup_earliest'
  | 'waste_pickup_booked_at' | 'waste_pickup_booked_by' | 'waste_pickup_date'>>;

export type WasteState = 'none' | 'requested' | 'booked';

/** Montören kan begära hämtning när montaget är bokat, pågår eller är klart. */
export function canRequestWastePickup(c: Pick<WasteFields, 'status'>): boolean {
  return (WASTE_REQUEST_STATUSES as readonly string[]).includes(c.status);
}

export function wastePickupState(c: WasteFields): WasteState {
  if (c.waste_pickup_booked_at) return 'booked';
  if (c.waste_pickup_requested_at) return 'requested';
  return 'none';
}

/** Begärd men inte bokad. */
export function needsWasteBooking(c: WasteFields): boolean {
  return wastePickupState(c) === 'requested';
}

/** Inkorgens urval: begärda men obokade, äldst först. */
export function selectOpenWastePickups<T extends WasteFields>(cases: readonly T[]): T[] {
  return cases
    .filter(needsWasteBooking)
    .sort((a, b) => new Date(a.waste_pickup_requested_at!).getTime() - new Date(b.waste_pickup_requested_at!).getTime());
}

export function wasteAgeDays(c: WasteFields, now: Date = new Date()): number | null {
  if (!c.waste_pickup_requested_at) return null;
  return Math.max(0, differenceInCalendarDays(now, new Date(c.waste_pickup_requested_at)));
}

export function isWasteOverdue(days: number | null): boolean {
  return days != null && days > WASTE_OVERDUE_DAYS;
}

export function wasteAgeLabel(days: number): string {
  if (days === 0) return 'begärd idag';
  return `begärd för ${days} ${days === 1 ? 'dag' : 'dagar'} sedan`;
}

const clean = (s?: string | null) => (s ?? '').trim() || null;

/** Kolumner som skrivs när hämtning begärs (montör eller personal). */
export function requestPatch(input: { actor: string; note?: string | null; earliest?: string | null; nowIso: string }): WastePatch {
  return {
    waste_pickup_requested_at: input.nowIso,
    waste_pickup_requested_by: input.actor,
    waste_pickup_note: clean(input.note),
    waste_pickup_earliest: clean(input.earliest),
  };
}

/** Ångra en begäran: bara begäransfälten nollställs, aldrig bokningsfälten. */
export function cancelPatch(): WastePatch {
  return {
    waste_pickup_requested_at: null,
    waste_pickup_requested_by: null,
    waste_pickup_note: null,
    waste_pickup_earliest: null,
  };
}

/** Kolumner som skrivs när kontoret bokar. */
export function bookPatch(input: { actor: string; date: string; nowIso: string }): WastePatch {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Välj hämtdag');
  return {
    waste_pickup_booked_at: input.nowIso,
    waste_pickup_booked_by: input.actor,
    waste_pickup_date: input.date,
  };
}

export function requestDescription(address: string, by: string, note?: string | null, earliest?: string | null): string {
  const n = clean(note);
  const e = clean(earliest);
  return `Skräp redo för hämtning (Ragn-Sells) hos ${address} – ${by}${n ? `: ${n}` : ''}${e ? `, tidigast ${formatDaySv(e)}` : ''}`;
}

export function bookedDescription(date: string, by: string, note?: string | null): string {
  const n = clean(note);
  return `Ragn-Sells bokad till ${formatDaySv(date)} av ${by}${n ? ` – ${n}` : ''}`;
}

/** "2 kundavstämningar och 1 skräphämtning väntar"; null när inget väntar. */
export function pendingSummary(followups: number, pickups: number): string | null {
  const parts: string[] = [];
  if (followups > 0) parts.push(`${followups} ${followups === 1 ? 'kundavstämning' : 'kundavstämningar'}`);
  if (pickups > 0) parts.push(`${pickups} ${pickups === 1 ? 'skräphämtning' : 'skräphämtningar'}`);
  if (parts.length === 0) return null;
  return `${parts.join(' och ')} väntar`;
}
