import { useQuery } from '@tanstack/react-query';
import { TreePine } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface ClimateEventRow {
  created_at: string;
  tree_count: number;
  seller: string | null;
  event_type: string;
}

export function useClimateEvents() {
  return useQuery({
    queryKey: ['climate_events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('climate_events' as any)
        .select('created_at, tree_count, seller, event_type')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as ClimateEventRow[]) ?? [];
    },
  });
}

function sum(rows: ClimateEventRow[]) {
  return rows.reduce((a, r) => a + (Number(r.tree_count) || 0), 0);
}

export function useTreeStats() {
  const { data: rows = [] } = useClimateEvents();
  const now = new Date();
  const yearRows = rows.filter((r) => new Date(r.created_at).getFullYear() === now.getFullYear());
  const monthRows = yearRows.filter((r) => new Date(r.created_at).getMonth() === now.getMonth());

  const bySeller = new Map<string, number>();
  for (const r of rows) {
    const s = (r.seller || '').trim();
    if (!s || s.toLowerCase() === 'okänd') continue;
    bySeller.set(s, (bySeller.get(s) || 0) + (Number(r.tree_count) || 0));
  }
  const top = [...bySeller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return {
    rows,
    total: sum(rows),
    thisYear: sum(yearRows),
    thisMonth: sum(monthRows),
    top,
    forSeller: (name: string) => bySeller.get(name) || 0,
  };
}

/** Klimatblock för startsidan */
export function KlimatStatsBlock() {
  const { total, thisYear, thisMonth, top } = useTreeStats();

  if (total === 0) return null;

  return (
    <div className="rounded-lg border border-green-300 dark:border-green-800 bg-green-50/60 dark:bg-green-950/40 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-300">
        <TreePine className="h-4 w-4" /> Planterade träd
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">{total}</div>
          <div className="text-xs text-muted-foreground">Totalt</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">{thisYear}</div>
          <div className="text-xs text-muted-foreground">I år</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">{thisMonth}</div>
          <div className="text-xs text-muted-foreground">Denna månad</div>
        </div>
      </div>
      {top.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-green-200 dark:border-green-900">
          <div className="text-xs font-medium text-muted-foreground">Topp 3 säljare</div>
          {top.map(([name, trees], i) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{i + 1}. {name}</span>
              <span className="font-medium text-green-700 dark:text-green-300">{trees} träd</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Kompakt "mina träd"-siffra */
export function MinaTradBadge({ sellerName }: { sellerName: string }) {
  const { forSeller } = useTreeStats();
  const trees = forSeller(sellerName);
  if (!trees) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 dark:border-green-800 bg-green-100 dark:bg-green-900/40 px-3 py-1 text-sm font-medium text-green-800 dark:text-green-300">
      <TreePine className="h-4 w-4" /> Mina träd: {trees}
    </span>
  );
}
