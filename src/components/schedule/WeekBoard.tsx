import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  KIND_LABELS, capacityBars, dayNumber, dayShort, deliveryGroupLabels, eventLine, isWeekend, targetCellLabel, teamLoad, teamLoadLabel,
  type BoardRow, type ConflictResult, type DeliveryGroup, type PlacementResult, type ScheduleEvent,
} from '@/lib/schedule';
import { eventClasses } from './eventStyle';

export const DAY_TEMPLATE = 'repeat(5, minmax(0, 1fr)) 56px 56px';
const BOARD_TEMPLATE = `156px ${DAY_TEMPLATE}`;

export interface PlacementView {
  cells: Record<string, PlacementResult[]>;
  /** Ärendets förvalda team (rad markeras). */
  defaultTeam: string | null;
  selected: { rowKey: string; date: string } | null;
  onTarget: (row: BoardRow, date: string) => void;
}

interface Props {
  rows: BoardRow[];
  weekDates: string[];
  today: string;
  /** Alla (filtrerade) händelser, för teamens belastning. */
  events: ScheduleEvent[];
  conflicts: ConflictResult;
  recentId: string | null;
  placement: PlacementView | null;
  onSelectEvent: (eventId: string) => void;
  onSelectGroup: (groupId: string, group: DeliveryGroup) => void;
}

const SUB: Record<string, string> = { logistik: 'Leveranser och hämtning', ej_tilldelat: 'Har dag men saknar team' };

export function WeekBoard({ rows, weekDates, today, events, conflicts, recentId, placement, onSelectEvent, onSelectGroup }: Props) {
  const empty = rows.every(r => r.segments.length === 0);
  return (
    <div className="overflow-x-auto rounded-[14px] border border-border bg-card">
      <div className="min-w-[800px]">
        <div className="grid border-b border-border" style={{ gridTemplateColumns: BOARD_TEMPLATE }}>
          <div className="flex items-end px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</div>
          {weekDates.map(d => {
            const isToday = d === today;
            return (
              <div key={d} className={cn('flex flex-col items-center gap-0.5 border-l border-border py-2', isToday && 'bg-primary/5')}>
                <span className="text-xs font-semibold text-muted-foreground">{dayShort(d)}</span>
                <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 font-mono text-sm', isToday ? 'bg-primary text-primary-foreground' : 'text-foreground')}>
                  {dayNumber(d)}
                </span>
              </div>
            );
          })}
        </div>

        {empty && !placement && (
          <p className="border-b border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Inga bokningar den här veckan. Välj ett ärende under Att boka för att börja planera.
          </p>
        )}

        {rows.map(row => (
          <BoardRowView
            key={row.key}
            row={row}
            weekDates={weekDates}
            today={today}
            events={events}
            conflicts={conflicts}
            recentId={recentId}
            placement={placement}
            onSelectEvent={onSelectEvent}
            onSelectGroup={onSelectGroup}
          />
        ))}
      </div>
    </div>
  );
}

function BoardRowView({ row, weekDates, today, events, conflicts, recentId, placement, onSelectEvent, onSelectGroup }: Omit<Props, 'rows'> & { row: BoardRow }) {
  const isDefault = !!placement && row.kind === 'team' && row.team === placement.defaultTeam;
  const cells = placement?.cells[row.key];
  const lanes = Math.max(1, row.laneCount);
  return (
    <div className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: BOARD_TEMPLATE }}>
      <div className={cn('flex flex-col justify-center gap-1 px-3 py-2', isDefault && 'bg-gold-soft text-foreground')}>
        <span className="break-words text-sm font-semibold leading-tight text-foreground">
          {row.label}{isDefault && <span className="font-normal"> · ärendets team</span>}
        </span>
        {row.kind === 'team' && row.team ? (
          <>
            <span className="text-[11px] leading-tight text-muted-foreground">{teamLoadLabel(teamLoad(events, weekDates, row.team))}</span>
            <span className="flex gap-1" aria-hidden="true">
              {capacityBars(events, weekDates, row.team).map((on, i) => (
                <span key={i} className={cn('h-1.5 w-4 rounded-full', on ? 'bg-primary' : 'bg-muted')} />
              ))}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{SUB[row.kind]}</span>
        )}
      </div>

      <div className="relative col-span-7 min-h-[76px]">
        {/* Lager 1: bakgrundsceller */}
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: DAY_TEMPLATE }} aria-hidden="true">
          {weekDates.map(d => (
            <div key={d} className={cn('border-l border-border', d === today && 'bg-primary/5', isWeekend(d) && d !== today && 'bg-muted/40')} />
          ))}
        </div>

        {/* Lager 2: bokningarna */}
        <div
          className="relative grid gap-1 p-1"
          style={{ gridTemplateColumns: DAY_TEMPLATE, gridAutoFlow: 'row dense', gridTemplateRows: `repeat(${lanes}, minmax(44px, auto))` }}
        >
          {row.segments.map(seg => {
            const group = row.groups[seg.event.id];
            const e = seg.event;
            const conflict = conflicts.byEvent.has(e.id);
            const recent = recentId === e.id;
            const labels = group ? deliveryGroupLabels(group) : null;
            const title = labels ? labels.title : e.address;
            const line = labels ? labels.sub : eventLine(e);
            return (
              <button
                key={`${e.id}-${seg.start}`}
                type="button"
                onClick={() => (group ? onSelectGroup(e.id, group) : onSelectEvent(e.id))}
                aria-label={`${group ? title : `${KIND_LABELS[e.kind]} ${title}`}, ${line}${conflict ? ', krock' : ''}`}
                className={cn(
                  'relative flex min-h-11 min-w-0 flex-col justify-center rounded-lg px-2 py-1 text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  eventClasses(e),
                  seg.continuesBefore && 'rounded-l-none',
                  seg.continuesAfter && 'rounded-r-none',
                  conflict && 'ring-2 ring-destructive',
                  recent && !conflict && 'ring-2 ring-gold',
                )}
                style={{ gridColumn: `${seg.start + 1} / span ${seg.span}`, gridRow: seg.lane + 1 }}
              >
                <span className="flex min-w-0 items-center gap-1">
                  {seg.continuesBefore && <ChevronLeft className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  {conflict && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
                  {e.kind === 'montage' && e.state === 'pagar' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />}
                  <span className="truncate text-[13px] font-semibold leading-tight">{title}</span>
                  {seg.continuesAfter && <ChevronRight className="ml-auto h-3 w-3 shrink-0" aria-hidden="true" />}
                </span>
                <span className="truncate text-xs leading-tight opacity-85">{line}</span>
              </button>
            );
          })}
        </div>

        {/* Lager 3: placeringsläget */}
        {cells && placement && (
          <div className="absolute inset-0 z-10 grid gap-1 p-1" style={{ gridTemplateColumns: DAY_TEMPLATE, gridTemplateRows: '1fr' }}>
            {weekDates.map((d, i) => {
              const r = cells[i];
              if (r.level === 'blocked') {
                return <div key={d} className="schedule-stripes-blocked rounded-md" aria-hidden="true" />;
              }
              const selected = placement.selected?.rowKey === row.key && placement.selected.date === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => placement.onTarget(row, d)}
                  aria-label={targetCellLabel(row.label, d, today)}
                  aria-pressed={selected}
                  className={cn(
                    'flex min-h-11 items-end justify-end rounded-md border-2 border-dashed border-gold p-1',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'bg-gold-soft/80' : 'bg-transparent',
                  )}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-gold-foreground">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
