// Module-level cache for the currently logged-in user's admin flag,
// so legacy helpers (CaseDetailPanel, DeviationActionPanel) that only
// receive `currentUser` by name can still check admin status without
// re-introducing the removed ADMIN_USERS list.

let currentIsAdmin = false;
let currentName: string | null = null;

export function setCurrentUserAuth(name: string | null, isAdmin: boolean) {
  currentName = name;
  currentIsAdmin = isAdmin;
}

export function isCurrentUserAdmin(name?: string): boolean {
  if (name && currentName && name !== currentName) return false;
  return currentIsAdmin;
}

export function getCurrentAuthName(): string | null {
  return currentName;
}
