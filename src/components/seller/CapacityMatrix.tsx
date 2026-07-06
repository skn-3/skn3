import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MONTORS } from '@/lib/constants';
import { getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks } from 'date-fns';
import { Users } from 'lucide-react';

const WEEKS_AHEAD = 6;

type Cell = { count: number; units: number };

function weekKey(year: number, week: number) {
  return `${year}-${week}`;
}

export function CapacityMatrix() {
  const { data: cases } = useQuery({
    queryKey: ['capacity-montage'],
    queryFn: async () => {
      const start = startOfISOWeek(new Date());
      const end = addWeeks(start, WEEKS_AHEAD);
      const { data, error } = await supabase
        .from('cases')
        .select('id, team, montage_date, units, status')
        .in('status', ['montage_bokat', 'montage_pagar'])
        .gte('montage_date', start.toISOString().slice(0, 10))
        .lt('montage_date', end.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const { weeks, rows, hasUnassigned } = useMemo(() => {
    const start = startOfISOWeek(new Date());
    const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => {
      const d = addWeeks(start, i);
      return { year: getISOWeekYear(d), week: getISOWeek(d) };
    });

    const grid = new Map<string, Map<string, Cell>>();
    const teamNames: string[] = [...MONTORS];
    const bump = (team: string, wk: string, units: number) => {
      if (!grid.has(team)) grid.set(team, new Map());
      const row = grid.get(team)!;
      const cell = row.get(wk) ?? { count: 0, units: 0 };
      cell.count += 1;
      cell.units += units;
      row.set(wk, cell);
    };

    let hasUnassigned = false;
    for (const c of cases ?? []) {
      if (!c.montage_date) continue;
      const d = new Date(c.montage_date + 'T00:00:00');
      const wk = weekKey(getISOWeekYear(d), getISOWeek(d));
      const team = c.team && String(c.team).trim() ? String(c.team).trim() : 'Ej tilldelad';
      if (team === 'Ej tilldelad') hasUnassigned = true;
      else if (!teamNames.includes(team)) teamNames.push(team);
      bump(team, wk, Number(c.units) || 0);
    }

    const rows = [...teamNames, ...(hasUnassigned ? ['Ej tilldelad'] : [])].map((team) => ({
      team,
      cells: weeks.map((w) => grid.get(team)?.get(weekKey(w.year, w.week)) ?? { count: 0, units: 0 }),
    }));

    return { weeks, rows, hasUnassigned };
  }, [cases]);

  const cellTone = (count: number) => {
    if (count === 0) return 'bg-background text-muted-foreground/40';
    if (count <= 2) return 'bg-emerald-50 text-emerald-900';
    if (count <= 4) return 'bg-amber-50 text-amber-900';
    return 'bg-red-50 text-red-900 font-semibold';
  };

  const curWeek = getISOWeek(new Date());

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Users className="h-4 w-4" />
        Beläggning — bokade montage per team och vecka
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left px-2 py-1 font-medium text-muted-foreground">Team</th>
              {weeks.map((w) => (
                <th key={weekKey(w.year, w.week)} className="text-center px-2 py-1 font-medium text-muted-foreground">
                  v.{w.week}{w.week === curWeek ? ' (nu)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team} className="border-b last:border-b-0">
                <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.team}</td>
                {r.cells.map((cell, i) => (
                  <td key={i} className="px-2 py-1.5 text-center">
                    <span className={`inline-flex flex-col items-center justify-center rounded-md px-2 py-1 min-w-[3rem] ${cellTone(cell.count)}`}>
                      {cell.count === 0 ? '—' : (
                        <>
                          <span>{cell.count} st</span>
                          {cell.units > 0 && <span className="text-[10px] opacity-80">{cell.units} enh</span>}
                        </>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Grönt = ledig kapacitet, gult = fyllt, rött = högt tryck. Räknar ärenden i Montage bokat/pågår med montagedatum de kommande {WEEKS_AHEAD} veckorna.
      </p>
    </div>
  );
}
