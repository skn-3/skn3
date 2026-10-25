import { describe, expect, it } from 'vitest';
import { pullState } from './usePullToRefresh';

describe('pullState', () => {
  it('ignores upward or absent dragging', () => {
    expect(pullState(-72)).toBe('idle');
    expect(pullState(0)).toBe('idle');
  });
  it('requires 72 px to refresh', () => {
    expect(pullState(1)).toBe('pulling');
    expect(pullState(71)).toBe('pulling');
    expect(pullState(72)).toBe('ready');
    expect(pullState(100)).toBe('ready');
  });
});