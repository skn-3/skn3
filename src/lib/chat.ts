import type { ChatAttachment } from './chatAttachments';
import { readChatAttachments } from './chatAttachments';
export interface ChatMessage { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; case_id?: string | null; attachments?: ChatAttachment[] }
export type ChatKind = 'direct' | 'group' | 'channel';
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

/** Visningsnamn. Personal ser teamkanalen med teamets namn, teamet självt ser "<Team> och kontoret". */
export function conversationDisplayName(row: Pick<ChatOverviewRow, 'kind' | 'channel_key' | 'team_user_id' | 'title' | 'member_ids'>, viewerId: string | null, names: ReadonlyMap<string, string>): string {
  if (row.kind === 'channel') {
    if (row.channel_key === 'alla') return 'Alla';
    if (row.channel_key === 'kontoret') return 'Kontoret';
    const team = row.title?.trim() || (row.team_user_id ? names.get(row.team_user_id) : undefined) || 'Team';
    return row.team_user_id && row.team_user_id === viewerId ? `${team} och kontoret` : team;
  }
  const others = row.member_ids.filter(id => id !== viewerId).map(id => names.get(id) ?? 'Användare');
  if (row.kind === 'group') return row.title?.trim() || others.join(', ') || 'Grupp';
  return others.join(', ') || 'Användare';
}
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
