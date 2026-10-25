export interface ChatMessage { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }
export interface ChatMember { conversation_id: string; user_id: string; last_read_at: string | null }
export function countUnreadMessages(messages: ChatMessage[], member: ChatMember | undefined, userId: string): number {
  if (!member) return 0;
  return messages.filter(m => m.conversation_id === member.conversation_id && m.sender_id !== userId && (!member.last_read_at || m.created_at > member.last_read_at)).length;
}
export function openChat(id: string) { window.dispatchEvent(new CustomEvent('smartklimat:open-chat', { detail: id })); }