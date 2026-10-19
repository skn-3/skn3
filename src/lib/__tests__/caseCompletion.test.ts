import { describe, it, expect } from 'vitest';
import { needsCompletion } from '../caseCompletion';

describe('needsCompletion', () => {
  it('km_klar utan ordervärde kräver komplettering', () => {
    expect(needsCompletion({ status: 'km_klar', order_value: null })).toBe(true);
  });
  it('senare status utan ordervärde kräver komplettering', () => {
    expect(needsCompletion({ status: 'montage_bokat', order_value: null })).toBe(true);
  });
  it('före km_klar krävs inget', () => {
    expect(needsCompletion({ status: 'km_bokad', order_value: null })).toBe(false);
  });
  it('med ordervärde krävs inget', () => {
    expect(needsCompletion({ status: 'km_klar', order_value: 120000 })).toBe(false);
  });
});
