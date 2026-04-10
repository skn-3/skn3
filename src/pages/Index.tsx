import { useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { RolePicker } from '@/components/RolePicker';
import { SellerView } from '@/components/seller/SellerView';
import { MontorView } from '@/components/montor/MontorView';

const Index = () => {
  const { role, setRole, clearRole } = useRole();
  const [showMontorView, setShowMontorView] = useState(false);

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
      />
    );
  }

  if (role.type === 'seller') {
    return (
      <SellerView
        role={role}
        onChangeRole={clearRole}
        onToggleMontorView={role.isAdmin ? () => setShowMontorView(true) : undefined}
      />
    );
  }

  return <MontorView role={role} onChangeRole={clearRole} />;
};

export default Index;
