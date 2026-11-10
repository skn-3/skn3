/**
 * Delade regler för globala kortkommandon (t.ex. "/" för sök).
 * Ett kortkommando får aldrig sluka tecken när användaren skriver i ett fält.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  if (target.isContentEditable) return true;
  const editable = target.closest('[contenteditable]');
  return !!editable && editable.getAttribute('contenteditable') !== 'false';
}

/** Sant när Ctrl, Cmd eller Alt hålls ned – då lämnas tangenten till webbläsaren/OS. */
export function hasShortcutModifier(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}
