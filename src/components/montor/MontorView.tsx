import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCases, type CaseRow } from '@/lib/supabaseClient';
import { MONTORS, type UserRole } from '@/lib/constants';
import { AppHeader } from '@/components/AppHeader';
import { MontorCaseList } from '@/components/montor/MontorCaseList';
import { MontorCaseDetail } from '@/components/montor/MontorCaseDetail';
import { Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MontorViewProps {
  role: UserRole;
  onChangeRole: () => void;
  isAdmin?: boolean;
  onToggleView?: () => void;
}

type Tab = 'alla' | 'montage' | 'reklamationer' | 'klara';

const statusOrder = ['vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande', 'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat', 'montage_klart', 'fakturerad', 'pausad'];

export function MontorView({ role, onChangeRole, isAdmin, onToggleView }: MontorViewProps) {
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('alla');
  const [adminFilter, setAdminFilter] = useState<string>('alla');

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

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'montage':
        return sorted.filter(c => ['montage_bokat', 'leverans_klar'].includes(c.status));
      case 'reklamationer':
        return sorted.filter(c => unresolvedDeviationCaseIds.has(c.id));
      case 'klara':
        return sorted.filter(c => ['montage_klart', 'fakturerad'].includes(c.status));
      default:
        return sorted;
    }
  }, [sorted, activeTab, unresolvedDeviationCaseIds]);

  const counts = useMemo(() => ({
    alla: sorted.length,
    montage: sorted.filter(c => ['montage_bokat', 'leverans_klar'].includes(c.status)).length,
    reklamationer: sorted.filter(c => unresolvedDeviationCaseIds.has(c.id)).length,
    klara: sorted.filter(c => ['montage_klart', 'fakturerad'].includes(c.status)).length,
  }), [sorted, unresolvedDeviationCaseIds]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'alla', label: 'Alla' },
    { key: 'montage', label: 'Montage' },
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
      <AppHeader role={role} onChangeRole={onChangeRole}>
        {isAdmin && onToggleView && (
          <Button variant="ghost" size="sm" onClick={onToggleView}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Säljarvy
          </Button>
        )}
      </AppHeader>

      <main className="py-4 max-w-[480px] mx-auto px-4">
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
              <span className={`ml-1 text-xs ${activeTab === t.key ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
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
