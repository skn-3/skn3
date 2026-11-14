import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BANNER_TEXTS } from '@/lib/calendar/popup';

/** Banderollen överst i montörens Schema tills enheten har kopplat kalendern. */
export function CalendarBanner({ stale, onOpen }: { stale: boolean; onOpen: () => void }) {
  return (
    <section aria-label="Kalender" className="flex flex-wrap items-center gap-3 rounded-xl border border-gold bg-gold-soft px-4 py-3 text-foreground">
      <CalendarPlus className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-semibold leading-tight">{BANNER_TEXTS.title}</p>
        <p className="text-sm">{stale ? BANNER_TEXTS.stale : BANNER_TEXTS.text}</p>
      </div>
      <Button onClick={onOpen} className="h-11 shrink-0 px-5">{BANNER_TEXTS.button}</Button>
    </section>
  );
}
