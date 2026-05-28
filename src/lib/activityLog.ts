import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/lib/constants';

// GDPR-NOT: activity_log innehåller medarbetares handlingar (vem gjorde vad och när).
// Måste ingå i bolagets GDPR-dokumentation. Överväg retention-policy (12 mån).

const STORAGE_KEY = 'smartklimat_role';

function getCurrentUser(): UserRole | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as UserRole) : null;
  } catch {
    return null;
  }
}

export type ActivityCategory =
  | 'auth'
  | 'case'
  | 'deviation'
  | 'order'
  | 'system'
  | 'data';

export interface LogActivityParams {
  action: string;
  category: ActivityCategory;
  description: string;
  case_id?: string;
  deviation_id?: string;
  metadata?: Record<string, any>;
  /** Override actor (used for login when role isn't set yet) */
  actor?: { name: string; role?: string };
}

/**
 * Fire-and-forget activity logging. NEVER blocks the main flow.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const user = getCurrentUser();
    const actorName = params.actor?.name ?? user?.name ?? 'anonymous';
    const actorRole = params.actor?.role ?? user?.type ?? 'unknown';

    await supabase.from('activity_log').insert({
      actor_name: actorName,
      actor_role: actorRole,
      action: params.action,
      category: params.category,
      description: params.description,
      case_id: params.case_id ?? null,
      deviation_id: params.deviation_id ?? null,
      metadata: params.metadata ?? {},
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      // ip_address sätts från server-side om vi loggar via edge function
    });
  } catch (err) {
    // Loggning får ALDRIG blockera huvudflödet
    console.error('Failed to log activity:', err);
  }
}
