import { useState } from 'react';
import type { UserRole } from '@/lib/constants';
import type { CaseRow } from '@/lib/supabaseClient';
import { AppHeader } from '@/components/AppHeader';
import { SellerNav } from './SellerNav';
import { Pipeline } from './Pipeline';
import { NewCaseForm } from './NewCaseForm';
import { SellerDashboard } from './SellerDashboard';
import { CaseDetailPanel } from '@/components/shared/CaseDetailPanel';

interface SellerViewProps {
  role: UserRole;
  onChangeRole: () => void;
}

export function SellerView({ role, onChangeRole }: SellerViewProps) {
  const [tab, setTab] = useState<'pipeline' | 'new' | 'dashboard'>('pipeline');
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader role={role} onChangeRole={onChangeRole}>
        <SellerNav active={tab} onChange={setTab} />
      </AppHeader>

      <main className="py-4 md:py-6 max-w-screen-2xl mx-auto">
        {tab === 'pipeline' && (
          <Pipeline sellerName={role.name} onSelectCase={setSelectedCase} />
        )}
        {tab === 'new' && (
          <NewCaseForm sellerName={role.name} onCreated={() => setTab('pipeline')} />
        )}
        {tab === 'dashboard' && (
          <SellerDashboard sellerName={role.name} />
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
