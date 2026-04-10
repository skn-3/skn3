import { useState, useCallback } from 'react';
import type { UserRole } from '@/lib/constants';

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
  }, []);

  const clearRole = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRoleState(null);
  }, []);

  return { role, setRole, clearRole };
}
