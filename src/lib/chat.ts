import type { ChatAttachment } from './chatAttachments';
import { readChatAttachments } from './chatAttachments';
export interface ChatMessage { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; case_id?: string | null; attachments?: ChatAttachment[] }
import type { ChatKind } from '../../supabase/functions/_shared/chatNames';
export type { ChatKind };
/** En rad från chat_overview(): en konversation där den inloggade är medlem. */
export interface ChatOverviewRow {
  id: string; kind: ChatKind; channel_key: string | null; team_user_id: string | null; is_group: boolean;
  title: string | null; created_at: string; member_ids: string[]; last_read_at: string | null; unread: number; latest: ChatMessage | null;
}
export const CHAT_PAGE_SIZE = 50;
export function openChat(id: string) { window.dispatchEvent(new CustomEvent('smartklimat:open-chat', { detail: id })); }
export function extractCaseIdFromText(body: string): string | null {
  return body.match(/[?&]case=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=$|[^0-9a-z-])/i)?.[1] ?? null;
}
export function caseFallbackBody(address: string) { return 'Ärende: ' + address; }
export interface ChatKeyLike { key: string; shiftKey?: boolean; isComposing?: boolean }
export function shouldSendOnKey(event: ChatKeyLike): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}
export function shareCaseInChat(c: { id: string; address: string }) {
  window.dispatchEvent(new CustomEvent('smartklimat:share-case', { detail: { id: c.id, address: c.address } }));
}

/** Tolkar ett meddelande från databasen eller realtime till ChatMessage. */
export function toChatMessage(row: unknown): ChatMessage | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.conversation_id !== 'string' || typeof r.sender_id !== 'string' || typeof r.created_at !== 'string') return null;
  return { id: r.id, conversation_id: r.conversation_id, sender_id: r.sender_id, body: typeof r.body === 'string' ? r.body : '', created_at: r.created_at, case_id: typeof r.case_id === 'string' ? r.case_id : null, attachments: readChatAttachments(r.attachments) };
}
const KINDS: ChatKind[] = ['direct', 'group', 'channel'];
/** Tolkar svaret från chat_overview(). */
export function toOverviewRow(row: Record<string, unknown>): ChatOverviewRow {
  const kind = KINDS.includes(row.kind as ChatKind) ? row.kind as ChatKind : row.is_group ? 'group' : 'direct';
  return {
    id: String(row.id), kind, channel_key: (row.channel_key as string | null) ?? null, team_user_id: (row.team_user_id as string | null) ?? null,
    is_group: !!row.is_group, title: (row.title as string | null) ?? null, created_at: String(row.created_at),
    member_ids: Array.isArray(row.member_ids) ? row.member_ids.map(String) : [], last_read_at: (row.last_read_at as string | null) ?? null,
    unread: Number(row.unread) || 0, latest: toChatMessage(row.latest),
  };
}

/** Jämför tidsstämplar som tidpunkter (oberoende av format och tidszon). */
function time(value: string): number { const t = Date.parse(value); return Number.isNaN(t) ? 0 : t; }
/** Ordning för meddelanden: äldst först, id som avgörare vid samma tid (samma nyckel som i databasen). */
export function compareMessages(a: Pick<ChatMessage, 'created_at' | 'id'>, b: Pick<ChatMessage, 'created_at' | 'id'>): number {
  return (a.created_at === b.created_at ? 0 : time(a.created_at) - time(b.created_at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Slår ihop sidor och realtime-meddelanden utan dubbletter, äldst först. */
export function mergeMessages(...lists: ReadonlyArray<readonly ChatMessage[]>): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const list of lists) for (const m of list) byId.set(m.id, m);
  return [...byId.values()].sort(compareMessages);
}
/** Markören för "Visa äldre": det äldsta inlästa meddelandet. */
export function olderCursor(messages: readonly ChatMessage[]): { created_at: string; id: string } | null {
  const first = messages[0];
  return first ? { created_at: first.created_at, id: first.id } : null;
}
export interface ConversationPage { messages: ChatMessage[]; hasOlder: boolean }
/** Lägger till de senaste meddelandena utan att tappa äldre sidor som redan visats. */
export function mergeLatestPage(previous: ConversationPage | undefined, latest: ChatMessage[], pageSize = CHAT_PAGE_SIZE): ConversationPage {
  if (!previous) return { messages: mergeMessages(latest), hasOlder: latest.length >= pageSize };
  return { messages: mergeMessages(previous.messages, latest), hasOlder: previous.hasOlder };
}
/** Lägger till en äldre sida överst. */
export function mergeOlderPage(previous: ConversationPage, older: ChatMessage[], pageSize = CHAT_PAGE_SIZE): ConversationPage {
  return { messages: mergeMessages(older, previous.messages), hasOlder: older.length >= pageSize };
}
/** Ett realtime-meddelande läggs till i den inlästa konversationen; samma id läggs aldrig till två gånger. */
export function addRealtimeMessage(previous: ConversationPage | undefined, message: ChatMessage): ConversationPage | undefined {
  if (!previous) return previous;
  if (previous.messages.some(m => m.id === message.id || m.conversation_id !== message.conversation_id)) return previous;
  return { ...previous, messages: mergeMessages(previous.messages, [message]) };
}
/** Uppdaterar översikten direkt när ett meddelande kommer in (översikten hämtas sedan om). */
export function applyMessageToOverview(rows: readonly ChatOverviewRow[], message: ChatMessage, viewerId: string): { rows: ChatOverviewRow[]; known: boolean } {
  let known = false;
  const next = rows.map(row => {
    if (row.id !== message.conversation_id) return row;
    known = true;
    if (row.latest?.id === message.id) return row;
    const newer = !row.latest || compareMessages(row.latest, message) < 0;
    const unseen = message.sender_id !== viewerId && (!row.last_read_at || time(message.created_at) > time(row.last_read_at));
    return { ...row, latest: newer ? message : row.latest, unread: row.unread + (unseen ? 1 : 0) };
  });
  return { rows: next, known };
}
/** Markerar en konversation som läst i översikten. */
export function markOverviewRead(rows: readonly ChatOverviewRow[], conversationId: string, readAt: string): ChatOverviewRow[] {
  return rows.map(row => row.id === conversationId ? { ...row, last_read_at: readAt, unread: 0 } : row);
}

export { conversationDisplayName } from '../../supabase/functions/_shared/chatNames';
import { conversationDisplayName } from '../../supabase/functions/_shared/chatNames';
export interface ChatListConversation extends ChatOverviewRow { name: string }
export type ChatListEntry = { type: 'ai' } | { type: 'conversation'; conversation: ChatListConversation };
function channelRank(row: ChatOverviewRow): number { return row.channel_key === 'alla' ? 0 : row.channel_key === 'kontoret' ? 1 : 2; }
/** Ordning: kanaler (Alla, Kontoret, teamkanaler i bokstavsordning), sedan direkt- och gruppchattar efter senaste aktivitet. */
export function orderConversations(rows: readonly ChatOverviewRow[], viewerId: string | null, names: ReadonlyMap<string, string>): ChatListConversation[] {
  const named = rows.map(row => ({ ...row, name: conversationDisplayName(row, viewerId, names) }));
  const channels = named.filter(r => r.kind === 'channel').sort((a, b) => channelRank(a) - channelRank(b) || a.name.localeCompare(b.name, 'sv'));
  const activity = (r: ChatOverviewRow) => time(r.latest?.created_at ?? r.created_at);
  const others = named.filter(r => r.kind !== 'channel').sort((a, b) => activity(b) - activity(a) || (a.id < b.id ? -1 : 1));
  return [...channels, ...others];
}
/** Hela listan i chatten: N3prenad-AI först, sedan konversationerna. Tomma kanaler visas. */
export function chatListEntries(rows: readonly ChatOverviewRow[], viewerId: string | null, names: ReadonlyMap<string, string>): ChatListEntry[] {
  return [{ type: 'ai' }, ...orderConversations(rows, viewerId, names).map(conversation => ({ type: 'conversation' as const, conversation }))];
}

// ---- Chatt som egen vy (etapp 1 del 2): ren logik för lista, huvud och meddelanderader ----

/** Händelse som SellerView och CoordinatorView lyssnar på för att visa chatten i fliken Chatt. */
export const OPEN_CHAT_FULL_EVENT = 'smartklimat:open-chat-full';
/** Ber fliken Chatt att visa chatten (med den öppna konversationen). Returnerar true om en vy tog emot den. */
export function openChatFullscreen(conversationId: string | null): boolean {
  return !window.dispatchEvent(new CustomEvent(OPEN_CHAT_FULL_EVENT, { detail: conversationId, cancelable: true }));
}

export function chatRoleLabel(role: string | null | undefined): string {
  return role === 'seller' ? 'Säljare' : role === 'coordinator' ? 'Koordinator' : role === 'montor' ? 'Montör' : '';
}
export function chatInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function dayKey(d: Date): string { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
/** Datumavdelare: "Idag", "I går", annars veckodag och datum ("tisdag 17 november"); år läggs till för tidigare år. */
export function chatDayLabel(value: string | Date, now: Date = new Date()): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (dayKey(d) === dayKey(now)) return 'Idag';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return 'I går';
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export const CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;
export interface ChatMessageRow { message: ChatMessage; /** Visar avatar, namn och tid. */ showHeader: boolean; /** Datumavdelare före raden, annars null. */ dayLabel: string | null }
/**
 * Meddelanden som rader. Meddelanden i följd från samma avsändare grupperas så länge de ligger inom fem minuter
 * från gruppens första meddelande; ny dag eller ny avsändare börjar alltid en ny grupp.
 */
export function groupChatMessages(messages: readonly ChatMessage[], now: Date = new Date()): ChatMessageRow[] {
  let groupStart: ChatMessage | null = null;
  return messages.map((message, i) => {
    const previous = messages[i - 1];
    const newDay = !previous || dayKey(new Date(previous.created_at)) !== dayKey(new Date(message.created_at));
    const showHeader = newDay || !groupStart || previous.sender_id !== message.sender_id || time(message.created_at) - time(groupStart.created_at) > CHAT_GROUP_WINDOW_MS;
    if (showHeader) groupStart = message;
    return { message, showHeader, dayLabel: newDay ? chatDayLabel(message.created_at, now) : null };
  });
}

function memberCount(n: number): string { return n === 1 ? '1 medlem' : `${n} medlemmar`; }
/** Underraden i konversationens huvud. */
export function conversationSubtitle(
  row: Pick<ChatOverviewRow, 'kind' | 'channel_key' | 'team_user_id' | 'title' | 'member_ids'>,
  viewerId: string | null, names: ReadonlyMap<string, string>, roles: ReadonlyMap<string, string>,
): string {
  if (row.kind === 'channel') {
    if (row.channel_key === 'alla') return `Hela företaget · ${memberCount(row.member_ids.length)}`;
    if (row.channel_key === 'kontoret') return `Bara kontoret · ${memberCount(row.member_ids.length)}`;
    if (row.team_user_id && row.team_user_id === viewerId) return `Teamkanal · ${memberCount(row.member_ids.length)}`;
    const team = row.title?.trim() || (row.team_user_id ? names.get(row.team_user_id) : undefined) || 'Team';
    return `${team} och kontoret`;
  }
  const others = row.member_ids.filter(id => id !== viewerId);
  if (row.kind === 'direct') return chatRoleLabel(others[0] ? roles.get(others[0]) : null);
  return others.map(id => names.get(id) ?? 'Användare').join(', ');
}

/** Förhandsraden i listan: "Avsändare: text", "Du: …" för egna meddelanden. */
export function chatPreviewLine(latest: ChatMessage | null | undefined, viewerId: string | null, names: ReadonlyMap<string, string>): string {
  if (!latest) return 'Inga meddelanden ännu';
  const text = latest.body.trim() ? latest.body.trim().replace(/\s+/g, ' ') : (() => { const n = readChatAttachments(latest.attachments).length; return n === 1 ? 'Bild' : n > 1 ? `${n} bilder` : ''; })();
  const sender = latest.sender_id === viewerId ? 'Du' : names.get(latest.sender_id)?.split(/\s+/)[0] || 'Användare';
  return `${sender}: ${text}`;
}

export type ChatSidebarItem = { type: 'ai' } | { type: 'conversation'; conversation: ChatListConversation };
export interface ChatSidebarSections { channels: ChatListConversation[]; teams: ChatListConversation[]; direct: ChatSidebarItem[] }
export const AI_CONVERSATION_NAME = 'N3prenad-AI';
/**
 * Listans sektioner. KANALER: Alla, Kontoret och tittarens egen teamkanal. TEAM (bara personal): övriga teamkanaler.
 * DIREKT: N3prenad-AI först, sedan direkt- och gruppchattar i given ordning. Sökningen filtrerar på namn.
 */
export function chatSidebarSections(conversations: readonly ChatListConversation[], viewerId: string | null, isStaff: boolean, query = ''): ChatSidebarSections {
  const q = query.trim().toLocaleLowerCase('sv');
  const match = (name: string) => !q || name.toLocaleLowerCase('sv').includes(q);
  const channels: ChatListConversation[] = [];
  const teams: ChatListConversation[] = [];
  const direct: ChatSidebarItem[] = match(AI_CONVERSATION_NAME) ? [{ type: 'ai' }] : [];
  for (const c of conversations) {
    if (!match(c.name)) continue;
    if (c.kind !== 'channel') direct.push({ type: 'conversation', conversation: c });
    else if (c.channel_key === 'alla' || c.channel_key === 'kontoret' || (!!viewerId && c.team_user_id === viewerId)) channels.push(c);
    else if (isStaff) teams.push(c);
  }
  return { channels, teams, direct };
}

// ---- Läsmarkering (etapp 1 del 3): bara när någon faktiskt kan se konversationen ----

/** Dokumentet syns (inte bakgrundsflik, minimerat fönster eller låst skärm). */
export function isDocumentVisible(visibilityState: string | null | undefined): boolean {
  return visibilityState === 'visible';
}
/** Konversationen som får läsmarkeras: den öppna, när en ChatView visas och dokumentet syns. Annars null. */
export function chatReadTarget(activeId: string | null, surfaceVisible: boolean, visibilityState: string | null | undefined): string | null {
  return activeId && surfaceVisible && isDocumentVisible(visibilityState) ? activeId : null;
}
/** Ett inkommande meddelande läsmarkeras bara när dess konversation är läsmålet och dokumentet syns just nu. */
export function shouldMarkIncomingRead(target: string | null, conversationId: string, visibilityState: string | null | undefined): boolean {
  return !!target && target === conversationId && isDocumentVisible(visibilityState);
}
