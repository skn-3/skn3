import { describe, it, expect } from 'vitest';
import { hasShortcutModifier, isTypingTarget } from '@/lib/keyboard';

describe('isTypingTarget', () => {
  it('input, textarea, select och contentEditable ger sant', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const inner = document.createElement('span');
    editable.appendChild(inner);
    document.body.appendChild(editable);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(inner)).toBe(true);
    editable.remove();
  });

  it('body och null ger falskt', () => {
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('hasShortcutModifier', () => {
  it('Ctrl, Cmd eller Alt räknas', () => {
    expect(hasShortcutModifier({ ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(hasShortcutModifier({ ctrlKey: false, metaKey: true, altKey: false })).toBe(true);
    expect(hasShortcutModifier({ ctrlKey: false, metaKey: false, altKey: true })).toBe(true);
    expect(hasShortcutModifier({ ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });
});
