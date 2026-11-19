import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useMessagingUser } from '@/hooks/useMessagingUser';
import {
  CHAT_PAGE_SIZE, addRealtimeMessage, applyMessageToOverview, chatListEntries, markOverviewRead, mergeLatestPage, mergeMessages,
  mergeOlderPage, olderCursor, openChatFullscreen, orderConversations, toChatMessage, toOverviewRow, chatReadTarget, shouldMarkIncomingRead,
  type ChatListConversation, type ChatListEntry, type ChatMessage, type ChatOverviewRow, type ConversationPage,
} from '@/lib/chat';
import { incomingMessageToast } from './incomingMessageToast';
import type { PendingChatCase } from './ChatCasePicker';
import { validateChatImages, type ChatAttachment } from '@/lib/chatAttachments';
import { compressImageToBlob } from '@/lib/imageCompress';
import { appBadgeCount, chatIdFromUrl } from '@/lib/push/platform';

export interface ChatProfile { id: string | null; name: string | null; role: string | null }
export interface ChatDraft { body: string; files: File[] }
export type ChatSurface = 'full' | 'compact';
export interface ChatContextValue {
  userId: string | null;
  conversations: ChatListConversation[];
  entries: ChatListEntry[];
  profiles: ChatProfile[];
  names: ReadonlyMap<string, string>;
  /** Roll per användare (seller, coordinator, montor). */
  roles: ReadonlyMap<string, string>;
  /** Personal (inte montör): ser sektionen TEAM. */
  isStaff: boolean;
  unread: number;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  activeId: string | null;
  activeConversation: ChatListConversation | undefined;
  /** N3prenad-AI är öppen. */
  aiActive: boolean;
  /** Ny konversation-flödet är öppet. */
  creating: boolean;
  openConversation: (id: string | null) => void;
  openAi: () => void;
  openNew: () => void;
  backToList: () => void;
  /** Ärende som väntar på att delas i en konversation. */
  pendingCase: PendingChatCase | null;
  setPendingCase: (c: PendingChatCase | null) => void;
  /** Den flytande rutan (dator) eller helskärmsarket (telefon). */
  paneOpen: boolean;
  setPaneOpen: (open: boolean) => void;
  /** Fliken Chatt visas just nu. */
  fullVisible: boolean;
  /** Vyn har en flik Chatt (SellerView, CoordinatorView). */
  tabAvailable: boolean;
  /** En ChatView anmäler att den visas; styr läsmarkering, toasts och rutan. */
  registerSurface: (surface: ChatSurface) => () => void;
  registerTabHost: () => () => void;
  /** Utkast per konversation (text och valda bilder), delade mellan flik och ruta utan omrendering vid varje tangent. */
  getDraft: (id: string) => ChatDraft;
  saveDraft: (id: string, draft: ChatDraft) => void;
  messages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: unknown;
  refetchMessages: () => Promise<unknown>;
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
const EMPTY_DRAFT: ChatDraft = { body: '', files: [] };

async function fetchMessagePage(conversationId: string, before?: { created_at: string; id: string } | null): Promise<ChatMessage[]> {
  let query = supabase.from('messages').select('*').eq('conversation_id', conversationId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(CHAT_PAGE_SIZE);
  if (before) query = query.or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`);
  const { data, error } = await query;
  if (error) throw error;
  return mergeMessages((data ?? []).map(toChatMessage).filter((m): m is ChatMessage => !!m));
}

/**
 * En enda instans i det inloggade Index-skalet. Äger översikt, realtime, toasts, öppen konversation, läsmarkering,
 * start och send samt vad som visas (flik eller ruta) och utkasten, så att fliken Chatt och den flytande rutan delar allt.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const userId = useMessagingUser();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aiActive, setAiActive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingCase, setPendingCase] = useState<PendingChatCase | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const [surfaces, setSurfaces] = useState({ full: 0, compact: 0 });
  const [tabHosts, setTabHosts] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const shownMessageIds = useRef(new Set<string>());
  const drafts = useRef(new Map<string, ChatDraft>());

  useEffect(() => {
    setActiveId(null); setAiActive(false); setCreating(false); setPendingCase(null);
    shownMessageIds.current = new Set(); drafts.current = new Map();
  }, [userId]);

  const openConversation = useCallback((id: string | null) => { setActiveId(id); setAiActive(false); setCreating(false); }, []);
  const openAi = useCallback(() => { setActiveId(null); setAiActive(true); setCreating(false); setPendingCase(null); }, []);
  const openNew = useCallback(() => { setActiveId(null); setAiActive(false); setCreating(true); }, []);
  const backToList = useCallback(() => { setActiveId(null); setAiActive(false); setCreating(false); }, []);

  const registerSurface = useCallback((surface: ChatSurface) => {
    setSurfaces(s => ({ ...s, [surface]: s[surface] + 1 }));
    if (surface === 'full') setPaneOpen(false);
    return () => setSurfaces(s => ({ ...s, [surface]: Math.max(0, s[surface] - 1) }));
  }, []);
  const registerTabHost = useCallback(() => { setTabHosts(n => n + 1); return () => setTabHosts(n => Math.max(0, n - 1)); }, []);
  const fullVisible = surfaces.full > 0;
  const visible = surfaces.full + surfaces.compact > 0;
  const fullVisibleRef = useRef(fullVisible);
  fullVisibleRef.current = fullVisible;

  const getDraft = useCallback((id: string) => drafts.current.get(id) ?? EMPTY_DRAFT, []);
  const saveDraft = useCallback((id: string, draft: ChatDraft) => {
    if (!draft.body && !draft.files.length) drafts.current.delete(id); else drafts.current.set(id, draft);
  }, []);

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
  const roles = useMemo(() => new Map((profiles.data ?? []).filter(p => p.id && p.role).map(p => [p.id as string, p.role as string])), [profiles.data]);
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

  /** Läsmarkeringen sätts med serverns tid (chat_mark_read); det returnerade värdet läggs i cachen. */
  const markRead = useCallback(async (id: string) => {
    if (!userId) return;
    const { data, error } = await supabase.rpc('chat_mark_read', { p_conversation_id: id });
    if (error) { toast.error('Kunde inte markera meddelandena som lästa'); return; }
    if (typeof data === 'string') qc.setQueryData<ChatOverviewRow[]>(overviewKey(userId), old => old ? markOverviewRead(old, id, data) : old);
    void qc.invalidateQueries({ queryKey: overviewKey(userId) });
  }, [userId, qc]);

  // Läsmarkera bara när någon kan se konversationen: en ChatView visas och dokumentet syns (inte bakgrundsflik eller låst skärm).
  const [visibilityState, setVisibilityState] = useState(() => (typeof document !== 'undefined' ? document.visibilityState : 'visible'));
  useEffect(() => {
    const onChange = () => setVisibilityState(document.visibilityState);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  const readTarget = chatReadTarget(activeId, visible, visibilityState);
  const readRef = useRef<{ target: string | null; markRead: typeof markRead }>({ target: readTarget, markRead });
  readRef.current = { target: readTarget, markRead };
  useEffect(() => {
    if (!readTarget) return;
    // Körs när konversationen öppnas och när dokumentet blir synligt igen med konversationen fortfarande öppen.
    void markRead(readTarget);
    const interval = setInterval(() => { if (shouldMarkIncomingRead(readRef.current.target, readTarget, document.visibilityState)) void markRead(readTarget); }, 60000);
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
        const openAndVisible = shouldMarkIncomingRead(readRef.current.target, message.conversation_id, document.visibilityState);
        if (openAndVisible) void readRef.current.markRead(message.conversation_id);
        if (message.sender_id === userId || shownMessageIds.current.has(message.id)) return;
        shownMessageIds.current.add(message.id);
        // Ingen toast när konversationen redan är öppen och synlig.
        if (openAndVisible) return;
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

  // smartklimat:open-chat och smartklimat:share-case: visas i fliken Chatt när den är framme, annars öppnas rutan.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      openConversation(id);
      if (!fullVisibleRef.current) setPaneOpen(true);
    };
    const onShare = (event: Event) => {
      const c = (event as CustomEvent<PendingChatCase>).detail;
      if (!c?.id || !c.address) return;
      setPendingCase({ id: c.id, address: c.address });
      backToList();
      if (!fullVisibleRef.current) setPaneOpen(true);
    };
    window.addEventListener('smartklimat:open-chat', onOpen);
    window.addEventListener('smartklimat:share-case', onShare);
    return () => { window.removeEventListener('smartklimat:open-chat', onOpen); window.removeEventListener('smartklimat:share-case', onShare); };
  }, [openConversation, backToList]);

  // /?chat=<id>: öppnar konversationen efter inloggning (fliken Chatt för personal på större skärm, annars rutan) och tar bort parametern.
  const chatParam = searchParams.get('chat');
  useEffect(() => {
    if (!chatParam || !userId) return;
    openConversation(chatParam);
    if (!openChatFullscreen(chatParam)) setPaneOpen(true);
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('chat'); return next; }, { replace: true });
  }, [chatParam, userId, openConversation, setSearchParams]);

  // Tryck på en notis när appen redan är öppen: service workern skickar adressen, som öppnas via samma väg som /?chat=.
  useEffect(() => {
    if (!userId || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'smartklimat:open-url') return;
      const id = chatIdFromUrl(String(event.data.url ?? ''));
      if (id) setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('chat', id); return next; }, { replace: true });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [userId, setSearchParams]);

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

  // Appikonens bricka: antal olästa, rensas vid noll (där det finns stöd).
  const unreadTotal = conversations.reduce((sum, c) => sum + c.unread, 0);
  const badgeReady = !!userId && overview.isSuccess;
  useEffect(() => {
    if (!badgeReady) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const count = appBadgeCount(unreadTotal);
    try {
      if (count === null) nav.clearAppBadge?.()?.catch(() => {});
      else nav.setAppBadge?.(count)?.catch(() => {});
    } catch { /* stöds inte */ }
  }, [badgeReady, unreadTotal]);

  const page = messagesQuery.data;
  const viewerRole = userId ? roles.get(userId) ?? null : null;
  const value: ChatContextValue = {
    userId, conversations, entries, profiles: profiles.data ?? [], names, roles,
    isStaff: viewerRole !== 'montor',
    unread: unreadTotal,
    isLoading: overview.isLoading, error: overview.error, refetch: overview.refetch,
    activeId, activeConversation: conversations.find(c => c.id === activeId),
    aiActive, creating, openConversation, openAi, openNew, backToList,
    pendingCase, setPendingCase, paneOpen, setPaneOpen,
    fullVisible, tabAvailable: tabHosts > 0, registerSurface, registerTabHost, getDraft, saveDraft,
    messages: activeId ? page?.messages ?? [] : [],
    messagesLoading: !!activeId && messagesQuery.isLoading, messagesError: messagesQuery.error, refetchMessages: messagesQuery.refetch,
    hasOlder: !!page?.hasOlder, loadingOlder, loadOlder, start, send,
  };
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
