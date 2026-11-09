// Kundavstämning efter klarmarkerat montage. En checklista vid sidan av
// pipelinen: den ändrar aldrig ärendets status.
import { differenceInCalendarDays } from 'date-fns';

export const FOLLOWUP_STATUSES = ['montage_klart', 'fakturerad'] as const;
export const FOLLOWUP_OVERDUE_DAYS = 3;

export interface FollowupFields {
  status: string;
  customer_followup_contacted_at?: string | null;
  customer_followup_signed_at?: string | null;
  customer_followup_done_at?: string | null;
  customer_followup_done_by?: string | null;
  status_changed_at?: string | null;
  montage_date?: string | null;
  created_at?: string | null;
}

export type FollowupPatch = {
  customer_followup_contacted_at?: string | null;
  customer_followup_signed_at?: string | null;
  customer_followup_done_at?: string | null;
  customer_followup_done_by?: string | null;
};

export type FollowupAction =
  | { kind: 'contacted'; checked: boolean }
  | { kind: 'signed'; checked: boolean }
  | { kind: 'done' }
  | { kind: 'reopen' };

/** Avstämningen gäller ärendet (montage klart eller fakturerat). */
export function followupApplies(c: Pick<FollowupFields, 'status'>): boolean {
  return (FOLLOWUP_STATUSES as readonly string[]).includes(c.status);
}

/** Öppen avstämning = gäller ärendet och är inte klarmarkerad. */
export function needsCustomerFollowup(c: FollowupFields): boolean {
  return followupApplies(c) && !c.customer_followup_done_at;
}

export function canCompleteFollowup(c: FollowupFields): boolean {
  return !!c.customer_followup_contacted_at && !!c.customer_followup_signed_at;
}

function sortKey(c: FollowupFields): number {
  const iso = c.status_changed_at || c.montage_date || c.created_at;
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** Inkorgens urval: öppna avstämningar, äldst först. */
export function selectOpenFollowups<T extends FollowupFields>(cases: readonly T[]): T[] {
  return cases.filter(needsCustomerFollowup).sort((a, b) => sortKey(a) - sortKey(b));
}

/** Dagar sedan montaget klarmarkerades (status_changed_at). */
export function followupAgeDays(c: FollowupFields, now: Date = new Date()): number | null {
  const iso = c.status_changed_at || c.montage_date || c.created_at;
  if (!iso) return null;
  return Math.max(0, differenceInCalendarDays(now, new Date(iso)));
}

export function isFollowupOverdue(days: number | null): boolean {
  return days != null && days > FOLLOWUP_OVERDUE_DAYS;
}

export function followupAgeLabel(days: number): string {
  if (days === 0) return 'Montaget klarmarkerades idag';
  return `${days} ${days === 1 ? 'dag' : 'dagar'} sedan montaget klarmarkerades`;
}

/** Exakt vilka kolumner som skrivs för varje tryck. */
export function followupPatch(action: FollowupAction, actor: string, nowIso: string): FollowupPatch {
  switch (action.kind) {
    case 'contacted':
      return { customer_followup_contacted_at: action.checked ? nowIso : null };
    case 'signed':
      return { customer_followup_signed_at: action.checked ? nowIso : null };
    case 'done':
      return { customer_followup_done_at: nowIso, customer_followup_done_by: actor };
    case 'reopen':
      return { customer_followup_done_at: null, customer_followup_done_by: null };
  }
}

/** Värdena före ändringen, för att kunna backa en optimistisk uppdatering. */
export function followupRollback(c: FollowupFields, patch: FollowupPatch): FollowupPatch {
  const out: FollowupPatch = {};
  for (const k of Object.keys(patch) as (keyof FollowupPatch)[]) out[k] = c[k] ?? null;
  return out;
}
