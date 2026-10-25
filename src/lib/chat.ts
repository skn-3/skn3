import type { ChatAttachment } from './chatAttachments';
export interface ChatMessage { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; case_id?: string | null; attachments?: ChatAttachment[] }
export interface ChatMember { conversation_id: string; user_id: string; last_read_at: string | null }
export function countUnreadMessages(messages: ChatMessage[], member: ChatMember | undefined, userId: string): number {
  if (!member) return 0;
  return messages.filter(m => m.conversation_id === member.conversation_id && m.sender_id !== userId && (!member.last_read_at || m.created_at > member.last_read_at)).length;
}
export function openChat(id: string) { window.dispatchEvent(new CustomEvent('smartklimat:open-chat', { detail: id })); }
export function extractCaseIdFromText(body: string): string | null {
  return body.match(/[?&]case=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=$|[^0-9a-z-])/i)?.[1] ?? null;
}
export function caseFallbackBody(address: string) { return 'Ärende: ' + address; }
export function shareCaseInChat(c: { id: string; address: string }) {
  window.dispatchEvent(new CustomEvent('smartklimat:share-case', { detail: { id: c.id, address: c.address } }));
}