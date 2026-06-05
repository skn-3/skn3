import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, Download, Search, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const BACKUP_SECRET_KEY = 'smartklimat_backup_secret';

async function triggerBackup(): Promise<void> {
  let secret = localStorage.getItem(BACKUP_SECRET_KEY) || '';
  if (!secret) {
    const entered = window.prompt('Ange backup-hemlighet (BACKUP_TRIGGER_SECRET). Sparas lokalt för framtida körningar.');
    if (!entered) return;
    secret = entered.trim();
    localStorage.setItem(BACKUP_SECRET_KEY, secret);
  }
  const t = toast.loading('Skapar och mejlar backup...');
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-backup`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backup-secret': secret,
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ source: 'manual' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem(BACKUP_SECRET_KEY);
        toast.error('Fel hemlighet — försök igen', { id: t });
      } else {
        toast.error(`Backup misslyckades: ${data?.error || res.status}`, { id: t });
      }
      return;
    }
    toast.success(`Backup skickad till mf@malke.se (${data?.tables ?? '?'} tabeller, ${data?.rows ?? '?'} rader)`, { id: t });
  } catch (e: any) {
    toast.error(`Backup misslyckades: ${e?.message || 'okänt fel'}`, { id: t });
  }
}

type Category = 'auth' | 'case' | 'deviation' | 'order' | 'system' | 'data';

interface ActivityRow {
  id: string;
  created_at: string;
  actor_name: string;
  actor_role: string | null;
  action: string;
  category: string;
  description: string | null;
  case_id: string | null;
  deviation_id: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'auth', label: 'Auth' },
  { value: 'case', label: 'Ärende' },
  { value: 'deviation', label: 'Avvikelse' },
  { value: 'order', label: 'Order' },
  { value: 'system', label: 'System' },
  { value: 'data', label: 'Data' },
];

const PAGE_SIZE = 50;
const MAX_RANGE_DAYS = 90;

function roleColor(role: string | null): string {
  switch (role) {
    case 'seller': return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'montor': return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300';
    case 'coordinator': return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300';
    case 'system': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function categoryColor(cat: string): string {
  switch (cat) {
    case 'auth': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'case': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'deviation': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'order': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'system': return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    case 'data': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
    default: return 'bg-muted text-muted-foreground';
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return isoDate(d);
}

export function ActivityLogView() {
  const [from, setFrom] = useState<string>(defaultFrom());
  const [to, setTo] = useState<string>(isoDate(new Date()));
  const [actor, setActor] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [limit, setLimit] = useState<number>(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Validate date range
  const rangeDays = useMemo(() => {
    const f = new Date(from); const t = new Date(to);
    return Math.ceil((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
  }, [from, to]);
  const rangeTooLong = rangeDays > MAX_RANGE_DAYS;

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['activity_log', from, to, actor, category, search, limit],
    queryFn: async (): Promise<ActivityRow[]> => {
      if (rangeTooLong) return [];
      const fromIso = new Date(from + 'T00:00:00').toISOString();
      const toIso = new Date(to + 'T23:59:59').toISOString();
      let q = supabase
        .from('activity_log')
        .select('*')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (actor !== 'all') q = q.eq('actor_name', actor);
      if (category !== 'all') q = q.eq('category', category);
      if (search.trim()) q = q.ilike('description', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  // Distinct actors (from last 30 days)
  const { data: actors = [] } = useQuery({
    queryKey: ['activity_log_actors'],
    queryFn: async (): Promise<string[]> => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('activity_log')
        .select('actor_name')
        .gte('created_at', since.toISOString())
        .limit(1000);
      if (error) return [];
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r?.actor_name && set.add(r.actor_name));
      return Array.from(set).sort();
    },
  });

  const toggleExpand = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    if (rows.length === 0) { toast.info('Inga rader att exportera'); return; }
    const headers = ['Tid', 'Användare', 'Roll', 'Kategori', 'Action', 'Beskrivning', 'Case ID', 'Deviation ID', 'Metadata'];
    const csvRows = [headers.join(',')];
    for (const r of rows) {
      const cells = [
        fmtTime(r.created_at),
        r.actor_name,
        r.actor_role ?? '',
        r.category,
        r.action,
        r.description ?? '',
        r.case_id ?? '',
        r.deviation_id ?? '',
        JSON.stringify(r.metadata ?? {}),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      csvRows.push(cells.join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-3 md:px-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Aktivitetslogg</h1>
          <p className="text-sm text-muted-foreground">Systemövergripande historik. Default: senaste 7 dagar.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Exportera CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Från</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Till</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Användare</Label>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sök</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Sök i beskrivning…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {rangeTooLong && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive">
            Datumintervallet är längre än {MAX_RANGE_DAYS} dagar. Begränsa intervallet eller använd CSV-export.
          </CardContent>
        </Card>
      )}

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="grid grid-cols-[160px_180px_120px_1fr_30px] gap-3 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                <div>Tid</div>
                <div>Användare</div>
                <div>Kategori</div>
                <div>Beskrivning</div>
                <div />
              </div>
              {isLoading && <div className="p-6 text-sm text-muted-foreground">Laddar…</div>}
              {!isLoading && rows.length === 0 && !rangeTooLong && (
                <div className="p-6 text-sm text-muted-foreground">Inga händelser för valda filter.</div>
              )}
              {rows.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => toggleExpand(r.id)}
                      className="w-full grid grid-cols-[160px_180px_120px_1fr_30px] gap-3 px-4 py-2.5 hover:bg-muted/40 text-left items-center"
                    >
                      <div className="text-sm font-mono">{fmtTime(r.created_at)}</div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('text-xs px-2 py-0.5 rounded border', roleColor(r.actor_role))}>
                          {r.actor_role || '—'}
                        </span>
                        <span className="text-sm truncate">{r.actor_name}</span>
                      </div>
                      <div>
                        <span className={cn('text-xs px-2 py-0.5 rounded font-medium', categoryColor(r.category))}>
                          {r.category}
                        </span>
                      </div>
                      <div className="text-sm truncate">{r.description}</div>
                      <div className="text-muted-foreground">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 bg-muted/20 text-xs space-y-1">
                        <div><span className="font-medium">Action:</span> {r.action}</div>
                        {r.case_id && <div><span className="font-medium">Case ID:</span> {r.case_id}</div>}
                        {r.deviation_id && <div><span className="font-medium">Deviation ID:</span> {r.deviation_id}</div>}
                        {r.metadata && Object.keys(r.metadata).length > 0 && (
                          <div>
                            <span className="font-medium">Metadata:</span>
                            <pre className="mt-1 p-2 bg-background rounded text-xs overflow-x-auto">
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                        {r.user_agent && <div className="text-muted-foreground truncate">UA: {r.user_agent}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Laddar…</div>}
        {!isLoading && rows.length === 0 && !rangeTooLong && (
          <div className="text-sm text-muted-foreground">Inga händelser.</div>
        )}
        {rows.map((r) => {
          const isOpen = expanded.has(r.id);
          return (
            <Card key={r.id} onClick={() => toggleExpand(r.id)} className="cursor-pointer">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{fmtTime(r.created_at)}</span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded font-medium', categoryColor(r.category))}>
                    {r.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded border', roleColor(r.actor_role))}>
                    {r.actor_role || '—'}
                  </span>
                  <span className="text-sm font-medium">{r.actor_name}</span>
                </div>
                <div className="text-sm">{r.description}</div>
                {isOpen && (
                  <div className="pt-2 border-t text-xs space-y-1">
                    <div><span className="font-medium">Action:</span> {r.action}</div>
                    {r.case_id && <div><span className="font-medium">Case:</span> {r.case_id}</div>}
                    {r.metadata && Object.keys(r.metadata).length > 0 && (
                      <pre className="p-2 bg-muted rounded text-[10px] overflow-x-auto">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rows.length >= limit && (
        <div className="flex justify-center pb-6">
          <Button variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Ladda fler ({PAGE_SIZE})
          </Button>
        </div>
      )}
    </div>
  );
}
