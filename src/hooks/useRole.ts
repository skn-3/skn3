import { useState, useCallback } from 'react';
import type { UserRole } from '@/lib/constants';
import { logActivity } from '@/lib/activityLog';

const STORAGE_KEY = 'smartklimat_role';

export function useRole() {
  const [role, setRoleState] = useState<UserRole | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setRole = useCallback((newRole: UserRole) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRole));
    setRoleState(newRole);
    // Logga inloggning (fire-and-forget)
    logActivity({
      action: 'login',
      category: 'auth',
      description: `Loggade in som ${newRole.type} (${newRole.name})`,
      actor: { name: newRole.name, role: newRole.type },
      metadata: { isAdmin: !!newRole.isAdmin },
    });
  }, []);

  const clearRole = useCallback(() => {
    const prev = (() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? (JSON.parse(stored) as UserRole) : null;
      } catch { return null; }
    })();
    if (prev) {
      logActivity({
        action: 'logout',
        category: 'auth',
        description: 'Loggade ut',
        actor: { name: prev.name, role: prev.type },
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    setRoleState(null);
  }, []);

  return { role, setRole, clearRole };
}
