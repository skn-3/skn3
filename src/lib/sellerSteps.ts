/**
 * Obligatoriska säljarsteg på signerade ordrar: timjustering och leveransvecka.
 * Gäller statusspannet nedan, utom Gotlandsärenden (externt montage).
 */

export const SELLER_STEP_STATUSES = ['vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande', 'godkand'];

export interface SellerSteps {
  applicable: boolean;
  hoursDone: boolean;
  deliveryDone: boolean;
  /** true när kravet gäller och något steg saknas */
  incomplete: boolean;
}

export function sellerStepsFor(c: any): SellerSteps {
  const applicable = !!c && !c.is_gotland && SELLER_STEP_STATUSES.includes(c.status);
  if (!applicable) return { applicable: false, hoursDone: true, deliveryDone: true, incomplete: false };
  const hoursDone = c.hours_confirmed_at != null;
  const deliveryDone = c.delivery_week != null;
  return { applicable: true, hoursDone, deliveryDone, incomplete: !hoursDone || !deliveryDone };
}

/** Måndagen i angiven ISO-vecka. */
export function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const d = new Date(jan4);
  d.setDate(jan4.getDate() - dow + 1 + (week - 1) * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** ISO-vecka och veckoår för ett datum. */
export function isoWeekOf(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const dm = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

export interface WeekOption { week: number; year: number; value: string; label: string }

/** De kommande N ISO-veckorna, formaterade "v.NN · DD mån – DD mån". */
export function upcomingWeekOptions(count = 26, from: Date = new Date()): WeekOption[] {
  const { week, year } = isoWeekOf(from);
  let start = isoWeekStart(year, week);
  const out: WeekOption[] = [];
  for (let i = 0; i < count; i++) {
    const monday = new Date(start);
    monday.setDate(start.getDate() + i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const iso = isoWeekOf(monday);
    out.push({
      week: iso.week,
      year: iso.year,
      value: `${iso.year}-${iso.week}`,
      label: `v.${String(iso.week).padStart(2, '0')} · ${dm(monday)} – ${dm(sunday)}`,
    });
  }
  return out;
}
