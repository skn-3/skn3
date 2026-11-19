import { useContext } from 'react';
import { ChatContext, type ChatContextValue } from '@/components/chat/ChatProvider';

/** Läser chattens gemensamma tillstånd. Kräver ChatProvider (monteras en gång i det inloggade Index-skalet). */
export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat måste användas inom ChatProvider');
  return value;
}
