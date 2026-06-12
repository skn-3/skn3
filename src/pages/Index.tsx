import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { RolePicker } from '@/components/RolePicker';
import { SellerView } from '@/components/seller/SellerView';
import { MontorView } from '@/components/montor/MontorView';
import { CoordinatorView } from '@/components/coordinator/CoordinatorView';
import { WelcomeDashboard } from '@/components/WelcomeDashboard';
import { ForcePinChangeGate } from '@/components/ForcePinChangeGate';
import { supabase } from '@/integrations/supabase/client';

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
  const { role, clearRole } = useRole();
  const [showMontorView, setShowMontorView] = useState(false);
  const [showCoordinatorView, setShowCoordinatorView] = useState(false);
  const [searchParams] = useSearchParams();
  const [initialCaseId, setInitialCaseId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [mustChangePin, setMustChangePin] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const cid = searchParams.get('case');
    if (cid) setInitialCaseId(cid);
  }, [searchParams]);

  // Hämta must_change_pin från profilen för inloggad user
  useEffect(() => {
    let cancelled = false;
    if (!role) { setMustChangePin(null); setUserId(null); return; }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (!uid) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('must_change_pin')
        .eq('id', uid)
        .maybeSingle();
      if (cancelled) return;
      setUserId(uid);
      setMustChangePin(!!profile?.must_change_pin);
    })();
    return () => { cancelled = true; };
  }, [role]);

  // Show welcome once per day per user (skip if deep-linking to a case)
  useEffect(() => {
    if (role && role.type !== 'coordinator' && !initialCaseId && shouldShowWelcome(role.name) && mustChangePin === false) {
      setShowWelcome(true);
    }
  }, [role, initialCaseId, mustChangePin]);

  if (!role) {
    return <RolePicker />;
  }

  // Blockera all åtkomst tills 6-siffrig PIN är vald
  if (mustChangePin && userId) {
    return (
      <ForcePinChangeGate
        userId={userId}
        userName={role.name}
        onCompleted={() => setMustChangePin(false)}
      />
    );
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

  if (role.isAdmin && showCoordinatorView && role.type === 'seller') {
    return (
      <CoordinatorView
        role={role}
        onChangeRole={clearRole}
        onToggleSellerView={() => setShowCoordinatorView(false)}
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
        onToggleCoordinatorView={role.isAdmin ? () => setShowCoordinatorView(true) : undefined}
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
