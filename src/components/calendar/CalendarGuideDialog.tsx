import { useCallback, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useMinWidth } from '@/hooks/useMinWidth';
import { calendarLinks, readOwnConnection, useCalendarDevice, useCalendarPreview, useOwnCalendarToken, useInvalidateCalendar } from '@/hooks/useCalendar';
import { detectPlatform } from '@/lib/calendar/platform';
import { markDone, markPending, snoozeUntilTomorrow } from '@/lib/calendar/popup';
import { isLocalSkip } from '@/lib/booking/messages';
import { toIso } from '@/lib/schedule';
import type { UserRole } from '@/lib/constants';
import { CalendarGuide, type GuideSendResult } from './CalendarGuide';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: UserRole;
  /** "Visa mitt schema" i klart-läget; stänger annars bara guiden. */
  onShowSchedule?: () => void;
}

async function sendOwnGuide(): Promise<GuideSendResult> {
  const { data, error } = await supabase.functions.invoke('calendar-connect', { body: { action: 'send_guide' } });
  if (error) return { status: 'failed' };
  if (data?.sent) return { status: 'sent', masked: data.to ?? '' };
  if (isLocalSkip(data)) return { status: 'local', masked: data.to ?? '' };
  if (data?.reason === 'no_email') return { status: 'no_email' };
  return { status: 'failed' };
}

/** Kalenderguiden i appen: bottenpanel på telefon, dialog på större skärmar. Ersätter MyCalendarDialog. */
export function CalendarGuideDialog({ open, onOpenChange, role, onShowSchedule }: Props) {
  const wide = useMinWidth(768);
  const userName = role.name;
  const token = useOwnCalendarToken(userName, open);
  const links = calendarLinks(token.data);
  const preview = useCalendarPreview(role, open);
  const [, updateDevice] = useCalendarDevice(userName);
  const invalidate = useInvalidateCalendar();
  const scrollRef = useRef<HTMLDivElement>(null);
  const platform = useMemo(() => detectPlatform(typeof navigator !== 'undefined' ? navigator.userAgent : ''), []);

  const qc = useQueryClient();
  // Raden guiden ser skrivs även till enhetens cache, så att klarmarkeringen inte stäms av mot en gammal rad.
  const readStatus = useCallback(async () => {
    const row = await readOwnConnection(userName);
    qc.setQueryData(['calendar-connection', userName], row);
    return row;
  }, [qc, userName]);
  const close = () => onOpenChange(false);
  const content = open ? (
    <CalendarGuide
      key={userName}
      name={userName}
      team={role.type === 'montor'}
      feedUrl={links.feedUrl}
      guideUrl={links.guideUrl}
      initialPlatform={platform}
      preview={preview.rows}
      upcomingCount={preview.count}
      readStatus={readStatus}
      sendLink={sendOwnGuide}
      onSnooze={() => { updateDevice((s) => snoozeUntilTomorrow(s, toIso(new Date()))); close(); }}
      onPending={() => updateDevice((s) => markPending(s, Date.now()))}
      onDone={() => { updateDevice(markDone); void invalidate(userName); }}
      onShowSchedule={() => { close(); onShowSchedule?.(); }}
      onModeChange={() => scrollRef.current?.scrollTo({ top: 0 })}
    />
  ) : null;

  const closeButton = (
    <button type="button" onClick={close} aria-label="Stäng guiden" className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <X className="h-5 w-5" />
    </button>
  );

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-xl gap-0 overflow-hidden p-0 [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Min kalender</DialogTitle>
          {closeButton}
          <div ref={scrollRef} className="max-h-[90vh] overflow-y-auto p-6 pr-14">{content}</div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[94vh]">
        <DrawerTitle className="sr-only">Min kalender</DrawerTitle>
        <div className="relative">
          {closeButton}
          <div ref={scrollRef} className="mx-auto max-h-[86vh] max-w-xl overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pr-14 pt-2">{content}</div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
