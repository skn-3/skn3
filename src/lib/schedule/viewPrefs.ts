// Vyval för Schema, sparat per användare och enhet.
export type ScheduleViewMode = 'vecka' | 'manad' | 'lista';

const VIEWS: readonly ScheduleViewMode[] = ['vecka', 'manad', 'lista'];

export function viewStorageKey(user: string): string {
  return `smartklimat_schema_vy_${user}`;
}

export function parseStoredView(raw: string | null | undefined): ScheduleViewMode | null {
  return VIEWS.includes(raw as ScheduleViewMode) ? (raw as ScheduleViewMode) : null;
}

/** På telefon finns ingen veckotavla: Vecka blir Lista. */
export function effectiveView(view: ScheduleViewMode | null, isPhone: boolean): ScheduleViewMode {
  const v = view ?? (isPhone ? 'lista' : 'vecka');
  return isPhone && v === 'vecka' ? 'lista' : v;
}

/** Vyerna i den segmenterade kontrollen (Vecka visas inte på telefon). */
export function availableViews(isPhone: boolean): ScheduleViewMode[] {
  return isPhone ? ['manad', 'lista'] : [...VIEWS];
}

export const VIEW_LABELS: Record<ScheduleViewMode, string> = { vecka: 'Vecka', manad: 'Månad', lista: 'Lista' };
