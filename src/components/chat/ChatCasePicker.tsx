import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRole } from '@/hooks/useRole';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';

export interface PendingChatCase { id: string; address: string }
export function ChatCasePicker({ onSelect }: { onSelect: (c: PendingChatCase) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { role } = useRole();
  const mobile = useIsMobile();
  const source = role?.type === 'montor' ? 'cases_montor' : 'cases';
  const query = useQuery({
    queryKey: ['chat-case-picker', role?.name, source], enabled: open && !!role,
    queryFn: async () => {
      const { data, error } = await supabase.from(source).select('id, address, customer_name').order('updated_at', { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const trigger = <Button type="button" variant="ghost" size="icon" className="h-12 w-12 shrink-0" aria-label="Bifoga ärende" onClick={() => setOpen(v => !v)}><Paperclip className="h-5 w-5" /></Button>;
  const content = <div className="space-y-3 p-3 safe-bottom">
    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök adress eller kund…" aria-label="Sök ärende att bifoga" className="min-h-12" />
    <div className="max-h-[50dvh] overflow-y-auto">
      {query.isLoading ? <p className="p-3 text-sm text-muted-foreground">Hämtar ärenden…</p> : query.error ? <p className="p-3 text-sm text-destructive">Kunde inte hämta ärenden.</p> : <>
        {(query.data ?? []).filter(c => `${c.address} ${c.customer_name}`.toLowerCase().includes(search.toLowerCase())).map(c => c.id && c.address ? <Button key={c.id} type="button" variant="ghost" className="h-auto min-h-14 w-full justify-start whitespace-normal gap-2 border-b text-left" onClick={() => { if (!c.id || !c.address) return; onSelect({ id: c.id, address: c.address }); setOpen(false); setSearch(''); }}><MapPin className="h-4 w-4 shrink-0" /><span className="min-w-0"><span className="block break-words">{c.address}</span><span className="block text-xs font-normal text-muted-foreground">{c.customer_name}</span></span></Button> : null)}
        {!(query.data ?? []).some(c => `${c.address} ${c.customer_name}`.toLowerCase().includes(search.toLowerCase())) && <p className="p-3 text-sm text-muted-foreground">Inga ärenden att visa.</p>}
      </>}
    </div>
  </div>;
  return mobile ? <>{trigger}<Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="safe-bottom"><SheetTitle>Bifoga ärende</SheetTitle><SheetDescription className="sr-only">Välj ett ärende</SheetDescription>{content}</SheetContent></Sheet></> : <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent side="top" align="start" className="w-80 p-0">{content}</PopoverContent></Popover>;
}