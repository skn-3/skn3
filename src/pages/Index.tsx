import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { RolePicker } from '@/components/RolePicker';
import { SellerView } from '@/components/seller/SellerView';
import { MontorView } from '@/components/montor/MontorView';
import { CoordinatorView } from '@/components/coordinator/CoordinatorView';
import { WelcomeDashboard } from '@/components/WelcomeDashboard';

const WELCOME_KEY_PREFIX = 'smartklimat_welcome_shown_';

function shouldShowWelcome(name: string): boolean {
  try {
    const last = localStorage.getItem(WELCOME_KEY_PREFIX + name);
    if (!last) return true;
    return last !== new Date().toISOString().slice(0, 10);
  } catch { return true; }
}

function markWelcomeShown(name: string) {
  try {
    localStorage.setItem(WELCOME_KEY_PREFIX + name, new Date().toISOString().slice(0, 10));
  } catch {}
}

const Index = () => {
  const { role, setRole, clearRole } = useRole();
  const [showMontorView, setShowMontorView] = useState(false);
  const [searchParams] = useSearchParams();
  const [initialCaseId, setInitialCaseId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const cid = searchParams.get('case');
    if (cid) setInitialCaseId(cid);
  }, [searchParams]);

  // Show welcome once per day per user (skip if deep-linking to a case)
  useEffect(() => {
    if (role && !initialCaseId && shouldShowWelcome(role.name)) {
      setShowWelcome(true);
    }
  }, [role, initialCaseId]);

  if (!role) {
    return <RolePicker onRoleSelected={setRole} />;
  }

  if (showWelcome) {
    return (
      <WelcomeDashboard
        role={role}
        onContinue={() => {
          markWelcomeShown(role.name);
          setShowWelcome(false);
        }}
      />
    );
  }

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

  if (role.type === 'coordinator') {
    return (
      <CoordinatorView
        role={role}
        onChangeRole={clearRole}
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
