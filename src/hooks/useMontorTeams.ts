import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EMAIL_MAP, MONTOR_PHONES } from '@/lib/constants';

export interface MontorTeam { id: string; name: string; email: string | null; phone: string | null; is_active: boolean }

// Enda källan för montörsteam. Statiska kartor i constants.ts är endast fallback för äldre data.
export function useMontorTeams() {
  const q = useQuery({
    queryKey: ['montor-teams-active'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('montor_teams').select('id, name, email, phone, is_active')
        .eq('is_active', true).order('name');
      if (error) throw error;
      return (data ?? []) as MontorTeam[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const teams = q.data ?? [];
  const names = useMemo(() => teams.map((t) => t.name), [teams]);
  const emailOf = (name: string | null | undefined) =>
    (name && (teams.find((t) => t.name === name)?.email || EMAIL_MAP[name])) || '';
  const phoneOf = (name: string | null | undefined) =>
    (name && (teams.find((t) => t.name === name)?.phone || MONTOR_PHONES[name])) || '';
  return { teams, names, emailOf, phoneOf, isLoading: q.isLoading };
}
