import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Info, Inbox, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import type { CaseRow } from '@/lib/supabaseClient';
import { DEVIATION_RESPONSIBLE } from '@/lib/constants';
import {
  BALLS, GROUP_ORDER, STATUS_BY_VALUE, TICKET_CATEGORIES, ageDays, computeKpis, dueDelta, fetchTickets, fmtDue,
  groupKey, groupLabel, isOpen, isOverdue, isSilent, missingNextStep, relTime, silentDays, sortTickets, ticketNo, ticketAddress, ticketCustomer,
  type Grouping, type SortKey, type Ticket,
} from '@/lib/tickets';
import { Avatar, CategoryChip, PrioDot, useToneStyle } from './ticketDialogs';
import { TicketDetail } from './TicketDetail';
import { NewTicketDialog } from './NewTicketDialog';
import './ticketTheme.css';

interface Props { currentUser: string; role: 'seller' | 'coordinator'; isAdmin?: boolean; onSelectCase: (c: CaseRow) => void }

type LatestEvent = { description: string; created_by: string; created_at: string };

const MS_DAY = 86_400_000;
const GROUPINGS: Array<{ value: Grouping; label: string }> = [
  { value: 'ball', label: 'Bollen hos' }, { value: 'status', label: 'Status' }, { value: 'category', label: 'Kategori' }, { value: 'owner', label: 'Ägare' },
];
const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'next_step', label: 'nästa steg' }, { value: 'last_event', label: 'senaste händelse' }, { value: 'age', label: 'ålder' }, { value: 'priority', label: 'prioritet' },
];
const RESP_LABEL = (v: string | null) => DEVIATION_RESPONSIBLE.find((r) => r.value === v)?.label || v;

function readLS<T extends string>(key: string, allowed: T[], fallback: T): T {
  try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : fallback; } catch { return fallback; }
}
function writeLS(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* ignore */ } }

export function TicketCenter({ currentUser, onSelectCase }: Props) {
  const isMobile = useIsMobile();
  const tone = useToneStyle();
  const { data: tickets = [], isLoading, error } = useQuery({ queryKey: ['tickets'], queryFn: fetchTickets });
  const { data: latest } = useQuery({
    queryKey: ['ticket_latest_events'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('case_events')
        .select('deviation_id, description, created_by, created_at')
        .not('deviation_id', 'is', null).order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      const m = new Map<string, LatestEvent>();
      for (const e of data || []) if (!m.has(e.deviation_id)) m.set(e.deviation_id, e);
      return m;
    },
  });

  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [grouping, setGrouping] = useState<Grouping>(() => readLS('tc.grouping', GROUPINGS.map((g) => g.value), 'ball'));
  const [sort, setSort] = useState<SortKey>(() => readLS('tc.sort', SORTS.map((s) => s.value), 'next_step'));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => writeLS('tc.grouping', grouping), [grouping]);
  useEffect(() => writeLS('tc.sort', sort), [sort]);

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => [t.title, t.description, ticketAddress(t), ticketCustomer(t), ticketNo(t)].some((s) => s?.toLowerCase().includes(q)));
  }, [tickets, search]);

  const open = useMemo(() => searched.filter(isOpen), [searched]);

  const views = useMemo(() => {
    const v: Record<string, { label: string; filter: (t: Ticket) => boolean; archive?: boolean }> = {
      all: { label: 'Alla öppna', filter: isOpen },
      mine: { label: 'Mina ärenden', filter: (t) => isOpen(t) && t.owner === currentUser },
      overdue: { label: 'Nästa steg försenat', filter: (t) => isOpen(t) && isOverdue(t, now) },
      silent: { label: 'Tysta > 5 dagar', filter: (t) => isOpen(t) && isSilent(t, now) },
      missing: { label: 'Nästa steg saknas', filter: (t) => isOpen(t) && missingNextStep(t) },
      resolved30: { label: 'Lösta senaste 30 d', filter: (t) => t.status !== 'avskriven' && !isOpen(t) && (t.resolved_at || '') >= since30, archive: true },
      avskrivna: { label: 'Avskrivna', filter: (t) => t.status === 'avskriven', archive: true },
    };
    BALLS.forEach((b) => { v[`ball:${b.value}`] = { label: b.heading, filter: (t) => isOpen(t) && (t.ball || 'oss') === b.value }; });
    TICKET_CATEGORIES.forEach((c) => { v[`cat:${c.value}`] = { label: c.label, filter: (t) => isOpen(t) && t.type === c.value }; });
    return v;
  }, [currentUser, since30]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (key: string) => searched.filter(views[key].filter).length;
  const active = views[view] || views.all;
  const visible = searched.filter(active.filter);

  const kpis = computeKpis(tickets, now);
  const openAll = tickets.filter(isOpen);
  const newThisWeek = tickets.filter((t) => t.created_at >= new Date(now.getTime() - 7 * MS_DAY).toISOString()).length;
  const oldestOverdue = Math.max(0, ...openAll.map((t) => dueDelta(t, now) ?? 0));
  const resolvedDurations = tickets.filter((t) => !isOpen(t) && t.resolved_at && t.resolved_at >= since30 && !t.merged_into_id)
    .map((t) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / MS_DAY).sort((a, b) => a - b);
  const median = resolvedDurations.length
    ? Math.round(resolvedDurations.length % 2 ? resolvedDurations[(resolvedDurations.length - 1) / 2] : (resolvedDurations[resolvedDurations.length / 2 - 1] + resolvedDurations[resolvedDurations.length / 2]) / 2)
    : null;

  const groups = useMemo(() => {
    if (active.archive) return [{ key: '__list__', list: sortTickets(visible, sort, now) }];
    const map = new Map<string, Ticket[]>();
    visible.forEach((t) => { const k = groupKey(t, grouping); map.set(k, [...(map.get(k) || []), t]); });
    let order = GROUP_ORDER[grouping];
    if (grouping === 'owner') order = Array.from(map.keys()).sort((a, b) => (a === '__none__' ? -1 : b === '__none__' ? 1 : a.localeCompare(b, 'sv')));
    const extra = Array.from(map.keys()).filter((k) => !order.includes(k));
    return [...order, ...extra]
      .filter((k) => map.has(k) || (grouping === 'ball' && k === 'oss'))
      .map((k) => ({ key: k, list: sortTickets(map.get(k) || [], sort, now) }));
  }, [visible, grouping, sort, active.archive]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastEventOf = (t: Ticket): LatestEvent => {
    const e = latest?.get(t.id);
    if (e) return e;
    const al = (t.action_log || []).filter((a) => a?.at);
    if (al.length) { const a = al[al.length - 1]; return { description: a.action, created_by: a.by, created_at: a.at }; }
    return { description: `Rapporterad av ${t.created_by}`, created_by: t.created_by, created_at: t.created_at };
  };

  const RailBtn = ({ k, dot, tint }: { k: string; dot?: string; tint?: 'danger' | 'warn' }) => {
    const n = count(k);
    const isActive = view === k;
    return (
      <button className={`tc-railbtn ${isActive ? 'is-active' : ''} ${isMobile ? '!w-auto shrink-0 border' : ''}`}
        style={{ ...(isMobile ? { borderColor: 'var(--tc-border)', background: isActive ? undefined : 'var(--tc-surface)' } : {}), ...(!isActive && tint ? { color: `var(--tc-${tint})` } : {}) }}
        onClick={() => setView(k)} aria-pressed={isActive}>
        {dot && <span className="tc-dot" style={{ background: dot }} />}
        <span className="whitespace-nowrap">{views[k].label}</span>
        <span className={`tc-pill ${!isActive && tint && n > 0 ? `tc-pill-${tint}` : ''}`}>{n}</span>
      </button>
    );
  };

  const rail = (
    <>
      {!isMobile && <div className="tc-rail-h px-2.5 mb-1">Vyer</div>}
      <RailBtn k="all" /><RailBtn k="mine" /><RailBtn k="overdue" tint="danger" /><RailBtn k="silent" tint="warn" /><RailBtn k="missing" tint="danger" />
      {!isMobile && <div className="tc-rail-h px-2.5 mt-4 mb-1">Bollen ligger hos</div>}
      {BALLS.map((b) => <RailBtn key={b.value} k={`ball:${b.value}`} dot={b.color} />)}
      {!isMobile && <div className="tc-rail-h px-2.5 mt-4 mb-1">Kategori</div>}
      {TICKET_CATEGORIES.map((c) => <RailBtn key={c.value} k={`cat:${c.value}`} />)}
      {!isMobile && <div className="tc-rail-h px-2.5 mt-4 mb-1">Arkiv</div>}
      <RailBtn k="resolved30" /><RailBtn k="avskrivna" />
    </>
  );

  const NextStepCell = ({ t }: { t: Ticket }) => {
    if (missingNextStep(t)) {
      return (
        <div className="text-sm">
          <div className="flex items-center gap-1 font-semibold" style={{ color: 'var(--tc-danger)' }}><Info className="h-3.5 w-3.5" /> Nästa steg saknas</div>
          {isOpen(t) && <div className="text-xs underline" style={{ color: 'var(--tc-danger)' }}>Sätt nästa steg</div>}
        </div>
      );
    }
    const d = dueDelta(t, now);
    return (
      <div className="text-sm min-w-0">
        <div className="font-semibold tc-clamp2">{t.next_step}</div>
        {d !== null && (d > 0
          ? <div className="text-xs font-semibold" style={{ color: 'var(--tc-danger)' }}>förföll {fmtDue(t.next_step_due)} · {d} {d === 1 ? 'dag' : 'dagar'} sen</div>
          : <div className="text-xs" style={{ color: 'var(--tc-accent)' }}>{d === 0 ? 'förfaller i dag' : `förfaller ${fmtDue(t.next_step_due)}`}</div>)}
      </div>
    );
  };

  const StatusChip = ({ t }: { t: Ticket }) => {
    const s = STATUS_BY_VALUE[(t.status || 'ny') as keyof typeof STATUS_BY_VALUE];
    if (!s) return null;
    const st = tone({ color: s.text, bg: s.bg, border: s.bg, text: s.text });
    return <span className="tc-chip" style={{ background: st.bg, color: st.text }}>{s.label}</span>;
  };

  const Row = ({ t }: { t: Ticket }) => {
    const ev = lastEventOf(t);
    return (
      <button className="tc-row" onClick={() => setOpenId(t.id)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <PrioDot priority={t.priority} />
            <span className="tc-mono text-[11.5px] tc-muted shrink-0">{ticketNo(t)}</span>
            <span className="tc-title font-semibold text-[14.5px] truncate">{t.title || t.description}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
            <span className="tc-muted truncate max-w-[220px]">{ticketAddress(t)}{!t.case_id && <span className="tc-mono"> · ej kopplat</span>}</span>
            <CategoryChip type={t.type} />
            {t.responsible && <span className="tc-chip tc-chip-neutral">Ansvar: {RESP_LABEL(t.responsible)}</span>}
            <StatusChip t={t} />
            {isOpen(t) && isSilent(t, now) && <span className="tc-chip tc-chip-warn">Tyst {silentDays(t, now)} d</span>}
          </div>
        </div>
        <div className="min-w-0 text-sm">
          <div className="tc-clamp2">{ev.description}</div>
          <div className="text-xs tc-muted mt-0.5"><span className="tc-mono">{relTime(ev.created_at, now)}</span> · {ev.created_by}</div>
        </div>
        <NextStepCell t={t} />
        <div className="flex items-center gap-2">
          <Avatar name={t.owner} />
          <span className="text-xs tc-muted whitespace-nowrap">{ageDays(t, now)} d gammalt</span>
        </div>
      </button>
    );
  };

  const MobileCard = ({ t }: { t: Ticket }) => {
    const ev = lastEventOf(t);
    const bad = isOpen(t) && (missingNextStep(t) || isOverdue(t, now));
    return (
      <button className="tc-section w-full text-left block" style={{ padding: '12px 14px' }} onClick={() => setOpenId(t.id)}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PrioDot priority={t.priority} />
          <span className="tc-mono text-[11.5px] tc-muted">{ticketNo(t)}</span>
          <CategoryChip type={t.type} />
          {isOpen(t) && isSilent(t, now) && <span className="tc-chip tc-chip-warn">Tyst {silentDays(t, now)} d</span>}
          <span className="ml-auto text-xs tc-muted">{ageDays(t, now)} d</span>
        </div>
        <div className="tc-title text-[15px] font-semibold mt-1.5">{t.title || t.description}</div>
        <div className="text-xs tc-muted">{ticketAddress(t)}{!t.case_id && <span className="tc-mono"> · ej kopplat</span>}</div>
        {isOpen(t) && (
          <div className="mt-2 rounded-lg px-2.5 py-2" style={{ background: bad ? 'var(--tc-danger-bg)' : 'var(--tc-accent-bg)' }}><NextStepCell t={t} /></div>
        )}
        <div className="text-xs mt-2 truncate"><span className="tc-mono tc-muted">{relTime(ev.created_at, now)}</span> {ev.description}</div>
      </button>
    );
  };

  const kpiCard = (label: string, value: number | string, sub: string, kind?: 'accent' | 'danger' | 'warn') => (
    <div className="tc-card p-3.5" style={kind === 'accent' ? { borderColor: 'var(--tc-accent)', borderWidth: 2 } : undefined}>
      <div className="text-xs font-semibold tc-muted">{label}</div>
      <div className="tc-title text-[28px] font-bold leading-tight" style={{ color: kind ? `var(--tc-${kind})` : undefined }}>{value}</div>
      <div className="text-xs tc-muted">{sub}</div>
    </div>
  );

  return (
    <div className="tc -my-4 md:-my-6 py-4 md:py-6 min-h-[calc(100vh-120px)]">
      <div className="px-3 md:px-4 space-y-4">
        {/* 1. Toppfält */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 mr-auto">
            <span className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--tc-accent-bg)', color: 'var(--tc-accent)' }}><Inbox className="h-5 w-5" /></span>
            <div>
              <div className="tc-title text-xl font-bold leading-tight">Ärendecenter</div>
              <div className="text-xs tc-muted">Reklamationer & kundtjänst</div>
            </div>
          </div>
          <div className="relative flex-[1_1_280px] max-w-xl">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 tc-muted" />
            <Input className="tc-input pl-9 min-h-[44px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök på adress, kund, ärendenummer eller text…" aria-label="Sök ärenden" />
          </div>
          <button className="tc-btn tc-btn-accent" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Nytt ärende</button>
        </div>

        {/* 2. Rail + main */}
        <div className="flex flex-wrap gap-5 items-start">
          {isMobile
            ? <div className="w-full flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">{rail}</div>
            : <nav className="space-y-0.5" style={{ flex: '0 0 232px' }} aria-label="Vyer">{rail}</nav>}

          <div className="space-y-4" style={{ flex: '999 1 560px', minWidth: 0 }}>
            {/* 3. KPI */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {kpiCard('Öppna ärenden', kpis.open, `+${newThisWeek} denna vecka`)}
              {kpiCard('Hos oss – kräver åtgärd', kpis.oss, 'det här är dagens att-göra', 'accent')}
              {kpiCard('Nästa steg försenat', kpis.overdue, `äldsta: ${oldestOverdue} dagar`, 'danger')}
              {kpiCard('Tysta > 5 dagar', kpis.silent, 'ingen händelse loggad', 'warn')}
              {kpiCard('Lösta senaste 30 d', kpis.resolved30, median === null ? 'median —' : `median ${median} dagar till löst`)}
            </div>

            {/* 4. Listhuvud */}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold mr-auto">{active.label} · {visible.length}</h1>
              {!active.archive && (
                <div className="flex items-center gap-2">
                  <span className="text-xs tc-muted">Gruppera:</span>
                  <div className="tc-seg" role="group" aria-label="Gruppera">
                    {GROUPINGS.map((g) => <button key={g.value} className={grouping === g.value ? 'is-active' : ''} onClick={() => setGrouping(g.value)} aria-pressed={grouping === g.value}>{g.label}</button>)}
                  </div>
                </div>
              )}
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="tc-input w-[220px] min-h-[40px]"><span className="tc-muted mr-1">Sortera:</span><SelectValue /></SelectTrigger>
                <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* 5. Grupper */}
            {isLoading && <div className="text-sm tc-muted">Laddar ärenden…</div>}
            {error && <div className="text-sm" style={{ color: 'var(--tc-danger)' }}>Kunde inte hämta ärenden.</div>}
            {!isLoading && !error && visible.length === 0 && !(grouping === 'ball' && !active.archive) && (
              <div className="tc-card p-6 text-sm tc-muted text-center">Inga ärenden i den här vyn.</div>
            )}
            {!isLoading && !error && (visible.length > 0 || (grouping === 'ball' && !active.archive)) && (
              <div className={isMobile ? 'space-y-4' : 'overflow-x-auto'}>
                <div className={isMobile ? 'space-y-4' : 'space-y-4 min-w-[860px]'}>
                  {!isMobile && <div className="tc-colhead"><span>Ärende</span><span>Senaste händelse</span><span>Nästa steg</span><span>Ägare · ålder</span></div>}
                  {visible.length === 0 && grouping === 'ball' && view !== 'all' && view !== 'ball:oss' && (
                    <div className="tc-card p-6 text-sm tc-muted text-center">Inga ärenden i den här vyn.</div>
                  )}
                  {groups.filter((g) => !(visible.length === 0 && view !== 'all' && view !== 'ball:oss')).map((g) => {
                    if (g.key === '__list__') {
                      return isMobile
                        ? <div key="list" className="space-y-2">{g.list.map((t) => <MobileCard key={t.id} t={t} />)}</div>
                        : <div key="list" className="tc-section">{g.list.map((t) => <Row key={t.id} t={t} />)}</div>;
                    }
                    const gl = groupLabel(g.key, grouping);
                    const gt = tone(gl);
                    const isCollapsed = !!collapsed[g.key];
                    return (
                      <section key={g.key} className={isMobile ? 'space-y-2' : 'tc-section'}>
                        <button className="w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5 text-left min-h-[44px]"
                          style={{ background: gt.bg, color: gt.text, borderBottom: isMobile ? undefined : `1px solid ${gt.border}`, borderRadius: isMobile ? 12 : undefined }}
                          onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !s[g.key] }))} aria-expanded={!isCollapsed}>
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <span className="tc-dot" style={{ background: gt.color }} />
                          <span className="tc-title font-bold">{gl.heading}</span>
                          <span className="tc-mono text-xs">· {g.list.length}</span>
                          {gl.blurb && <span className="text-xs opacity-80 ml-1">{gl.blurb}</span>}
                        </button>
                        {!isCollapsed && (g.list.length === 0
                          ? <div className="px-4 py-4 text-sm tc-muted">Inget hos oss just nu.</div>
                          : isMobile
                            ? g.list.map((t) => <MobileCard key={t.id} t={t} />)
                            : g.list.map((t) => <Row key={t.id} t={t} />))}
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <TicketDetail ticketId={openId} open={!!openId} onClose={() => setOpenId(null)} currentUser={currentUser} onSelectCase={onSelectCase} />
      <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} currentUser={currentUser} onCreated={(t) => setOpenId(t.id)} />
    </div>
  );
}
