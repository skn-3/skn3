import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, dateFnsLocalizer, Views, type View, type ToolbarProps } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addHours, startOfDay, endOfDay, setISOWeek, setYear, startOfISOWeek, endOfISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { fetchAllCases, type CaseRow } from '@/lib/supabaseClient';
import { MONTORS, SELLERS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft, ChevronRight, Filter, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const locales = { sv };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales,
});

type EventType = 'km' | 'montage' | 'leverans';

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: {
    case_id: string;
    type: EventType;
    team: string | null;
    seller: string;
    weekBased: boolean;
    caseData: CaseRow;
    conflict?: boolean;
  };
}

interface CalendarViewProps {
  onSelectCase: (c: CaseRow) => void;
}

function combineDateTime(dateStr: string, timeStr: string | null): Date {
  const base = new Date(dateStr + 'T00:00:00');
  if (!timeStr) return base;
  const [h, m] = timeStr.split(':').map(Number);
  base.setHours(h || 0, m || 0, 0, 0);
  return base;
}

function buildEvents(cases: CaseRow[]): CalEvent[] {
  const events: CalEvent[] = [];
  for (const c of cases) {
    const anyC = c as any;
    if (c.km_date) {
      const hasTime = !!anyC.km_time;
      const start = hasTime ? combineDateTime(c.km_date, anyC.km_time) : startOfDay(new Date(c.km_date + 'T00:00:00'));
      const end = hasTime ? addHours(start, 2) : endOfDay(start);
      events.push({
        id: `${c.id}-km`,
        title: `KM — ${c.address}`,
        start, end,
        allDay: !hasTime,
        resource: { case_id: c.id, type: 'km', team: c.team, seller: c.seller, weekBased: false, caseData: c },
      });
    }
    if (c.montage_date) {
      const hasTime = !!anyC.montage_time;
      const start = hasTime ? combineDateTime(c.montage_date, anyC.montage_time) : startOfDay(new Date(c.montage_date + 'T00:00:00'));
      const end = hasTime ? addHours(start, 8) : endOfDay(start);
      events.push({
        id: `${c.id}-montage`,
        title: `Montage — ${c.customer_name}${c.team ? ' (' + c.team + ')' : ''}`,
        start, end,
        allDay: !hasTime,
        resource: { case_id: c.id, type: 'montage', team: c.team, seller: c.seller, weekBased: false, caseData: c },
      });
    }
    if (c.delivery_date) {
      const hasTime = !!anyC.delivery_time;
      const start = hasTime ? combineDateTime(c.delivery_date, anyC.delivery_time) : startOfDay(new Date(c.delivery_date + 'T00:00:00'));
      const end = hasTime ? addHours(start, 1) : endOfDay(start);
      events.push({
        id: `${c.id}-leverans`,
        title: `Leverans — ${c.address}`,
        start, end,
        allDay: !hasTime,
        resource: { case_id: c.id, type: 'leverans', team: c.team, seller: c.seller, weekBased: false, caseData: c },
      });
    } else if (anyC.delivery_week && anyC.delivery_year) {
      let d = new Date();
      d = setYear(d, anyC.delivery_year);
      d = setISOWeek(d, anyC.delivery_week);
      const start = startOfISOWeek(d);
      const end = endOfISOWeek(d);
      events.push({
        id: `${c.id}-leverans-w`,
        title: `Leverans v${anyC.delivery_week} — ${c.address}`,
        start, end,
        allDay: true,
        resource: { case_id: c.id, type: 'leverans', team: c.team, seller: c.seller, weekBased: true, caseData: c },
      });
    }
  }
  return events;
}

function detectConflicts(events: CalEvent[]): CalEvent[] {
  const montage = events.filter(e => e.resource.type === 'montage' && !e.allDay);
  const conflictIds = new Set<string>();
  for (let i = 0; i < montage.length; i++) {
    for (let j = i + 1; j < montage.length; j++) {
      const a = montage[i], b = montage[j];
      if (!a.resource.team || !b.resource.team) continue;
      if (a.resource.team !== b.resource.team) continue;
      if (a.start < b.end && b.start < a.end) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  return events.map(e => conflictIds.has(e.id) ? { ...e, resource: { ...e.resource, conflict: true } } : e);
}

function CustomToolbar({ label, onNavigate, onView, view }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onNavigate('PREV')}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate('TODAY')}>Idag</Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate('NEXT')}><ChevronRight className="h-4 w-4" /></Button>
        <span className="ml-2 text-sm font-semibold capitalize">{label}</span>
      </div>
      <div className="hidden md:flex items-center gap-1">
        {(['month', 'week', 'day', 'agenda'] as View[]).map(v => (
          <Button key={v} size="sm" variant={view === v ? 'default' : 'outline'} onClick={() => onView(v)}>
            {v === 'month' ? 'Månad' : v === 'week' ? 'Vecka' : v === 'day' ? 'Dag' : 'Agenda'}
          </Button>
        ))}
      </div>
      <div className="md:hidden">
        <Select value={view} onValueChange={(v) => onView(v as View)}>
          <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Månad</SelectItem>
            <SelectItem value="week">Vecka</SelectItem>
            <SelectItem value="day">Dag</SelectItem>
            <SelectItem value="agenda">Agenda</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'km', label: 'KM' },
  { value: 'montage', label: 'Montage' },
  { value: 'leverans', label: 'Leverans' },
];

export function CalendarView({ onSelectCase }: CalendarViewProps) {
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const [view, setView] = useState<View>(isMobile ? Views.AGENDA : Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [typeFilter, setTypeFilter] = useState<EventType[]>(['km', 'montage', 'leverans']);
  const [teamFilter, setTeamFilter] = useState<string>('alla');
  const [sellerFilter, setSellerFilter] = useState<string>('alla');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', 'all-calendar'],
    queryFn: fetchAllCases,
  });

  const allEvents = useMemo(() => detectConflicts(buildEvents(cases || [])), [cases]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => {
      if (!typeFilter.includes(e.resource.type)) return false;
      if (teamFilter !== 'alla' && e.resource.team !== teamFilter) return false;
      if (sellerFilter !== 'alla' && e.resource.seller !== sellerFilter) return false;
      return true;
    });
  }, [allEvents, typeFilter, teamFilter, sellerFilter]);

  const conflictCount = useMemo(() => {
    const ids = new Set<string>();
    filteredEvents.forEach(e => { if (e.resource.conflict) ids.add(e.resource.case_id); });
    return ids.size;
  }, [filteredEvents]);

  const toggleType = (t: EventType) => {
    setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const eventPropGetter = (event: CalEvent) => {
    const { type, weekBased, conflict } = event.resource;
    let bg = 'hsl(210, 80%, 50%)';
    if (type === 'montage') bg = 'hsl(142, 76%, 36%)';
    else if (type === 'leverans') bg = 'hsl(25, 95%, 53%)';
    const style: React.CSSProperties = {
      backgroundColor: bg,
      borderRadius: 6,
      border: conflict ? '2px solid hsl(0, 84%, 50%)' : '1px solid rgba(0,0,0,0.1)',
      color: 'white',
      fontSize: 12,
      padding: '2px 6px',
    };
    if (type === 'leverans' && weekBased) {
      style.opacity = 0.85;
      style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 6px, transparent 6px 12px)';
    }
    return { style };
  };

  const FilterControls = (
    <>
      <div className="flex flex-wrap items-center gap-1">
        {TYPE_OPTIONS.map(opt => {
          const active = typeFilter.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleType(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-input hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <Select value={teamFilter} onValueChange={setTeamFilter}>
        <SelectTrigger className="h-9 w-full md:w-44"><SelectValue placeholder="Team" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="alla">Alla team</SelectItem>
          {MONTORS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={sellerFilter} onValueChange={setSellerFilter}>
        <SelectTrigger className="h-9 w-full md:w-44"><SelectValue placeholder="Säljare" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="alla">Alla säljare</SelectItem>
          {SELLERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="px-3 md:px-4 space-y-3">
      {/* Filter row */}
      <div className="hidden md:flex flex-wrap items-center gap-2">
        {FilterControls}
      </div>
      <div className="md:hidden">
        <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" /> Filter
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="space-y-3">
            <SheetHeader><SheetTitle>Filter</SheetTitle></SheetHeader>
            {FilterControls}
          </SheetContent>
        </Sheet>
      </div>

      {conflictCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 text-sm text-yellow-900 dark:text-yellow-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{conflictCount} montagekonflikter upptäckta — granska markerade ärenden</span>
        </div>
      )}

      <div className="bg-card rounded-lg border p-2 md:p-3">
        <Calendar
          localizer={localizer}
          culture="sv"
          events={filteredEvents}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={['month', 'week', 'day', 'agenda']}
          startAccessor="start"
          endAccessor="end"
          allDayAccessor="allDay"
          style={{ height: 'calc(100vh - 280px)', minHeight: 500 }}
          eventPropGetter={eventPropGetter as any}
          onSelectEvent={(e: any) => onSelectCase(e.resource.caseData)}
          components={{ toolbar: CustomToolbar as any }}
          length={7}
          messages={{
            today: 'Idag', previous: 'Föregående', next: 'Nästa',
            month: 'Månad', week: 'Vecka', day: 'Dag', agenda: 'Agenda',
            date: 'Datum', time: 'Tid', event: 'Händelse', noEventsInRange: 'Inga händelser i perioden.',
            showMore: (n) => `+${n} fler`,
          }}
        />
      </div>
    </div>
  );
}
