import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { RolePicker } from '@/components/RolePicker';
import { SellerView } from '@/components/seller/SellerView';
import { MontorView } from '@/components/montor/MontorView';

const Index = () => {
  const { role, setRole, clearRole } = useRole();
  const [showMontorView, setShowMontorView] = useState(false);
  const [searchParams] = useSearchParams();
  // Persist deep-link case id across RolePicker flow
  const [initialCaseId, setInitialCaseId] = useState<string | null>(null);

  useEffect(() => {
    const cid = searchParams.get('case');
    if (cid) setInitialCaseId(cid);
  }, [searchParams]);

  if (!role) {
    return <RolePicker onRoleSelected={setRole} />;
  }

  // Admin can toggle to montör view
  if (role.isAdmin && showMontorView) {
    return (
      <MontorView
        role={role}
        onChangeRole={clearRole}
        isAdmin
        onToggleView={() => setShowMontorView(false)}
        initialCaseId={initialCaseId}
        onInitialCaseHandled={() => setInitialCaseId(null)}
      />
    );
  }

  if (role.type === 'seller') {
    return (
      <SellerView
        role={role}
        onChangeRole={clearRole}
        onToggleMontorView={role.isAdmin ? () => setShowMontorView(true) : undefined}
        initialCaseId={initialCaseId}
        onInitialCaseHandled={() => setInitialCaseId(null)}
      />
    );
  }

  return (
    <MontorView
      role={role}
      onChangeRole={clearRole}
      initialCaseId={initialCaseId}
      onInitialCaseHandled={() => setInitialCaseId(null)}
    />
  );
};

export default Index;
