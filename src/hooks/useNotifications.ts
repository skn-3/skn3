import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from './useMessagingUser';

export function useNotifications() {
  const userId = useMessagingUser();
  const qc = useQueryClient();
  const key = ['notifications', userId];
  const query = useQuery({
    queryKey: key, enabled: !!userId, refetchInterval: 60000,
    queryFn: async () => {
      if (!userId) return { rows: [], unread: 0 };
      const [list, count] = await Promise.all([
        supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
      ]);
      if (list.error) throw list.error;
      if (count.error) throw count.error;
      return { rows: list.data ?? [], unread: count.count ?? 0 };
    },
  });
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ['notifications', userId] });
        if (payload.eventType === 'INSERT' && 'title' in payload.new) toast(payload.new.title);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);
  async function markRead(id?: string) {
    if (!userId) return;
    let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
    if (id) q = q.eq('id', id);
    const { error } = await q;
    if (error) { toast.error('Kunde inte markera notiserna som lästa'); throw error; }
    await qc.invalidateQueries({ queryKey: key });
  }
  return { ...query, rows: query.data?.rows ?? [], unread: query.data?.unread ?? 0, markRead };
}