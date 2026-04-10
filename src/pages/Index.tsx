import { useRole } from '@/hooks/useRole';
import { RolePicker } from '@/components/RolePicker';
import { SellerView } from '@/components/seller/SellerView';
import { MontorView } from '@/components/montor/MontorView';

const Index = () => {
  const { role, setRole, clearRole } = useRole();

  if (!role) {
    return <RolePicker onRoleSelected={setRole} />;
  }

  if (role.type === 'seller') {
    return <SellerView role={role} onChangeRole={clearRole} />;
  }

  return <MontorView role={role} onChangeRole={clearRole} />;
};

export default Index;
