import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCases, type CaseRow } from '@/lib/supabaseClient';
import { MONTORS, type UserRole } from '@/lib/constants';
import { AppHeader } from '@/components/AppHeader';
import { MontorCaseList } from '@/components/montor/MontorCaseList';
import { MontorCaseDetail } from '@/components/montor/MontorCaseDetail';
import { Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarView } from '@/components/calendar/CalendarView';


interface MontorViewProps {
  role: UserRole;
  onChangeRole: () => void;
  isAdmin?: boolean;
  onToggleView?: () => void;
}

type Tab = 'alla' | 'montage' | 'reklamationer' | 'klara' | 'kalender';

const statusOrder = ['vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat', 'montage_klart', 'fakturerad', 'pausad'];

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

export function MontorView({ role, onChangeRole, isAdmin, onToggleView }: MontorViewProps) {
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('alla');
  const [adminFilter, setAdminFilter] = useState<string>('alla');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm), 200);
    return () => clearTimeout(id);
  }, [searchTerm]);

  // Keyboard shortcut "/" + Escape to clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchTerm('');
        setDebouncedSearch('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Admin sees all cases, regular montör sees only their own
  const queryFilter = isAdmin ? {} : { team: role.name };

  const { data: cases, isLoading } = useQuery({
    queryKey: ['cases', 'montor', isAdmin ? 'admin' : role.name],
    queryFn: () => fetchCases(queryFilter),
  });

  // Fetch all deviations for cases
  const caseIds = useMemo(() => (cases || []).map(c => c.id), [cases]);
  const { data: allDeviations } = useQuery({
    queryKey: ['deviations_bulk', caseIds],
    queryFn: async () => {
      if (caseIds.length === 0) return [];
      const { data, error } = await supabase
        .from('deviations')
        .select('*')
        .in('case_id', caseIds);
      if (error) throw error;
      return data;
    },
    enabled: caseIds.length > 0,
  });

  const unresolvedDeviationCaseIds = useMemo(() => {
    const set = new Set<string>();
    (allDeviations || []).forEach(d => { if (!d.resolved) set.add(d.case_id); });
    return set;
  }, [allDeviations]);

  // Apply admin montör filter
  const teamFiltered = useMemo(() => {
    if (!isAdmin || adminFilter === 'alla') return cases || [];
    return (cases || []).filter(c => c.team === adminFilter);
  }, [cases, isAdmin, adminFilter]);

  const sorted = useMemo(() => {
    return [...teamFiltered].sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
  }, [teamFiltered]);

  // Search filter before tab filter
  const searched = useMemo(() => {
    if (!debouncedSearch) return sorted;
    return sorted.filter(c => matchesSearch(c, debouncedSearch));
  }, [sorted, debouncedSearch]);

  const totalCases = sorted.length;
  const totalVisible = searched.length;

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'montage':
        return searched.filter(c => ['montage_bokat', 'leverans_klar'].includes(c.status));
      case 'reklamationer':
        return searched.filter(c => unresolvedDeviationCaseIds.has(c.id));
      case 'klara':
        return searched.filter(c => ['montage_klart', 'fakturerad'].includes(c.status));
      default:
        return searched;
    }
  }, [searched, activeTab, unresolvedDeviationCaseIds]);

  const counts: Record<Tab, number | null> = useMemo(() => ({
    alla: searched.filter(c => ['montage_bokat', 'leverans_klar', 'vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'montage_klart', 'fakturerad', 'pausad'].includes(c.status)).length,
    montage: searched.filter(c => ['montage_bokat', 'leverans_klar'].includes(c.status)).length,
    reklamationer: searched.filter(c => unresolvedDeviationCaseIds.has(c.id)).length,
    klara: searched.filter(c => ['montage_klart', 'fakturerad'].includes(c.status)).length,
    kalender: null,
  }), [searched, unresolvedDeviationCaseIds]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'alla', label: 'Alla' },
    { key: 'montage', label: 'Montage' },
    { key: 'kalender', label: 'Kalender' },
    { key: 'reklamationer', label: 'Reklam.' },
    { key: 'klara', label: 'Klara' },
  ];

  if (selectedCase) {
    return (
      <MontorCaseDetail
        caseData={selectedCase}
        currentUser={isAdmin ? role.name : role.name}
        hasUnresolvedDeviation={unresolvedDeviationCaseIds.has(selectedCase.id)}
        onBack={() => setSelectedCase(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        role={role}
        onChangeRole={onChangeRole}
        toggleView={isAdmin && onToggleView ? { label: 'Visa säljarvy', onClick: onToggleView } : undefined}
      />


      <main className="py-4 max-w-[480px] mx-auto px-3">
        {/* Admin montör filter */}
        {isAdmin && (
          <div className="mb-4">
            <Select value={adminFilter} onValueChange={setAdminFilter}>
              <SelectTrigger className="min-h-[48px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alla">Alla montörer</SelectItem>
                {MONTORS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Search */}
        <div className="mb-4 space-y-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sök ärenden..."
              className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Rensa sökning"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {debouncedSearch && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Visar {totalVisible} ärenden av {totalCases}</span>
              <button onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }} className="text-primary hover:underline">
                Rensa
              </button>
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors min-h-[48px] ${
                activeTab === t.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {counts[t.key] !== null && (
                <span className={`ml-1 text-xs ${activeTab === t.key ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'kalender' ? (
          <CalendarView onSelectCase={setSelectedCase} />
        ) : isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-20">Inga ärenden att visa.</p>
        ) : (
          <MontorCaseList
            cases={filtered}
            unresolvedDeviationCaseIds={unresolvedDeviationCaseIds}
            onSelect={setSelectedCase}
          />
        )}
      </main>
    </div>
  );
}
