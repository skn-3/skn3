import { useState } from 'react';
import type { UserRole } from '@/lib/constants';
import type { CaseRow } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import { SellerNav, type SellerTab } from './SellerNav';
import { Pipeline } from './Pipeline';
import { NewCaseForm } from './NewCaseForm';
import { SellerDashboard } from './SellerDashboard';
import { VisitForm } from './VisitForm';
import { ImportCaseForm } from './ImportCaseForm';
import { CleanAddressesView } from './CleanAddressesView';
import { ADMIN_USERS } from '@/lib/constants';
import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';

interface SellerViewProps {
  role: UserRole;
  onChangeRole: () => void;
  onToggleMontorView?: () => void;
}

export function SellerView({ role, onChangeRole, onToggleMontorView }: SellerViewProps) {
  const [tab, setTab] = useState<SellerTab>('pipeline');
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [prefill, setPrefill] = useState<{ customer_name?: string; address?: string; order_value?: string } | null>(null);

  const handleCreateFromVisit = (data: { customer_name: string; address: string; order_value?: number }) => {
    setPrefill({
      customer_name: data.customer_name,
      address: data.address,
      order_value: data.order_value?.toString() || '',
    });
    setTab('new');
  };

  const isAdmin = ADMIN_USERS.includes(role.name);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader role={role} onChangeRole={onChangeRole}>
        <SellerNav active={tab} onChange={setTab} isAdmin={isAdmin} />
      </AppHeader>

      {onToggleMontorView && (
        <div className="flex justify-end px-4 pt-2 max-w-screen-2xl mx-auto">
          <Button variant="outline" size="sm" onClick={onToggleMontorView}>
            <Eye className="h-4 w-4 mr-1" /> Visa montörvy
          </Button>
        </div>
      )}

      <main className="py-4 md:py-6 max-w-screen-2xl mx-auto">
        {tab === 'pipeline' && (
          <Pipeline sellerName={role.name} isAdmin={isAdmin} onSelectCase={setSelectedCase} />
        )}
        {tab === 'new' && (
          <NewCaseForm
            sellerName={role.name}
            onCreated={() => { setTab('pipeline'); setPrefill(null); }}
            prefill={prefill || undefined}
          />
        )}
        {tab === 'visit' && (
          <VisitForm sellerName={role.name} onCreateCase={handleCreateFromVisit} />
        )}
        {tab === 'dashboard' && (
          <SellerDashboard sellerName={role.name} />
        )}
        {tab === 'import' && isAdmin && (
          <ImportCaseForm sellerName={role.name} />
        )}
        {tab === 'clean-addresses' && isAdmin && (
          <CleanAddressesView currentUser={role.name} />
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
