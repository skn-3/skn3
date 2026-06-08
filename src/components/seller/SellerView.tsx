import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { UserRole } from '@/lib/constants';
import type { CaseRow } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import { SellerNav, type SellerTab } from './SellerNav';
import { Pipeline } from './Pipeline';
import { SellerDashboard } from './SellerDashboard';
import { VisitForm } from './VisitForm';
import { AdminView } from './AdminView';
import { EconomyView } from '@/components/economy/EconomyView';


import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';
import { CalendarView } from '@/components/calendar/CalendarView';
import { supabase } from '@/integrations/supabase/client';

interface SellerViewProps {
  role: UserRole;
  onChangeRole: () => void;
  onToggleMontorView?: () => void;
  onToggleCoordinatorView?: () => void;
  initialCaseId?: string | null;
  onInitialCaseHandled?: () => void;
}

export function SellerView({ role, onChangeRole, onToggleMontorView, onToggleCoordinatorView, initialCaseId, onInitialCaseHandled }: SellerViewProps) {
  const [tab, setTab] = useState<SellerTab>('pipeline');
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [, setSearchParams] = useSearchParams();

  // Deep-link: open case panel when ?case=<id> is provided
  useEffect(() => {
    if (!initialCaseId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('cases').select('*').eq('id', initialCaseId).maybeSingle();
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

  const isAdmin = !!role.isAdmin;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        role={role}
        onChangeRole={onChangeRole}
        toggleViews={[
          ...(onToggleMontorView ? [{ label: 'Visa montörvy', onClick: onToggleMontorView }] : []),
          ...(onToggleCoordinatorView ? [{ label: 'Visa koordinatorvy', onClick: onToggleCoordinatorView }] : []),
        ]}
      >
        <SellerNav active={tab} onChange={setTab} isAdmin={isAdmin} />
      </AppHeader>

      <main className="py-4 md:py-6 max-w-screen-2xl mx-auto">

        {tab === 'pipeline' && (
          <Pipeline sellerName={role.name} isAdmin={isAdmin} onSelectCase={setSelectedCase} />
        )}
        {tab === 'calendar' && (
          <CalendarView onSelectCase={setSelectedCase} />
        )}
        {tab === 'visit' && (
          <VisitForm sellerName={role.name} />
        )}
        {tab === 'dashboard' && (
          <SellerDashboard sellerName={role.name} />
        )}
        {tab === 'economy' && isAdmin && (
          <EconomyView />
        )}
        {tab === 'admin' && isAdmin && (
          <AdminView currentUser={role.name} />
        )}

      </main>

      {selectedCase && (
        <CaseDetailPanel
          caseData={selectedCase}
          currentUser={role.name}
          isSeller={true}
          onClose={() => setSelectedCase(null)}
        />
      )}
    </div>
  );
}
