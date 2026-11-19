import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { AiConversation } from './AiConversation';
import { ChatSidebar } from './ChatSidebar';
import { ChatThread } from './ChatThread';
import { NewConversation } from './NewConversation';

/** full: två kolumner (fliken Chatt från 768 px). compact: en kolumn (telefon och den flytande rutan). */
export type ChatViewMode = 'full' | 'compact';

/** Sätter ihop lista, konversation, N3prenad-AI och Ny konversation. All data och allt tillstånd kommer från ChatProvider. */
export function ChatView({ mode, onClose, onExpand }: { mode: ChatViewMode; onClose?: () => void; onExpand?: () => void }) {
  const chat = useChat();
  const navigate = useNavigate();
  const { registerSurface } = chat;
  useEffect(() => registerSurface(mode), [mode, registerSurface]);

  // Ärendekort öppnar ärendet som tidigare (/?case=...). I fliken öppnas ärendepanelen ovanpå chatten.
  const openCase = (id: string) => { if (mode === 'compact') onClose?.(); navigate('/?case=' + encodeURIComponent(id)); };
  const compact = mode === 'compact';
  const main = chat.creating
    ? <NewConversation mode={mode} onClose={onClose} />
    : chat.aiActive
      ? <AiConversation onBack={compact ? chat.backToList : undefined} onClose={compact ? onClose : undefined} onOpenCase={openCase} />
      : chat.activeId
        ? <ChatThread key={chat.activeId} mode={mode} onClose={onClose} onExpand={onExpand} onOpenCase={openCase} />
        : null;

  if (compact) return <div className="flex h-full min-h-0 flex-col bg-card text-foreground">{main ?? <ChatSidebar mode="compact" onClose={onClose} onExpand={onExpand} />}</div>;
  return (
    <div className="grid h-full min-h-0 grid-cols-[272px_minmax(0,1fr)]">
      <aside className="min-h-0 border-r bg-background" aria-label="Chattlista"><ChatSidebar mode="full" /></aside>
      <section className="min-h-0 bg-card" aria-label="Konversation">
        {main ?? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <MessagesSquare className="h-10 w-10" aria-hidden="true" />
            <p>Välj en konversation i listan.</p>
          </div>
        )}
      </section>
    </div>
  );
}
