import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/ui/chip';
import { buildListDays, type ScheduleEvent } from '@/lib/schedule';
import { KIND_DOT } from './eventStyle';

interface Props {
  events: ScheduleEvent[];
  weekDates: string[];
  today: string;
  /** Dag som ska hamna överst (från månadsvyn). */
  focusDate: string | null;
  recentId: string | null;
  conflictIds: Set<string>;
  onSelectEvent: (id: string) => void;
}

export function ListView({ events, weekDates, today, focusDate, recentId, conflictIds, onSelectEvent }: Props) {
  const days = useMemo(() => buildListDays(events, weekDates, today), [events, weekDates, today]);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (!focusDate) return;
    const el = refs.current[focusDate];
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, [focusDate, weekDates]);

  return (
    <div className="space-y-4">
      {days.map(day => (
        <section key={day.date} ref={el => { refs.current[day.date] = el; }} tabIndex={-1} aria-labelledby={`list-${day.date}`} className="scroll-mt-24 rounded-[14px] border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <h3 id={`list-${day.date}`} className="flex items-center gap-2 border-b border-border px-4 py-2.5 font-display text-base font-semibold">
            {day.title}
            {day.isToday && <span className="rounded-full bg-primary px-2 py-0.5 font-sans text-xs font-semibold text-primary-foreground">Idag</span>}
          </h3>
          {day.items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Inga bokningar</p>
          ) : (
            <ul className="divide-y divide-border">
              {day.items.map(item => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(item.event.id)}
                    className={cn(
                      'grid min-h-[52px] w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 px-4 py-2 text-left md:grid-cols-[64px_auto_minmax(0,1fr)_auto]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      recentId === item.event.id && 'bg-gold-soft text-foreground',
                    )}
                  >
                    <span className="font-mono text-sm">{item.timeLabel}</span>
                    <span className="flex min-w-0 items-center gap-2 md:contents">
                      <Chip className="shrink-0"><span className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[item.event.kind])} aria-hidden="true" />{item.kindLabel}</Chip>
                      <span className="truncate text-sm text-muted-foreground md:order-last md:text-right">{item.team}</span>
                    </span>
                    <span className={cn('col-start-2 truncate text-sm font-semibold md:col-start-auto', conflictIds.has(item.event.id) && 'text-destructive')}>
                      {item.place}{conflictIds.has(item.event.id) ? ' · krock' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
