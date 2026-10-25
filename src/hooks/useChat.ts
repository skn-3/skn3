import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from './useMessagingUser';
import { countUnreadMessages, openChat, type ChatMessage } from '@/lib/chat';

export function useChat(activeId: string | null) {
  const userId = useMessagingUser();
  const qc = useQueryClient();
  const shownMessageIds = useRef(new Set<string>());
  const query = useQuery({
    queryKey: ['chat', userId], enabled: !!userId, refetchInterval: 60000,
    queryFn: async () => {
      const [conversations, members, profiles] = await Promise.all([
        supabase.from('conversations').select('*'),
        supabase.from('conversation_members').select('*'),
        supabase.from('profiles_public').select('id,name,role').order('name'),
      ]);
      for (const result of [conversations, members, profiles]) if (result.error) throw result.error;
      const messages: ChatMessage[] = [];
      for (let start = 0; ; start += 1000) {
        const result = await supabase.from('messages').select('*').order('created_at').order('id').range(start, start + 999);
        if (result.error) throw result.error;
        messages.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 1000) break;
      }
      return { conversations: conversations.data ?? [], members: members.data ?? [], profiles: profiles.data ?? [], messages };
    },
  });
  const markRead = useCallback(async (id: string) => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from('conversation_members').update({ last_read_at: readAt }).eq('conversation_id', id).eq('user_id', userId);
    if (error) { toast.error('Kunde inte markera meddelandena som lästa'); return; }
    qc.setQueryData<typeof query.data>(['chat', userId], (old) => old ? { ...old, members: old.members.map(m => m.conversation_id === id && m.user_id === userId ? { ...m, last_read_at: readAt } : m) } : old);
  }, [userId, qc]);
  useEffect(() => {
    if (!activeId) return;
    void markRead(activeId);
    const interval = setInterval(() => void markRead(activeId), 60000);
    return () => clearInterval(interval);
  }, [activeId, markRead]);
  const latestActiveMessage = query.data?.messages.filter(m => m.conversation_id === activeId).at(-1)?.id;
  useEffect(() => { if (activeId && latestActiveMessage) void markRead(activeId); }, [activeId, latestActiveMessage, markRead]);
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`chat-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        qc.invalidateQueries({ queryKey: ['chat', userId] });
        if (activeId && payload.new.conversation_id === activeId) void markRead(activeId);
        const message = payload.new as ChatMessage;
        if (message.sender_id === userId || shownMessageIds.current.has(message.id)) return;
        shownMessageIds.current.add(message.id);
        void (async () => {
          const cached = qc.getQueryData<typeof query.data>(['chat', userId]);
          let name = cached?.profiles.find(p => p.id === message.sender_id)?.name;
          if (!name) {
            const { data } = await supabase.from('profiles_public').select('name').eq('id', message.sender_id).maybeSingle();
            name = data?.name;
          }
          toast(`Nytt meddelande från ${name || 'Användare'}`, {
            id: `chat-message-${message.id}`,
            action: { label: 'Öppna chatten', onClick: () => openChat(message.conversation_id) },
            onClick: () => openChat(message.conversation_id),
          });
        })();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => qc.invalidateQueries({ queryKey: ['chat', userId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc, activeId, markRead]);
  const data = query.data;
  const conversations = (data?.conversations ?? []).map(c => {
    const messages = (data?.messages ?? []).filter(m => m.conversation_id === c.id);
    const names = (data?.members ?? []).filter(m => m.conversation_id === c.id && m.user_id !== userId).map(m => data?.profiles.find(p => p.id === m.user_id)?.name ?? 'Användare');
    const unread = userId ? countUnreadMessages(messages, data?.members.find(m => m.conversation_id === c.id && m.user_id === userId), userId) : 0;
    return { ...c, name: c.is_group ? c.title || names.join(', ') : names.join(', '), messages, latest: messages.at(-1), unread };
  }).sort((a, b) => (b.latest?.created_at ?? b.created_at).localeCompare(a.latest?.created_at ?? a.created_at));
  async function start(ids: string[], title: string) {
    const { data, error } = await supabase.rpc('start_conversation', { p_user_ids: ids, p_title: title });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['chat', userId] });
    return data;
  }
  async function send(id: string, body: string) {
    if (!userId || !body.trim()) return;
    const { error } = await supabase.from('messages').insert({ conversation_id: id, sender_id: userId, body: body.trim() });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['chat', userId] });
  }
  return { userId, conversations, profiles: data?.profiles ?? [], unread: conversations.reduce((sum, c) => sum + c.unread, 0), isLoading: query.isLoading, error: query.error, refetch: query.refetch, start, send };
}