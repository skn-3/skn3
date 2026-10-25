import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { fetchCasesForMontor, fetchCaseByIdForMontor, type CaseRow } from '@/lib/supabaseClient';
import { type UserRole } from '@/lib/constants';
import { useMontorTeams } from '@/hooks/useMontorTeams';
import { AppHeader } from '@/components/AppHeader';
import { MontorCaseList } from '@/components/montor/MontorCaseList';
import { MontorCaseDetail } from '@/components/montor/MontorCaseDetail';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarView } from '@/components/calendar/CalendarView';
import { MontorOrdersList } from '@/components/montor/MontorOrdersList';
import { Button } from '@/components/ui/button';
import { ListSearchToggle, ListSearchField } from './ListSearch';
import { KM_STATUSES, MONTAGE_STATUSES, compareMontorCases } from '@/lib/montorLists';


interface MontorViewProps {
  role: UserRole;
  onChangeRole: () => void;
  isAdmin?: boolean;
  onToggleView?: () => void;
  initialCaseId?: string | null;
  onInitialCaseHandled?: () => void;
}


type Tab = 'km' | 'alla' | 'montage' | 'uppdrag' | 'reklamationer' | 'klara' | 'kalender';



function matchesSearch(c: CaseRow, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  const fields = [
    c.address,
    c.customer_name,
    c.customer_phone,
    c.offer_number,
    (c as any).city,
    c.notes,
  ];
  return fields.some(f => f && String(f).toLowerCase().includes(t));
}

export function MontorView({ role, onChangeRole, isAdmin, onToggleView, initialCaseId, onInitialCaseHandled }: MontorViewProps) {
  const { names: MONTORS, emailOf: montorEmailOf, phoneOf: montorPhoneOf } = useMontorTeams();
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const listScrollY = useRef(0);
  const openCase = (c: CaseRow) => {
    listScrollY.current = window.scrollY;
    setSelectedCase(c);
  };
  // Återställ listans scrollposition när man går tillbaka från ett ärende.
  useEffect(() => {
    if (!selectedCase) {
      requestAnimationFrame(() => window.scrollTo(0, listScrollY.current));
    }
  }, [selectedCase]);
  const [activeTab, setActiveTab] = useState<Tab>('alla');
  const [adminFilter, setAdminFilter] = useState<string>('alla');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAOrderId = searchParams.get('aorder');
  useEffect(() => { if (initialAOrderId) { setSelectedCase(null); setAdminFilter('alla'); setActiveTab('uppdrag'); } }, [initialAOrderId]);

  // Deep-link: open case panel when ?case=<id> is provided
  useEffect(() => {
    if (!initialCaseId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('cases_montor').select('*').eq('id', initialCaseId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.info('Kunde inte hitta ärendet — kontrollera att du är inloggad som rätt roll');
      } else {
        setSelectedCase(data as CaseRow);
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('case');
        return next;
      }, { replace: true });
      onInitialCaseHandled?.();
    })();
    return () => { cancelled = true; };
  }, [initialCaseId]);

  // Debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm), 200);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // Keyboard shortcut "/" + Escape to clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) return;
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        setDebouncedSearch('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Admin sees all cases; regular montör sees cases where they are montage-team OR km_team.
  // Fetch all + filter client-side (server-side .eq can't OR).
  const { data: allCases, isLoading } = useQuery({
    queryKey: ['cases', 'montor', isAdmin ? 'admin' : role.name],
    queryFn: fetchCasesForMontor,
  });
  const cases = useMemo(() => {
    if (isAdmin) return allCases || [];
    return (allCases || []).filter(c => c.team === role.name || (c as any).km_team === role.name);
  }, [allCases, isAdmin, role.name]);

  // Olösta avvikelser — RLS begränsar montören till egna ärenden, admin får alla.
  const { data: allDeviations } = useQuery({
    queryKey: ['deviations_bulk', 'unresolved', isAdmin ? 'admin' : role.name],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deviations')
        .select('case_id')
        .eq('resolved', false);
      if (error) throw error;
      return data;
    },
  });

  const unresolvedDeviationCaseIds = useMemo(() => {
    const set = new Set<string>();
    (allDeviations || []).forEach(d => { if (d.case_id) set.add(d.case_id); });
    return set;
  }, [allDeviations]);

  // Apply admin montör filter
  const teamFiltered = useMemo(() => {
    if (!isAdmin || adminFilter === 'alla') return cases || [];
    return (cases || []).filter(c => c.team === adminFilter || (c as any).km_team === adminFilter);
  }, [cases, isAdmin, adminFilter]);

  const { data: ordersCount = 0 } = useQuery({
    queryKey: ['montor-orders-count', role.name, isAdmin, adminFilter],
    queryFn: async () => {
      const team = isAdmin ? (adminFilter === 'alla' ? null : adminFilter) : role.name;
      let query = supabase.from('a_orders').select('id, montor_teams!inner(name)', { count: 'exact', head: true });
      if (team) query = query.eq('montor_teams.name', team);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const sorted = useMemo(() => {
    return [...teamFiltered].sort((a, b) => compareMontorCases(a, b, activeTab));
  }, [teamFiltered, activeTab]);

  // Search filter before tab filter
  const searched = useMemo(() => {
    if (!debouncedSearch) return sorted;
    return sorted.filter(c => matchesSearch(c, debouncedSearch));
  }, [sorted, debouncedSearch]);

  const totalCases = sorted.length;
  const totalVisible = searched.length;

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'km':
        return searched.filter(c => KM_STATUSES.includes(c.status));
      case 'montage':
        return searched.filter(c => MONTAGE_STATUSES.includes(c.status));
      case 'reklamationer':
        return searched.filter(c => unresolvedDeviationCaseIds.has(c.id));
      case 'klara':
        return searched.filter(c => ['montage_klart', 'fakturerad'].includes(c.status));
      default:
        return searched;
    }
  }, [searched, activeTab, unresolvedDeviationCaseIds]);

  const counts: Record<Tab, number | null> = useMemo(() => ({
    alla: searched.length,
    km: searched.filter(c => KM_STATUSES.includes(c.status)).length,
    montage: searched.filter(c => ['montage_bokat', 'montage_pagar', 'leverans_klar'].includes(c.status)).length,
    reklamationer: searched.filter(c => unresolvedDeviationCaseIds.has(c.id)).length,
    klara: searched.filter(c => ['montage_klart', 'fakturerad'].includes(c.status)).length,
    kalender: searched.filter(c => c.km_date || c.montage_date).length,
    uppdrag: ordersCount,
  }), [searched, unresolvedDeviationCaseIds, ordersCount]);


  const tabs: { key: Tab; label: string }[] = [
    { key: 'alla', label: 'Alla' },
    { key: 'km', label: 'KM' },
    { key: 'montage', label: 'Montage' },
    { key: 'uppdrag', label: 'Mina uppdrag' },
    { key: 'kalender', label: 'Kalender' },
    { key: 'reklamationer', label: 'Reklamationer' },
    { key: 'klara', label: 'Klara' },
  ];

  async function openCaseById(id: string) {
    try {
      const data = await fetchCaseByIdForMontor(id);
      openCase(data);
    } catch {
      toast.error('Kunde inte öppna ärendet');
    }
  }

  if (selectedCase) {
    return (
      <MontorCaseDetail
        caseData={selectedCase}
        currentUser={isAdmin ? role.name : role.name}
        onBack={() => setSelectedCase(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        role={role}
        onChangeRole={onChangeRole}
        viewOptions={isAdmin && onToggleView ? [
          { label: 'Montörvy', active: true },
          { label: 'Säljarvy', onClick: onToggleView },
        ] : undefined}
      />


      <main className="mx-auto max-w-[640px] px-4 py-5 pb-24 lg:max-w-[1100px] lg:px-6">
        {isAdmin && <div className="mb-4 flex justify-end">
          <Select value={adminFilter} onValueChange={setAdminFilter}>
            <SelectTrigger className="h-11 w-auto min-w-[180px] rounded-full bg-background text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="alla">Alla montörer</SelectItem>{MONTORS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>}
        <div className="mb-4 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1" aria-label="Montörens listor">
            {tabs.map(t => <Button key={t.key} variant={activeTab === t.key ? 'default' : 'outline'} aria-pressed={activeTab === t.key} onClick={() => setActiveTab(t.key)} className={`h-11 shrink-0 snap-start rounded-full border-border px-4 text-[15px] ${activeTab === t.key ? 'bg-ink text-primary-foreground' : 'bg-background text-muted-foreground'}`}>
              {t.label}{counts[t.key] !== null && <span className={`font-mono text-[11px] ${activeTab === t.key ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{counts[t.key]}</span>}
            </Button>)}
          </div>
          {activeTab !== 'uppdrag' && <ListSearchToggle open={searchOpen} active={!!searchTerm} onToggle={() => setSearchOpen(v => !v)} />}
        </div>
        {searchOpen && activeTab !== 'uppdrag' && <div className="mb-4 space-y-2">
          <ListSearchField inputRef={inputRef} value={searchTerm} onChange={setSearchTerm} placeholder="Sök ärenden..." />
          {debouncedSearch && <p className="text-xs text-muted-foreground">Visar {totalVisible} ärenden av {totalCases}</p>}
        </div>}

        {activeTab === 'uppdrag' ? (
          <MontorOrdersList myTeamName={isAdmin ? null : role.name} adminFilter={isAdmin ? adminFilter : 'alla'} onOpenCase={openCaseById} initialOpenId={initialAOrderId} onInitialOpenHandled={() => setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('aorder'); return next; }, { replace: true })} />
        ) : activeTab === 'kalender' ? (
          <CalendarView source="cases_montor" onSelectCase={openCase} />
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-20">Inga ärenden att visa.</p>
        ) : (
          <MontorCaseList
            cases={filtered}
            teamName={isAdmin ? (adminFilter === 'alla' ? null : adminFilter) : role.name}
            unresolvedDeviationCaseIds={unresolvedDeviationCaseIds}
            onSelect={openCase}
          />
        )}
      </main>
    </div>
  );
}
