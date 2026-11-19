import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from '@/hooks/useMessagingUser';
import {
  CHAT_PAGE_SIZE, addRealtimeMessage, applyMessageToOverview, chatListEntries, markOverviewRead, mergeLatestPage, mergeMessages,
  mergeOlderPage, olderCursor, orderConversations, toChatMessage, toOverviewRow,
  type ChatListConversation, type ChatListEntry, type ChatMessage, type ChatOverviewRow, type ConversationPage,
} from '@/lib/chat';
import { incomingMessageToast } from './incomingMessageToast';
import { validateChatImages, type ChatAttachment } from '@/lib/chatAttachments';
import { compressImageToBlob } from '@/lib/imageCompress';

export interface ChatProfile { id: string | null; name: string | null; role: string | null }
export interface ChatContextValue {
  userId: string | null;
  conversations: ChatListConversation[];
  entries: ChatListEntry[];
  profiles: ChatProfile[];
  names: ReadonlyMap<string, string>;
  unread: number;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Om den öppna konversationen faktiskt visas (styr läsmarkering). */
  setVisible: (visible: boolean) => void;
  activeConversation: ChatListConversation | undefined;
  messages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: unknown;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  start: (ids: string[], title: string) => Promise<string>;
  send: (id: string, body: string, files?: File[], caseId?: string | null) => Promise<void>;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

const overviewKey = (userId: string | null) => ['chat', userId, 'overview'] as const;
const profilesKey = (userId: string | null) => ['chat', userId, 'profiles'] as const;
const messagesKey = (userId: string | null, conversationId: string | null) => ['chat', userId, 'messages', conversationId] as const;

async function fetchMessagePage(conversationId: string, before?: { created_at: string; id: string } | null): Promise<ChatMessage[]> {
  let query = supabase.from('messages').select('*').eq('conversation_id', conversationId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CHAT_PAGE_SIZE);
  if (before) query = query.or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`);
  const { data, error } = await query;
  if (error) throw error;
  return mergeMessages((data ?? []).map(toChatMessage).filter((m): m is ChatMessage => !!m));
}

/** En enda instans i det inloggade Index-skalet. Äger översikt, realtime, toasts, öppen konversation, läsmarkering, start och send. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const userId = useMessagingUser();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const shownMessageIds = useRef(new Set<string>());

  useEffect(() => { setActiveId(null); shownMessageIds.current = new Set(); }, [userId]);

  const overview = useQuery({
    queryKey: overviewKey(userId), enabled: !!userId, refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('chat_overview');
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(toOverviewRow);
    },
  });
  const profiles = useQuery({
    queryKey: profilesKey(userId), enabled: !!userId, staleTime: 5 * 60000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles_public').select('id,name,role').order('name');
      if (error) throw error;
      return (data ?? []) as ChatProfile[];
    },
  });
  const names = useMemo(() => new Map((profiles.data ?? []).filter(p => p.id && p.name).map(p => [p.id as string, p.name as string])), [profiles.data]);
  const namesRef = useRef(names);
  namesRef.current = names;
  const conversations = useMemo(() => orderConversations(overview.data ?? [], userId, names), [overview.data, userId, names]);
  const entries = useMemo(() => chatListEntries(overview.data ?? [], userId, names), [overview.data, userId, names]);

  const messagesQuery = useQuery({
    queryKey: messagesKey(userId, activeId), enabled: !!userId && !!activeId,
    queryFn: async () => {
      const latest = await fetchMessagePage(activeId as string);
      return mergeLatestPage(qc.getQueryData<ConversationPage>(messagesKey(userId, activeId)), latest);
    },
  });

  const markRead = useCallback(async (id: string) => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from('conversation_members').update({ last_read_at: readAt }).eq('conversation_id', id).eq('user_id', userId);
    if (error) { toast.error('Kunde inte markera meddelandena som lästa'); return; }
    qc.setQueryData<ChatOverviewRow[]>(overviewKey(userId), old => old ? markOverviewRead(old, id, readAt) : old);
    void qc.invalidateQueries({ queryKey: overviewKey(userId) });
  }, [userId, qc]);

  const readTarget = visible ? activeId : null;
  const readRef = useRef<{ target: string | null; markRead: typeof markRead }>({ target: readTarget, markRead });
  readRef.current = { target: readTarget, markRead };
  useEffect(() => {
    if (!readTarget) return;
    void markRead(readTarget);
    const interval = setInterval(() => void markRead(readTarget), 60000);
    return () => clearInterval(interval);
  }, [readTarget, markRead]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`chat-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = toChatMessage(payload.new);
        if (!message) return;
        qc.setQueryData<ConversationPage>(messagesKey(userId, message.conversation_id), old => addRealtimeMessage(old, message));
        qc.setQueryData<ChatOverviewRow[]>(overviewKey(userId), old => old ? applyMessageToOverview(old, message, userId).rows : old);
        void qc.invalidateQueries({ queryKey: overviewKey(userId) });
        if (readRef.current.target === message.conversation_id) void readRef.current.markRead(message.conversation_id);
        if (message.sender_id === userId || shownMessageIds.current.has(message.id)) return;
        shownMessageIds.current.add(message.id);
        void (async () => {
          let name = namesRef.current.get(message.sender_id);
          if (!name) {
            const { data } = await supabase.from('profiles_public').select('name').eq('id', message.sender_id).maybeSingle();
            name = data?.name ?? undefined;
          }
          incomingMessageToast(message.id, name || 'Användare', message.conversation_id);
        })();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, (payload) => {
        const row = (payload.new && 'user_id' in payload.new ? payload.new : payload.old) as { user_id?: string } | null;
        if (row?.user_id === userId) void qc.invalidateQueries({ queryKey: overviewKey(userId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);

  const loadOlder = useCallback(async () => {
    if (!activeId || loadingOlder) return;
    const key = messagesKey(userId, activeId);
    const previous = qc.getQueryData<ConversationPage>(key);
    const cursor = previous ? olderCursor(previous.messages) : null;
    if (!previous?.hasOlder || !cursor) return;
    setLoadingOlder(true);
    try {
      const older = await fetchMessagePage(activeId, cursor);
      qc.setQueryData<ConversationPage>(key, old => old ? mergeOlderPage(old, older) : old);
    } catch {
      toast.error('Kunde inte hämta äldre meddelanden. Försök igen.');
    } finally { setLoadingOlder(false); }
  }, [activeId, loadingOlder, qc, userId]);

  const start = useCallback(async (ids: string[], title: string) => {
    const { data, error } = await supabase.rpc('start_conversation', { p_user_ids: ids, p_title: title });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: overviewKey(userId) });
    return data as string;
  }, [qc, userId]);

  const send = useCallback(async (id: string, body: string, files: File[] = [], caseId?: string | null) => {
    if (!userId) throw new Error('Du måste vara inloggad.');
    if (!body.trim() && !files.length) return;
    const validated = validateChatImages(files, 0);
    if (validated.rejectedReason) throw new Error(validated.rejectedReason);
    const attachments: ChatAttachment[] = [];
    try {
      for (const file of files) {
        const { blob, width, height } = await compressImageToBlob(file, 1600, 0.82);
        const path = `${id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from('chat-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        attachments.push({ path, name: file.name.replace(/[^a-zA-Z0-9._-]/g, '_'), type: 'image/jpeg', size: blob.size, width, height });
      }
    } catch { throw new Error('Bilden kunde inte laddas upp. Försök igen.'); }
    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: id, sender_id: userId, body: body.trim(), case_id: caseId ?? null, attachments: attachments.map(a => ({ ...a })) })
      .select('*').single();
    if (error) throw error;
    const message = toChatMessage(data);
    if (message) {
      qc.setQueryData<ConversationPage>(messagesKey(userId, id), old => addRealtimeMessage(old, message));
      qc.setQueryData<ChatOverviewRow[]>(overviewKey(userId), old => old ? applyMessageToOverview(old, message, userId).rows : old);
    }
    void qc.invalidateQueries({ queryKey: overviewKey(userId) });
  }, [qc, userId]);

  const page = messagesQuery.data;
  const value: ChatContextValue = {
    userId, conversations, entries, profiles: profiles.data ?? [], names,
    unread: conversations.reduce((sum, c) => sum + c.unread, 0),
    isLoading: overview.isLoading, error: overview.error, refetch: overview.refetch,
    activeId, setActiveId, setVisible,
    activeConversation: conversations.find(c => c.id === activeId),
    messages: activeId ? page?.messages ?? [] : [],
    messagesLoading: !!activeId && messagesQuery.isLoading, messagesError: messagesQuery.error,
    hasOlder: !!page?.hasOlder, loadingOlder, loadOlder, start, send,
  };
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
