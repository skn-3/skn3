import { describe, it, expect } from 'vitest';
import { chatReadTarget, isDocumentVisible, shouldMarkIncomingRead } from '@/lib/chat';

describe('läsmarkering bara när dokumentet syns', () => {
  it('läsmålet är den öppna konversationen bara när en ChatView visas och dokumentet syns', () => {
    expect(chatReadTarget('c1', true, 'visible')).toBe('c1');
    expect(chatReadTarget('c1', true, 'hidden')).toBeNull();
    expect(chatReadTarget('c1', false, 'visible')).toBeNull();
    expect(chatReadTarget(null, true, 'visible')).toBeNull();
  });
  it('inkommande meddelande läsmarkeras inte i bakgrundsflik eller med låst skärm', () => {
    expect(shouldMarkIncomingRead('c1', 'c1', 'visible')).toBe(true);
    expect(shouldMarkIncomingRead('c1', 'c1', 'hidden')).toBe(false);
    expect(shouldMarkIncomingRead('c1', 'c2', 'visible')).toBe(false);
    expect(shouldMarkIncomingRead(null, 'c1', 'visible')).toBe(false);
  });
  it('när dokumentet blir synligt igen blir konversationen läsmål igen', () => {
    const before = chatReadTarget('c1', true, 'hidden');
    const after = chatReadTarget('c1', true, 'visible');
    expect(before).toBeNull();
    expect(after).toBe('c1');
  });
  it('bara "visible" räknas som synligt', () => {
    expect(isDocumentVisible('visible')).toBe(true);
    expect(isDocumentVisible('hidden')).toBe(false);
    expect(isDocumentVisible('prerender')).toBe(false);
    expect(isDocumentVisible(undefined)).toBe(false);
  });
});
