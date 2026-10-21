import { useState, useEffect } from 'react';
import { VelfacPdfCleaner } from '@/components/tools/VelfacPdfCleaner';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Presentation, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/lib/constants';
import type { CaseRow } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import { SellerNav, sellerBottomNavItems, type SellerTab } from './SellerNav';
import { BottomNav } from '@/components/BottomNav';
import { Pipeline } from './Pipeline';
import { SellerDashboard } from './SellerDashboard';
import { DeliveriesView } from './DeliveriesView';
import { VisitForm } from './VisitForm';
import { AdminView } from './AdminView';
import { EconomyView } from '@/components/economy/EconomyView';
import { OffersHub } from '@/components/offers/OffersHub';
import { AOrdersView } from '@/components/aorders/AOrdersView';
import { TicketCenter } from '@/components/tickets/TicketCenter';
import { FutureJobsView, fetchFutureJobs, countDueFutureJobs } from './FutureJobsView';
import { useQuery } from '@tanstack/react-query';
import { MyPayView } from '@/components/consultants/MyPayView';
import { useMyConsultant } from '@/hooks/useMyConsultant';


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
  const navigate = useNavigate();

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

  const { data: futureJobs } = useQuery({ queryKey: ['future_jobs'], queryFn: fetchFutureJobs });
  const futureJobsDue = countDueFutureJobs(futureJobs);
  const { consultant: myConsultant } = useMyConsultant();
  const showMyPay = !!myConsultant;
  const bottomNav = sellerBottomNavItems(isAdmin, futureJobsDue, showMyPay);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        role={role}
        onChangeRole={onChangeRole}
        viewOptions={[
          ...(onToggleMontorView ? [{ label: 'Montörvy', onClick: onToggleMontorView }] : []),
          ...(onToggleCoordinatorView ? [{ label: 'Koordinatorvy', onClick: onToggleCoordinatorView }] : []),
        ]}
        action={{ label: 'Registrera besök', icon: <Plus className="h-4 w-4" />, onClick: () => setTab('visit'), active: tab === 'visit' }}
      >
        <SellerNav active={tab} onChange={setTab} isAdmin={isAdmin} futureJobsDue={futureJobsDue} showMyPay={showMyPay} />
      </AppHeader>

      <main className="py-4 md:py-6 pb-28 md:pb-8 max-w-[1600px] mx-auto md:px-6">
        <div className="flex flex-wrap justify-end gap-2 px-3 md:px-0 mb-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/veckomote')}>
            <Presentation className="h-4 w-4 mr-1" /> Veckomöte
          </Button>
          <VelfacPdfCleaner />
        </div>

        {tab === 'pipeline' && (
          <Pipeline sellerName={role.name} isAdmin={isAdmin} onSelectCase={setSelectedCase} />
        )}
        {tab === 'arenden' && (
          <TicketCenter currentUser={role.name} role="seller" isAdmin={isAdmin} onSelectCase={setSelectedCase} />
        )}
        {tab === 'deliveries' && (
          <DeliveriesView onSelectCase={setSelectedCase} currentUser={role.name} />
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
        {tab === 'offers' && (
          <OffersHub currentUser={role.name} />
        )}
        {tab === 'aorders' && (
          <AOrdersView currentUser={role.name} />
        )}
        {tab === 'futurejobs' && (
          <FutureJobsView currentUser={role.name} onSelectCase={setSelectedCase} />
        )}
        {tab === 'mypay' && showMyPay && <MyPayView />}
        {tab === 'admin' && isAdmin && (
          <AdminView currentUser={role.name} />
        )}

      </main>

      <BottomNav
        items={bottomNav.items}
        more={bottomNav.more}
        active={tab}
        onChange={(k) => setTab(k as SellerTab)}
        action={{ label: 'Besök', icon: Plus, onClick: () => setTab('visit'), active: tab === 'visit' }}
      />

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
