import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createCaseEvent, type CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { Truck, CalendarCheck, AlertTriangle, PackageCheck, CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import { CapacityMatrix } from './CapacityMatrix';

const ACTIVE_STATUSES = ['godkand', 'i_produktion', 'leverans_klar'];

type Anchor = { year: number; week: number; label: string } | null;

function deliveryAnchor(c: any): Anchor {
  if (c.delivery_date) {
    const d = new Date(c.delivery_date + 'T00:00:00');
    return {
      year: getISOWeekYear(d),
      week: getISOWeek(d),
      label: d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
    };
  }
  if (c.delivery_week && c.delivery_year) {
    return { year: c.delivery_year, week: c.delivery_week, label: `v.${c.delivery_week}` };
  }
  return null;
}

function cmpNow(a: Anchor): -1 | 0 | 1 {
  if (!a) return 1;
  const now = new Date();
  const cur = getISOWeekYear(now) * 100 + getISOWeek(now);
  const val = a.year * 100 + a.week;
  if (val < cur) return -1;
  if (val === cur) return 0;
  return 1;
}

function CaseRowItem({
  c,
  anchor,
  tone,
  action,
  onSelectCase,
}: {
  c: any;
  anchor: Anchor;
  tone: 'red' | 'amber' | 'sky' | 'muted';
  action?: { label: string; pending?: boolean; onClick: () => void };
  onSelectCase: (c: CaseRow) => void;
}) {
  const toneCls: Record<string, string> = {
    red: 'border-red-200',
    amber: 'border-amber-200',
    sky: 'border-sky-200',
    muted: 'border-border',
  };
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md border ${toneCls[tone]} bg-card px-3 py-2 cursor-pointer hover:bg-accent/50`}
      onClick={() => onSelectCase(c as CaseRow)}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{c.address}</div>
        <div className="text-xs text-muted-foreground truncate">
          {c.customer_name || '—'}
          {c.team ? ` · Montör: ${c.team}` : ' · Montör ej tilldelad'}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">{STATUS_LABELS[c.status] ?? c.status}</Badge>
          {anchor && (
            <Badge variant="outline" className="text-[10px]">
              Leverans {anchor.label}{anchor.week ? ` (v.${anchor.week})` : ''}
            </Badge>
          )}
        </div>
      </div>
      {action && (
        <Button
          size="sm"
          disabled={action.pending}
          onClick={(e) => { e.stopPropagation(); action.onClick(); }}
          className="shrink-0"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  tone,
  children,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  tone: 'red' | 'amber' | 'sky' | 'muted';
  children: React.ReactNode;
  empty: string;
}) {
  const toneCls: Record<string, string> = {
    red: 'text-red-700',
    amber: 'text-amber-700',
    sky: 'text-sky-700',
    muted: 'text-muted-foreground',
  };
  return (
    <section className="space-y-2">
      <h3 className={`flex items-center gap-2 text-sm font-semibold ${toneCls[tone]}`}>
        {icon} {title} <span className="text-xs font-normal text-muted-foreground">({count})</span>
      </h3>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

export function DeliveriesView({ onSelectCase, currentUser }: { onSelectCase: (c: CaseRow) => void; currentUser: string }) {
  const qc = useQueryClient();

  const { data: cases, isLoading } = useQuery({
    queryKey: ['deliveries-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const markDelivered = useMutation({
    mutationFn: async (c: any) => {
      const { error } = await supabase.from('cases').update({ status: 'leverans_klar' }).eq('id', c.id);
      if (error) throw error;
      const a = deliveryAnchor(c);
      await createCaseEvent({
        case_id: c.id,
        event_type: 'status_change',
        description: `Leverans markerad klar${a ? ` (${a.label})` : ''}`,
        created_by: currentUser,
      });
    },
    onSuccess: () => {
      toast.success('Leverans markerad klar — dags att boka montage');
      qc.invalidateQueries({ queryKey: ['deliveries-cases'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (e: Error) => toast.error(`Kunde inte uppdatera: ${e.message}`),
  });

  const groups = useMemo(() => {
    const list = cases ?? [];
    const late: any[] = [];
    const thisWeek: any[] = [];
    const toBook: any[] = [];
    const upcoming: any[] = [];
    const missing: any[] = [];
    for (const c of list) {
      const a = deliveryAnchor(c);
      if (c.status === 'leverans_klar') { toBook.push(c); continue; }
      if (!a) { missing.push(c); continue; }
      const cmp = cmpNow(a);
      if (cmp < 0) late.push(c);
      else if (cmp === 0) thisWeek.push(c);
      else upcoming.push(c);
    }
    const byAnchor = (x: any, y: any) => {
      const ax = deliveryAnchor(x); const ay = deliveryAnchor(y);
      return (ax ? ax.year * 100 + ax.week : 999999) - (ay ? ay.year * 100 + ay.week : 999999);
    };
    late.sort(byAnchor); upcoming.sort(byAnchor);
    return { late, thisWeek, toBook, upcoming, missing };
  }, [cases]);

  const now = new Date();
  const curWeek = getISOWeek(now);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Laddar leveranser...</p>;
  }

  return (
    <div className="space-y-6 px-3 md:px-6">
      <header>
        <h2 className="text-xl font-semibold flex items-center gap-2"><Truck className="h-5 w-5" /> Leveranser</h2>
        <p className="text-sm text-muted-foreground">
          Vecka {curWeek}. Markera anlända leveranser som klara och boka montage för de som redan levererats.
        </p>
      </header>

      <CapacityMatrix />

      <Section
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Försenade — vecka passerad, ej markerad levererad"
        count={groups.late.length}
        tone="red"
        empty="Inga försenade leveranser."
      >
        {groups.late.map((c) => (
          <CaseRowItem
            key={c.id}
            c={c}
            anchor={deliveryAnchor(c)}
            tone="red"
            onSelectCase={onSelectCase}
            action={{ label: 'Markera levererad', pending: markDelivered.isPending, onClick: () => markDelivered.mutate(c) }}
          />
        ))}
      </Section>

      <Section
        icon={<CalendarCheck className="h-4 w-4" />}
        title={`Denna vecka (v.${curWeek})`}
        count={groups.thisWeek.length}
        tone="amber"
        empty="Inga leveranser denna vecka."
      >
        {groups.thisWeek.map((c) => (
          <CaseRowItem
            key={c.id}
            c={c}
            anchor={deliveryAnchor(c)}
            tone="amber"
            onSelectCase={onSelectCase}
            action={{ label: 'Markera levererad', pending: markDelivered.isPending, onClick: () => markDelivered.mutate(c) }}
          />
        ))}
      </Section>

      <Section
        icon={<PackageCheck className="h-4 w-4" />}
        title="Levererade — boka montage"
        count={groups.toBook.length}
        tone="sky"
        empty="Inget som väntar på montagebokning."
      >
        {groups.toBook.map((c) => (
          <CaseRowItem
            key={c.id}
            c={c}
            anchor={deliveryAnchor(c)}
            tone="sky"
            onSelectCase={onSelectCase}
            action={{ label: 'Boka montage', onClick: () => onSelectCase(c as CaseRow) }}
          />
        ))}
      </Section>

      <Section
        icon={<Truck className="h-4 w-4" />}
        title="Kommande veckor"
        count={groups.upcoming.length}
        tone="muted"
        empty="Inga kommande leveranser inplanerade."
      >
        {groups.upcoming.map((c) => (
          <CaseRowItem
            key={c.id}
            c={c}
            anchor={deliveryAnchor(c)}
            tone="muted"
            onSelectCase={onSelectCase}
          />
        ))}
      </Section>

      {groups.missing.length > 0 && (
        <Section
          icon={<CalendarX className="h-4 w-4" />}
          title="Saknar leveransvecka"
          count={groups.missing.length}
          tone="red"
          empty=""
        >
          {groups.missing.map((c) => (
            <CaseRowItem
              key={c.id}
              c={c}
              anchor={null}
              tone="red"
              onSelectCase={onSelectCase}
              action={{ label: 'Sätt vecka', onClick: () => onSelectCase(c as CaseRow) }}
            />
          ))}
        </Section>
      )}
    </div>
  );
}
