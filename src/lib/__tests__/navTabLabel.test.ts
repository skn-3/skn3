import { describe, expect, it } from 'vitest';
import { navTabLabel } from '@/lib/navTabLabel';

describe('navTabLabel', () => {
  it('fliknamnet när inget antal finns', () => {
    expect(navTabLabel('Pipeline', 'pipeline', 5, 3)).toBe('Pipeline');
    expect(navTabLabel('Chatt', 'chatt', 0)).toBe('Chatt');
  });
  it('Chatt med olästa', () => {
    expect(navTabLabel('Chatt', 'chatt', 4)).toBe('Chatt, 4 olästa');
  });
  it('Min inkorg behåller antalet öppna punkter', () => {
    expect(navTabLabel('Min inkorg', 'inbox', 0, 2)).toBe('Min inkorg, 2 öppna punkter');
  });
});
