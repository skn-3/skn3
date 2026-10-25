import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { openChat } from '@/lib/chat';

export function incomingMessageToast(messageId: string, name: string, conversationId: string) {
  toast.custom(id => <Button variant="outline" className="h-auto min-h-12 w-full whitespace-normal justify-start text-left shadow-lg px-4 py-3" onClick={() => { openChat(conversationId); toast.dismiss(id); }}>
    Nytt meddelande från {name}
  </Button>, { id: `chat-message-${messageId}` });
}