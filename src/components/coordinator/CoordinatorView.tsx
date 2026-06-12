import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { UserRole } from '@/lib/constants';
import type { CaseRow } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { CoordinatorNav, type CoordinatorTab } from './CoordinatorNav';
import { CoordinatorInbox } from './CoordinatorInbox';
import { CoordinatorDeviations } from './CoordinatorDeviations';
import { Pipeline } from '@/components/seller/Pipeline';
import { CalendarView } from '@/components/calendar/CalendarView';
import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';
import { EconomyView } from '@/components/economy/EconomyView';
import { OffersHub } from '@/components/offers/OffersHub';
import { AOrdersView } from '@/components/aorders/AOrdersView';

interface Props {
  role: UserRole;
  onChangeRole: () => void;
  onToggleSellerView?: () => void;
  initialCaseId?: string | null;
  onInitialCaseHandled?: () => void;
}

export function CoordinatorView({ role, onChangeRole, onToggleSellerView, initialCaseId, onInitialCaseHandled }: Props) {
  const [tab, setTab] = useState<CoordinatorTab>('inbox');
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!initialCaseId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('cases').select('*').eq('id', initialCaseId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.info('Kunde inte hitta ärendet');
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        role={role}
        onChangeRole={onChangeRole}
        toggleView={onToggleSellerView ? { label: 'Tillbaka till säljarvy', onClick: onToggleSellerView } : undefined}
      >
        <CoordinatorNav active={tab} onChange={setTab} />
      </AppHeader>

      <main className="py-4 md:py-6 max-w-screen-2xl mx-auto">
        {tab === 'inbox' && <CoordinatorInbox coordinatorName={role.name} />}
        {tab === 'pipeline' && (
          <Pipeline sellerName={role.name} isCoordinator onSelectCase={setSelectedCase} />
        )}
        {tab === 'calendar' && <CalendarView onSelectCase={setSelectedCase} />}
        {tab === 'deviations' && (
          <CoordinatorDeviations coordinatorName={role.name} onSelectCase={setSelectedCase} />
        )}
        {tab === 'offers' && <OffersHub currentUser={role.name} />}
        {tab === 'aorders' && <AOrdersView currentUser={role.name} />}
        {tab === 'economy' && <EconomyView />}
      </main>

      {selectedCase && (
        <CaseDetailPanel
          caseData={selectedCase}
          currentUser={role.name}
          isSeller
          isCoordinator
          onClose={() => setSelectedCase(null)}
        />
      )}
    </div>
  );
}
