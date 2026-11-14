// Vilka ärenden montören själv får boka. Samma villkor används av ärendesidans bokningsblock
// (MontorCaseDetail) och av "Att boka" i montörens Schema; duplicera dem inte.
import type { ScheduleCase } from './types';

/** Blocket "Boka kontrollmätning": ärendet väntar på KM. */
export function canMontorBookKm(c: Pick<ScheduleCase, 'status'>): boolean {
  return c.status === 'vantar_km';
}

/** canBookMontage: godkänt, i produktion eller levererat, och utan montagedatum. */
export function canMontorBookMontage(c: Pick<ScheduleCase, 'status' | 'montage_date'>): boolean {
  return ['godkand', 'i_produktion', 'leverans_klar'].includes(c.status) && !c.montage_date;
}
