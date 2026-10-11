import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { UserRole } from '@/lib/constants';
import type { CaseRow } from '@/lib/supabaseClient';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { CoordinatorNav, coordinatorBottomNavItems, type CoordinatorTab } from './CoordinatorNav';
import { BottomNav } from '@/components/BottomNav';
import { CoordinatorInbox } from './CoordinatorInbox';
import { TicketCenter } from '@/components/tickets/TicketCenter';
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
  const bottomNav = coordinatorBottomNavItems();

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
        viewOptions={onToggleSellerView ? [
          { label: 'Koordinatorvy', active: true },
          { label: 'Säljarvy', onClick: onToggleSellerView },
        ] : undefined}
      >
        <CoordinatorNav active={tab} onChange={setTab} />
      </AppHeader>

      <main className="py-4 md:py-6 pb-28 md:pb-8 max-w-[1600px] mx-auto md:px-6">
        {tab === 'inbox' && <CoordinatorInbox coordinatorName={role.name} onSelectCase={setSelectedCase} />}
        {tab === 'pipeline' && (
          <Pipeline sellerName={role.name} isCoordinator onSelectCase={setSelectedCase} />
        )}
        {tab === 'calendar' && <CalendarView onSelectCase={setSelectedCase} />}
        {tab === 'deviations' && (
          <TicketCenter currentUser={role.name} role="coordinator" onSelectCase={setSelectedCase} />
        )}
        {tab === 'offers' && <OffersHub currentUser={role.name} />}
        {tab === 'aorders' && <AOrdersView currentUser={role.name} />}
        {tab === 'economy' && <EconomyView />}
      </main>

      <BottomNav items={bottomNav.items} more={bottomNav.more} active={tab} onChange={(k) => setTab(k as CoordinatorTab)} />

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
