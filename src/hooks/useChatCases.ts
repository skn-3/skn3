import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRole } from '@/hooks/useRole';

export interface ChatCase { id: string; address: string; customer_name: string; city: string | null; status: string }
export function useChatCases(ids: string[]) {
  const { role } = useRole();
  const sortedIds = [...new Set(ids)].sort();
  const source = role?.type === 'montor' ? 'cases_montor' : 'cases';
  return useQuery({
    queryKey: ['chat-cases', sortedIds, role?.name, source],
    enabled: !!role && sortedIds.length > 0,
    staleTime: 60000,
    queryFn: async (): Promise<ChatCase[]> => {
      const query = source === 'cases_montor'
        ? supabase.from('cases_montor').select('id, address, customer_name, city, status')
        : supabase.from('cases').select('id, address, customer_name, city, status');
      const { data, error } = await query.in('id', sortedIds);
      if (error) throw error;
      return (data ?? []).filter((c): c is ChatCase => !!c.id && !!c.address && !!c.customer_name && !!c.status);
    },
  });
}