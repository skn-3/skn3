import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from '@/hooks/useNotifications';
import { relativeTimeSv } from '@/lib/relativeTimeSv';
import { notificationIcon } from '@/lib/notificationKinds';

export function NotificationBell({ onDark = true }: { onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const { rows, unread, markRead, isLoading, error, refetch } = useNotifications();
  const trigger = <Button variant={onDark ? "onDark" : "ghost"} size="icon" className="relative h-12 w-12" aria-label={`Notiser, ${unread} olästa`} onClick={() => setOpen(!open)}>
    <Bell className="h-5 w-5" />
    {unread > 0 && <span className="absolute right-0 top-0 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
  </Button>;
  const list = <div className="safe-bottom flex flex-col min-h-0 text-foreground">
    <div className="flex items-center justify-between gap-2 p-3 border-b">
      <h2 className="font-display font-bold text-lg">Notiser</h2>
      <Button size="sm" variant="ghost" className="min-h-12" disabled={!unread} onClick={() => void markRead().catch(() => {})}><CheckCheck className="h-4 w-4 mr-1" />Markera alla som lästa</Button>
      {mobile && <Button size="icon" variant="ghost" className="h-12 w-12" aria-label="Stäng notiser" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>}
    </div>
    <div className="overflow-y-auto max-h-[70dvh]">
      {isLoading ? <div className="p-3 space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : error ? <div className="p-4"><p>Kunde inte hämta notiser.</p><Button variant="outline" onClick={() => void refetch()}>Försök igen</Button></div> : !rows.length ? <p className="py-12 text-center text-muted-foreground">Inga notiser ännu</p> : rows.map(row => {
        const Icon = notificationIcon(row.kind);
        return <Button key={row.id} variant="ghost" className="w-full h-auto min-h-20 rounded-none px-4 py-3 flex items-start gap-3 text-left whitespace-normal border-b" onClick={async () => {
          try { await markRead(row.id); } catch { return; }
          setOpen(false);
          const link = row.link as { type?: string; id?: string } | null;
          if (!link?.id) return;
          if (link.type === 'case') navigate(`/?case=${encodeURIComponent(link.id)}`);
          else if (link.type === 'a_order') navigate(`/?aorder=${encodeURIComponent(link.id)}`);
        }}>
          <Icon className="h-5 w-5 mt-1 shrink-0 text-muted-foreground" />
          <span className="flex-1 min-w-0"><span className={`block break-words ${!row.read_at ? 'font-bold' : 'font-normal'}`}>{row.title}</span>{row.body && <span className="block text-xs text-muted-foreground break-words mt-1">{row.body}</span>}<span className="block mt-1 text-xs font-normal text-muted-foreground">{relativeTimeSv(row.created_at)}</span></span>
          {!row.read_at && <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-2" />}
        </Button>;
      })}
    </div>
  </div>;
  if (mobile) return <>{trigger}<Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" className="w-full max-w-full p-0 [&>button]:hidden"><SheetTitle className="sr-only">Notiser</SheetTitle><SheetDescription className="sr-only">Dina senaste notiser</SheetDescription>{list}</SheetContent></Sheet></>;
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="end" className="w-[400px] max-w-[calc(100vw-24px)] p-0">{list}</PopoverContent></Popover>;
}