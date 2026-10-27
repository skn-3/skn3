import { describe,it,expect } from 'vitest';
import { approvedHoursError,approvedHoursWarning } from '../extraHours';
describe('approved extra hours',()=>{
 it('allows sold 53 requested 0 approved 23 without warning',()=>{expect(approvedHoursError(23)).toBeNull();expect(approvedHoursWarning(23,53,0)).toBe(false);});
 it('allows decimals',()=>expect(approvedHoursError(23.5)).toBeNull());
 it('warns only above both sold and requested',()=>{expect(approvedHoursWarning(54,53,0)).toBe(true);expect(approvedHoursWarning(24,23,25)).toBe(false);expect(approvedHoursWarning(53,53,0)).toBe(false);});
 it.each([0,500])('accepts boundary %s',v=>expect(approvedHoursError(v)).toBeNull());
 it.each([-0.1,500.1,NaN,Infinity])('rejects invalid value %s',v=>expect(approvedHoursError(v)).not.toBeNull());
});
