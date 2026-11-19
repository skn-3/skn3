import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useChat } from '@/hooks/useChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { openChatFullscreen } from '@/lib/chat';
import { ChatView } from './ChatView';

/** Den flytande chattknappen med ruta (dator) eller helskärmsark (telefon). Döljs medan fliken Chatt visas. */
export function ChatWidget() {
  const chat = useChat();
  const mobile = useIsMobile();
  const { paneOpen: open, setPaneOpen: setOpen } = chat;
  if (chat.fullVisible) return null;
  const close = () => setOpen(false);
  const expand = !mobile && chat.isStaff && chat.tabAvailable ? () => { openChatFullscreen(chat.activeId); } : undefined;
  const view = <ChatView mode="compact" onClose={close} onExpand={expand} />;
  return <>
    <Button size="icon" className="fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 h-14 w-14 rounded-full shadow-lg" aria-label={`Öppna chatten, ${chat.unread} olästa`} aria-expanded={open} onClick={() => setOpen(!open)}>
      <MessageCircle className="h-6 w-6" />
      {chat.unread > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full px-1 bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">{chat.unread > 9 ? '9+' : chat.unread}</span>}
    </Button>
    {mobile
      ? <Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" className="w-full max-w-full h-[100dvh] p-0 [&>button]:hidden"><SheetTitle className="sr-only">Chatt</SheetTitle><SheetDescription className="sr-only">Kanaler, team och direktchattar</SheetDescription>{view}</SheetContent></Sheet>
      : open && <section aria-label="Chatt" className="fixed right-4 bottom-24 z-50 w-[380px] max-w-[calc(100vw-32px)] h-[600px] max-h-[calc(100dvh-160px)] bg-card border rounded-lg shadow-xl overflow-hidden">{view}</section>}
  </>;
}
