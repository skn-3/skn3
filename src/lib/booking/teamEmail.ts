import { supabase } from '@/integrations/supabase/client';
import { EMAIL_MAP } from '@/lib/constants';

/**
 * Teamets mejladress: montor_teams.email (samma fråga som useMontorTeams), annars EMAIL_MAP.
 * Kastar aldrig; okänt team ger null.
 */
export async function resolveTeamEmail(teamName: string | null | undefined): Promise<string | null> {
  if (!teamName) return null;
  try {
    const { data, error } = await (supabase as any)
      .from('montor_teams').select('id, name, email, phone, address, is_active')
      .eq('is_active', true).order('name');
    if (error) throw error;
    const row = ((data ?? []) as Array<{ name: string; email: string | null }>).find(t => t.name === teamName);
    if (row?.email) return row.email;
  } catch (e) {
    console.error('resolveTeamEmail failed:', e);
  }
  return EMAIL_MAP[teamName] || null;
}
