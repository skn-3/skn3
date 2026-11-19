import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useChat } from '@/hooks/useChat';
import { chatRoleLabel } from '@/lib/chat';
import { ChatAvatar } from './ChatAvatars';
import type { ChatViewMode } from './ChatView';

/** Ny konversation: 1:1 med en mottagare, grupp med namn vid flera. Startas via start_conversation. */
export function NewConversation({ mode, onClose }: { mode: ChatViewMode; onClose?: () => void }) {
  const chat = useChat();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const compact = mode === 'compact';
  const people = chat.profiles.filter(p => p.id && p.id !== chat.userId && p.name?.toLowerCase().includes(search.toLowerCase()));

  async function startChat() {
    setBusy(true);
    try { const id = await chat.start(selected, title); chat.openConversation(id); }
    catch { toast.error('Chatten kunde inte startas. Försök igen.'); }
    finally { setBusy(false); }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col text-foreground', compact && 'safe-bottom')}>
      <header className={cn('flex min-h-[60px] shrink-0 items-center gap-2 border-b py-2', compact ? 'px-2' : 'px-4')}>
        {compact && <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Tillbaka till konversationer" onClick={chat.backToList}><ArrowLeft className="h-5 w-5" /></Button>}
        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold">Ny konversation</h2>
        {!compact && <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Avbryt ny konversation" onClick={chat.backToList}><X className="h-5 w-5" /></Button>}
        {compact && onClose && <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label="Stäng chatten" onClick={onClose}><X className="h-5 w-5" /></Button>}
      </header>
      <div className={cn('shrink-0 space-y-3 py-3', compact ? 'px-3' : 'px-4 max-w-xl')}>
        <Input aria-label="Sök mottagare" placeholder="Sök namn..." className="min-h-11" value={search} onChange={e => setSearch(e.target.value)} />
        {selected.length > 1 && <Input aria-label="Gruppnamn" placeholder="Gruppnamn" className="min-h-11" value={title} onChange={e => setTitle(e.target.value)} />}
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-3' : 'px-4')}>
        <div className={cn(!compact && 'max-w-xl')}>
          {people.map(p => {
            if (!p.id) return null;
            const id = p.id;
            return (
              <label key={id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b py-2">
                <Checkbox checked={selected.includes(id)} onCheckedChange={checked => setSelected(old => checked ? [...old, id] : old.filter(u => u !== id))} />
                <ChatAvatar name={p.name} role={p.role} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{chatRoleLabel(p.role)}</span></span>
              </label>
            );
          })}
          {!people.length && <p className="py-8 text-center text-sm text-muted-foreground">Ingen matchar sökningen.</p>}
        </div>
      </div>
      <div className={cn('shrink-0 border-t p-3', !compact && 'px-4')}>
        <Button className={cn('min-h-11', compact ? 'w-full' : 'w-full max-w-xl')} disabled={!selected.length || busy} onClick={() => void startChat()}>Starta chatt</Button>
      </div>
    </div>
  );
}
