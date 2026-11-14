// Rader i kalendertabellerna. Tabellerna finns i databasen först när utkastet godkänts och
// saknas därför i den genererade typen; typerna samlas här.
import type { CalendarClient } from '@/lib/calendarFeed';

export interface CalendarConnectionRow {
  user_name: string;
  last_fetched_at: string | null;
  last_client: CalendarClient | string | null;
  fetch_count?: number;
  guide_sent_at?: string | null;
  guide_sent_count?: number;
}

export interface CalendarSettingsRow {
  id: boolean;
  popup_enabled: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

export type OverviewKind = 'montor' | 'seller' | 'coordinator' | 'team_utan_inloggning';

export interface OverviewRow {
  name: string;
  kind: OverviewKind;
  has_email: boolean;
  connected: boolean;
  last_fetched_at: string | null;
  last_client: string | null;
  guide_sent_at: string | null;
  guide_sent_count: number;
}
