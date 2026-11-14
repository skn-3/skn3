import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  dayLabel, deliveryCountLabel, dayNumber, kmCountLabel, monthWeekModel, monthWeeks, parseIso, weekChip,
  type ConflictResult, type ScheduleEvent,
} from '@/lib/schedule';
import { eventClasses } from './eventStyle';

interface Props {
  year: number;
  month: number;
  events: ScheduleEvent[];
  conflicts: ConflictResult;
  today: string;
  onOpenWeek: (year: number, week: number) => void;
  onOpenDay: (date: string) => void;
}

const WEEKDAYS = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'];
const LEGEND: Array<{ label: string; cls: string }> = [
  { label: 'Montage pågår', cls: 'bg-primary border border-primary' },
  { label: 'Montage bokat', cls: 'bg-success-soft border border-primary/25' },
  { label: 'Klart', cls: 'bg-muted border border-border' },
  { label: 'KM', cls: 'bg-secondary border border-secondary-foreground/20' },
  { label: 'Leverans', cls: 'bg-info-soft border border-info/25' },
];

export function MonthView({ year, month, events, conflicts, today, onOpenWeek, onOpenDay }: Props) {
  const weeks = useMemo(() => monthWeeks(year, month), [year, month]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {LEGEND.map(l => (
          <span key={l.label} className="inline-flex items-center gap-1.5"><span className={cn('h-3 w-5 rounded', l.cls)} aria-hidden="true" />{l.label}</span>
        ))}
        <span className="basis-full sm:basis-auto">Tryck på en dag för dagens lista, eller på veckonumret för veckoschemat.</span>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="grid border-b border-border text-xs font-semibold text-muted-foreground" style={{ gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))' }}>
          <span className="px-1 py-2 text-center">v.</span>
          {WEEKDAYS.map(d => <span key={d} className="border-l border-border py-2 text-center">{d}</span>)}
        </div>
        {weeks.map(w => {
          const model = monthWeekModel(events, w.dates);
          const lanes = Math.max(0, ...model.bars.map(b => b.lane + 1));
          return (
            <div key={`${w.year}-${w.week}`} className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))' }}>
              <button
                type="button"
                onClick={() => onOpenWeek(w.year, w.week)}
                aria-label={`Öppna vecka ${w.week} i veckoschemat`}
                className="flex min-h-11 items-start justify-center pt-2 font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {weekChip(w.week)}
              </button>
              <div className="relative col-span-7">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                  {w.dates.map((d, i) => {
                    const inMonth = parseIso(d).getMonth() === month - 1;
                    const counts = model.perDay[i];
                    const isToday = d === today;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onOpenDay(d)}
                        aria-label={`Visa dagens lista, ${dayLabel(d, today)}`}
                        className={cn('flex min-w-0 flex-col items-start overflow-hidden border-l border-border p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', isToday && 'bg-primary/5')}
                      >
                        <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-xs', isToday ? 'bg-primary text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/60')}>
                          {dayNumber(d)}
                        </span>
                        <span className="mt-auto flex w-full min-w-0 flex-col gap-0.5 text-[11px] leading-tight text-muted-foreground">
                          {counts.km > 0 && <span className="truncate">{kmCountLabel(counts.km)}</span>}
                          {counts.deliveries > 0 && <span className="truncate text-info">{deliveryCountLabel(counts.deliveries)}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="pointer-events-none relative grid gap-0.5 px-0.5 pb-10 pt-8" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: lanes ? `repeat(${lanes}, 22px)` : undefined, minHeight: 92 }}>
                  {model.bars.map(b => (
                    <span
                      key={`${b.event.id}-${b.start}`}
                      className={cn(
                        'truncate rounded px-1.5 text-[11px] font-semibold leading-[20px]',
                        b.unassigned ? 'border border-dashed border-gold bg-gold-soft text-foreground' : eventClasses(b.event),
                        b.continuesBefore && 'rounded-l-none',
                        b.continuesAfter && 'rounded-r-none',
                        conflicts.byEvent.has(b.event.id) && 'ring-2 ring-destructive',
                      )}
                      style={{ gridColumn: `${b.start + 1} / span ${b.span}`, gridRow: b.lane + 1 }}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
                {model.hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenWeek(w.year, w.week)}
                    className="group absolute bottom-0 right-0 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full px-1 focus-visible:outline-none"
                  >
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">+{model.hiddenCount} till</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
