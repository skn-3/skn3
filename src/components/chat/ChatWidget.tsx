import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Plus, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useChat } from '@/hooks/useChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { relativeTimeSv } from '@/lib/relativeTimeSv';

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const mobile = useIsMobile();
  const chat = useChat(open ? activeId : null);
  const conversation = chat.conversations.find(c => c.id === activeId);
  const bottom = useRef<HTMLDivElement>(null);
  const lastMessageId = conversation?.latest?.id;
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: 'end' }); }, [open, activeId, lastMessageId]);
  useEffect(() => {
    const handler = (event: Event) => { setActiveId((event as CustomEvent<string>).detail); setCreating(false); setOpen(true); };
    window.addEventListener('smartklimat:open-chat', handler);
    return () => window.removeEventListener('smartklimat:open-chat', handler);
  }, []);
  async function send() {
    if (!activeId || !body.trim() || busy) return;
    setBusy(true);
    try { await chat.send(activeId, body); setBody(''); } catch { toast.error('Meddelandet kunde inte skickas. Försök igen.'); } finally { setBusy(false); }
  }
  const content = <div className="flex h-full min-h-0 flex-col text-foreground">
    <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b">
      {(activeId || creating) && <Button size="icon" variant="ghost" className="h-12 w-12 shrink-0" aria-label="Tillbaka till konversationer" onClick={() => { setActiveId(null); setCreating(false); setBody(''); }}><ArrowLeft className="h-5 w-5" /></Button>}
      <h2 className="font-display font-bold text-lg flex-1 min-w-0 truncate">{creating ? 'Ny chatt' : activeId ? conversation?.name || 'Konversation' : 'Meddelanden'}</h2>
      {!activeId && !creating && <Button variant="ghost" size="sm" className="min-h-12" onClick={() => { setCreating(true); setSelected([]); setSearch(''); setTitle(''); }}><Plus className="h-4 w-4 mr-1" />Ny chatt</Button>}
      <Button size="icon" variant="ghost" className="h-12 w-12 shrink-0" aria-label="Stäng chatten" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
    </div>
    {chat.error ? <div className="p-4"><p>Kunde inte hämta meddelanden.</p><Button variant="outline" onClick={() => void chat.refetch()}>Försök igen</Button></div> : chat.isLoading ? <div className="p-4 space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : creating ? <>
      <div className="p-3 space-y-3"><Input aria-label="Sök mottagare" placeholder="Sök namn..." className="min-h-12" value={search} onChange={e => setSearch(e.target.value)} />{selected.length > 1 && <Input aria-label="Gruppnamn" placeholder="Gruppnamn" className="min-h-12" value={title} onChange={e => setTitle(e.target.value)} />}</div>
      <div className="overflow-y-auto flex-1 px-3">{chat.profiles.filter(p => p.id && p.id !== chat.userId && p.name?.toLowerCase().includes(search.toLowerCase())).map(p => {
        if (!p.id) return null;
        const id = p.id;
        return <label key={id} className="flex gap-3 items-center min-h-14 py-2 border-b cursor-pointer"><Checkbox checked={selected.includes(id)} onCheckedChange={checked => setSelected(old => checked ? [...old, id] : old.filter(u => u !== id))} /><span className="flex-1"><span className="block font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.role === 'seller' ? 'Säljare' : p.role === 'coordinator' ? 'Koordinator' : 'Montör'}</span></span></label>;
      })}</div>
      <div className="p-3 border-t"><Button className="w-full min-h-12" disabled={!selected.length || busy} onClick={async () => {
        setBusy(true);
        try { const id = await chat.start(selected, title); setActiveId(id); setCreating(false); } catch { toast.error('Chatten kunde inte startas. Försök igen.'); } finally { setBusy(false); }
      }}>Starta chatt</Button></div>
    </> : activeId ? <>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
        {!conversation && <p className="text-muted-foreground text-center">Konversationen kunde inte hittas.</p>}
        {conversation?.messages.map((m, i, messages) => {
          const mine = m.sender_id === chat.userId;
          const date = new Date(m.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
          const previous = messages[i - 1];
          const newDay = !previous || new Date(previous.created_at).toLocaleDateString('sv-SE') !== new Date(m.created_at).toLocaleDateString('sv-SE');
          return <div key={m.id}>{newDay && <div className="text-center text-xs text-muted-foreground my-4">{date}</div>}<div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className="max-w-[85%] min-w-0">
            {conversation.is_group && !mine && <p className="text-xs text-muted-foreground mb-1">{chat.profiles.find(p => p.id === m.sender_id)?.name ?? 'Användare'}</p>}
            <p className={`px-3 py-2 rounded-lg whitespace-pre-wrap break-words text-sm ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{m.body}</p>
            <p className={`text-[11px] text-muted-foreground mt-1 ${mine ? 'text-right' : ''}`}>{new Date(m.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</p>
          </div></div></div>;
        })}<div ref={bottom} />
      </div>
      <form className="p-3 border-t flex gap-2 items-end shrink-0 safe-bottom" onSubmit={e => { e.preventDefault(); void send(); }}>
        <Textarea aria-label="Meddelande" placeholder="Skriv ett meddelande..." className="min-h-12 max-h-28 resize-none" rows={2} maxLength={10000} value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (!mobile && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <Button type="submit" className="min-h-12 px-3" disabled={!conversation || !body.trim() || busy}><Send className="h-4 w-4 mr-1" />Skicka</Button>
      </form>
    </> : <div className="overflow-y-auto flex-1">{!chat.conversations.length ? <p className="py-12 text-center text-muted-foreground">Inga konversationer ännu.</p> : chat.conversations.map(c => <Button key={c.id} variant="ghost" className="w-full rounded-none h-auto min-h-20 text-left whitespace-normal border-b p-4 gap-3" onClick={() => { setActiveId(c.id); setBody(''); }}>
      <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className={`block truncate ${c.unread ? 'font-bold' : 'font-medium'}`}>{c.name}</span><span className="block truncate text-xs text-muted-foreground font-normal">{c.latest?.body ?? 'Inga meddelanden ännu'}</span><span className="block text-[11px] text-muted-foreground mt-1 font-normal">{relativeTimeSv(c.latest?.created_at ?? c.created_at)}</span></span>{c.unread > 0 && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
    </Button>)}</div>}
  </div>;
  return <>
    <Button size="icon" className="fixed right-4 bottom-24 md:bottom-5 z-40 h-14 w-14 rounded-full shadow-lg" aria-label={`Öppna meddelanden, ${chat.unread} olästa`} onClick={() => setOpen(!open)}><MessageCircle className="h-6 w-6" />{chat.unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full px-1 bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">{chat.unread > 9 ? '9+' : chat.unread}</span>}</Button>
    {mobile ? <Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" hideCloseButton className="w-full max-w-full h-[100dvh] p-0"><SheetTitle className="sr-only">Meddelanden</SheetTitle><SheetDescription className="sr-only">Dina konversationer</SheetDescription>{content}</SheetContent></Sheet> : open && <section aria-label="Meddelanden" className="fixed right-4 bottom-24 z-50 w-[380px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100dvh-160px)] bg-card border rounded-lg shadow-xl overflow-hidden">{content}</section>}
  </>;
}