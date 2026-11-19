// Ren logik för chat-push: titel, text, mottagarurval och svarskoder. Inga Deno- eller nätverksberoenden,
// så att vitest kan testa den (src/lib/__tests__/chatPush.test.ts).
import { conversationDisplayName, type ChatKind } from '../_shared/chatNames.ts';

export const PUSH_BODY_MAX = 140;
export const PUSH_TTL_SECONDS = 24 * 60 * 60;
export const PUSH_DELAY_MS = 3000;
export const PUSH_TEST_TEXT = 'Notiserna fungerar';
export const PUSH_APP_NAME = 'SmartKlimat N3prenad';

export interface PushConversation { id: string; kind: ChatKind; channel_key: string | null; team_user_id: string | null; title: string | null; archived_at?: string | null }
export interface PushMember { user_id: string; last_read_at: string | null }
export interface PushMessage { id: string; conversation_id: string; sender_id: string; body: string | null; created_at: string; attachments?: unknown; case_id?: string | null }
export interface PushPayload { title: string; body: string; tag: string; url: string; unread: number }

function time(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? NaN : t;
}

/**
 * Mottagare: medlemmarna utom avsändaren och utom dem vars läsmarkering redan är lika med eller senare
 * än meddelandets tid (de har läst det i appen).
 */
export function pushRecipients(members: readonly PushMember[], message: Pick<PushMessage, 'sender_id' | 'created_at'>): string[] {
  const sent = time(message.created_at);
  const out = new Set<string>();
  for (const m of members) {
    if (m.user_id === message.sender_id) continue;
    const read = time(m.last_read_at);
    if (!Number.isNaN(read) && !Number.isNaN(sent) && read >= sent) continue;
    out.add(m.user_id);
  }
  return [...out];
}

/** Titel: i en direktchatt avsändarens namn, i kanal eller grupp "<Avsändare> i <konversationens namn för mottagaren>". */
export function pushTitle(conversation: PushConversation, memberIds: readonly string[], senderName: string | null | undefined, recipientId: string, names: ReadonlyMap<string, string>): string {
  const sender = senderName?.trim() || 'Någon';
  if (conversation.kind === 'direct') return sender;
  const name = conversationDisplayName({ ...conversation, member_ids: [...memberIds] }, recipientId, names);
  return `${sender} i ${name}`;
}

function attachmentCount(value: unknown): number {
  return Array.isArray(value) ? value.filter(a => a && typeof a === 'object' && typeof (a as { path?: unknown }).path === 'string').length : 0;
}

/** Text: meddelandet avkortat till 140 tecken. Bara bild: "Bild". */
export function pushBody(message: Pick<PushMessage, 'body' | 'attachments' | 'case_id'>, max = PUSH_BODY_MAX): string {
  const text = (message.body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    if (attachmentCount(message.attachments) > 0) return 'Bild';
    return message.case_id ? 'Ärende' : 'Nytt meddelande';
  }
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

export function pushUrl(conversationId: string): string {
  return `/?chat=${encodeURIComponent(conversationId)}`;
}

export function messagePayload(args: {
  conversation: PushConversation; memberIds: readonly string[]; message: PushMessage; senderName: string | null | undefined;
  recipientId: string; names: ReadonlyMap<string, string>; unread: number;
}): PushPayload {
  return {
    title: pushTitle(args.conversation, args.memberIds, args.senderName, args.recipientId, args.names),
    body: pushBody(args.message),
    tag: args.conversation.id,
    url: pushUrl(args.conversation.id),
    unread: Math.max(0, Math.floor(args.unread || 0)),
  };
}

export function testPayload(unread: number): PushPayload {
  return { title: PUSH_APP_NAME, body: PUSH_TEST_TEXT, tag: 'smartklimat-test', url: '/', unread: Math.max(0, Math.floor(unread || 0)) };
}

export type PushOutcome = 'ok' | 'gone' | 'failed';
/** 2xx lyckat; 404 och 410 betyder att prenumerationen är borta; allt annat (även nätverksfel, status 0) är ett fel. */
export function classifyPushStatus(status: number): PushOutcome {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return 'gone';
  return 'failed';
}

/** Konstant tidsjämförelse av återanropets bearer. */
export function bearerMatches(header: string | null | undefined, expected: string | null | undefined): boolean {
  if (!header || !expected || !header.startsWith('Bearer ')) return false;
  const a = header.slice(7);
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
