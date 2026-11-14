// Typutökning för schema och bokning. Nya kolumner (cases.montage_days) finns i databasen
// först när utkastet godkänts; src/integrations/supabase/types.ts känner inte till dem
// förrän dess. Samla alla sådana fält här i stället för att sprida "as any".

/** Fält som ännu inte finns i den genererade typen för cases. Saknas kolumnen blir värdet undefined. */
export interface ScheduleExtension {
  /** Antal arbetsdagar som montaget tar; null/undefined betyder 1. */
  montage_days?: number | null;
}

/** De fält schemamodulerna läser från ett ärende. Allt utom id och status är frivilligt. */
export interface ScheduleCase extends ScheduleExtension {
  id: string;
  status: string;
  address?: string | null;
  city?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  seller?: string | null;
  team?: string | null;
  km_team?: string | null;
  km_date?: string | null;
  km_time?: string | null;
  montage_date?: string | null;
  montage_time?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  delivery_week?: number | null;
  delivery_year?: number | null;
  waste_pickup_date?: string | null;
  units?: number | null;
  status_changed_at?: string | null;
  created_at?: string | null;
}

/** Ett ärende (eller uppdatering) med typutökningen. */
export type WithSchedule<T> = T & ScheduleExtension;

/** Lägger till typutökningen på en rad som lästs med select('*'). Saknade fält blir null. */
export function withScheduleFields<T extends object>(row: T): WithSchedule<T> {
  const r = row as WithSchedule<T>;
  return { ...r, montage_days: r.montage_days ?? null };
}

/** Giltigt antal arbetsdagar (1–30) eller null. */
export function montageDaysOf(c: { montage_days?: unknown } | null | undefined): number | null {
  const v = c?.montage_days;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 30) return null;
  return v;
}
