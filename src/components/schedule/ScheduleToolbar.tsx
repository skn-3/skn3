import { AlertTriangle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ALL_KINDS, KIND_LABELS, VIEW_LABELS, filterLabel,
  type ScheduleFilter, type ScheduleKind, type ScheduleViewMode,
} from '@/lib/schedule';
import { KIND_DOT, segmentClasses } from './eventStyle';

interface Props {
  view: ScheduleViewMode;
  views: ScheduleViewMode[];
  onView: (v: ScheduleViewMode) => void;
  /** "v.47" (vecka och lista) */
  weekChip: string | null;
  /** "16–22 november" eller "november 2026" */
  rangeLabel: string;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  filter: ScheduleFilter;
  onFilter: (f: ScheduleFilter) => void;
  teamNames: string[];
  sellers: string[];
  /** Visas när kön inte syns bredvid tavlan. */
  queueButton: { total: number; onClick: () => void } | null;
  summary: string | null;
  conflict: { text: string; onClick: () => void } | null;
}

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
}

export function ScheduleToolbar(p: Props) {
  const unit = p.view === 'manad' ? 'månad' : 'vecka';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-2xl font-semibold md:text-3xl">Schema</h1>
        <div className="flex items-center gap-2">
          {p.weekChip && <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-sm font-semibold">{p.weekChip}</span>}
          <span className="text-sm font-semibold text-muted-foreground">{p.rangeLabel}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={p.onPrev} aria-label={`Föregående ${unit}`}><ChevronLeft className="h-5 w-5" /></Button>
          <Button variant="outline" className="h-11" onClick={p.onToday}>Idag</Button>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={p.onNext} aria-label={`Nästa ${unit}`}><ChevronRight className="h-5 w-5" /></Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Vy">
            {p.views.map(v => (
              <button key={v} type="button" aria-pressed={p.view === v} onClick={() => p.onView(v)} className={segmentClasses(p.view === v)}>{VIEW_LABELS[v]}</button>
            ))}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11"><Filter className="h-4 w-4" />{filterLabel(p.filter)}</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70vh] w-72 overflow-y-auto p-3">
              <FilterGroup title="Team" options={p.teamNames} selected={p.filter.teams} onToggle={t => p.onFilter({ ...p.filter, teams: toggle(p.filter.teams, t) })} />
              <FilterGroup title="Säljare" options={p.sellers} selected={p.filter.sellers} onToggle={s => p.onFilter({ ...p.filter, sellers: toggle(p.filter.sellers, s) })} />
              {(p.filter.teams.length > 0 || p.filter.sellers.length > 0) && (
                <Button variant="ghost" className="mt-2 h-11 w-full" onClick={() => p.onFilter({ ...p.filter, teams: [], sellers: [] })}>Visa alla</Button>
              )}
            </PopoverContent>
          </Popover>

          {p.queueButton && (
            <Button variant="gold" className="h-11" onClick={p.queueButton.onClick}>
              Att boka <span className="font-mono">{p.queueButton.total}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Visa typer">
          {ALL_KINDS.map((k: ScheduleKind) => {
            const on = p.filter.kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => p.onFilter({ ...p.filter, kinds: toggle(p.filter.kinds, k) })}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold motion-safe:transition-colors md:gap-2 md:px-3',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  on ? 'border-border-strong bg-card text-foreground' : 'border-border bg-transparent text-muted-foreground line-through',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', KIND_DOT[k], !on && 'opacity-40')} aria-hidden="true" />
                {KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
        {(p.summary || p.conflict) && (
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            {p.summary && <p className="text-sm text-muted-foreground">{p.summary}</p>}
            {p.conflict && (
              <button
                type="button"
                onClick={p.conflict.onClick}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-destructive-soft px-3 text-sm font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />{p.conflict.text}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, options, selected, onToggle }: { title: string; options: string[]; selected: readonly string[]; onToggle: (v: string) => void }) {
  if (!options.length) return null;
  return (
    <fieldset className="mb-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {options.map(o => (
        <label key={o} className="flex min-h-11 items-center gap-3 rounded-md px-1 text-sm">
          <Checkbox checked={selected.includes(o)} onCheckedChange={() => onToggle(o)} className="h-5 w-5" />
          {o}
        </label>
      ))}
    </fieldset>
  );
}
