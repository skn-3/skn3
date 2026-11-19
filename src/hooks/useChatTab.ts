import { useEffect, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { OPEN_CHAT_FULL_EVENT } from '@/lib/chat';

/**
 * Fliken Chatt i SellerView och CoordinatorView: anmäler att vyn har en chattflik, lyssnar på smartklimat:open-chat-full
 * (från 768 px) och lämnar fliken på telefon, där chatten i stället visas i helskärmsarket.
 */
export function useChatTab(isChatTab: boolean, showChatTab: () => void, leaveChatTab: () => void) {
  const chat = useChat();
  const mobile = useIsMobile();
  const { registerTabHost, openConversation, setPaneOpen } = chat;
  const latest = useRef({ mobile, showChatTab });
  latest.current = { mobile, showChatTab };
  useEffect(() => registerTabHost(), [registerTabHost]);
  useEffect(() => {
    const handler = (event: Event) => {
      if (latest.current.mobile) return;
      event.preventDefault();
      const id = (event as CustomEvent<string | null>).detail;
      if (id) openConversation(id);
      latest.current.showChatTab();
    };
    window.addEventListener(OPEN_CHAT_FULL_EVENT, handler);
    return () => window.removeEventListener(OPEN_CHAT_FULL_EVENT, handler);
  }, [openConversation]);
  useEffect(() => {
    if (mobile && isChatTab) { leaveChatTab(); setPaneOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, isChatTab]);
  return { unread: chat.unread };
}
