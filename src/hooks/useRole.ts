import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserRole, RoleType } from '@/lib/constants';
import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/integrations/supabase/client';
import { setCurrentUserAuth } from '@/lib/authState';

interface ProfileRow {
  id: string;
  name: string;
}

interface UserRoleRow {
  role: RoleType;
  is_admin: boolean;
}

export function useRole() {
  const [role, setRoleState] = useState<UserRole | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string, isFreshLogin: boolean) => {
    const [{ data: profile, error: profileErr }, { data: roleRow, error: roleErr }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name')
        .eq('id', userId)
        .maybeSingle<ProfileRow>(),
      supabase
        .from('user_roles')
        .select('role, is_admin')
        .eq('user_id', userId)
        .maybeSingle<UserRoleRow>(),
    ]);

    if (profileErr || roleErr || !profile || !roleRow) {
      console.error('Failed to load profile/role:', profileErr || roleErr);
      setRoleState(null);
      setCurrentUserAuth(null, false);
      return;
    }

    const next: UserRole = {
      type: roleRow.role,
      name: profile.name,
      isAdmin: roleRow.is_admin,
    };
    setRoleState(next);
    setCurrentUserAuth(next.name, !!next.isAdmin);

    if (isFreshLogin) {
      logActivity({
        action: 'login',
        category: 'auth',
        description: `Loggade in som ${next.type} (${next.name})`,
        actor: { name: next.name, role: next.type },
        metadata: { isAdmin: !!next.isAdmin },
      });
    }
  }, []);


  useEffect(() => {
    // Listen first, then check current session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (!uid) {
        setRoleState(null);
        setCurrentUserAuth(null, false);
        lastUserId.current = null;
        setLoaded(true);
        return;
      }
      const isFresh = event === 'SIGNED_IN' && lastUserId.current !== uid;
      lastUserId.current = uid;
      // Defer to avoid deadlock with auth callback.
      setTimeout(() => {
        loadProfile(uid, isFresh).finally(() => setLoaded(true));
      }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      if (!uid) {
        setLoaded(true);
        return;
      }
      lastUserId.current = uid;
      loadProfile(uid, false).finally(() => setLoaded(true));
    });

    return () => { sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const clearRole = useCallback(async () => {
    const prev = role;
    if (prev) {
      logActivity({
        action: 'logout',
        category: 'auth',
        description: 'Loggade ut',
        actor: { name: prev.name, role: prev.type },
      });
    }
    await supabase.auth.signOut();
    setRoleState(null);
    setCurrentUserAuth(null, false);
  }, [role]);

  return { role, clearRole, loaded };
}
