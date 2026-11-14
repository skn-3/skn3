import { describe, expect, it } from 'vitest';
import { bookingOutcome } from '../outcome';
import { LOCAL_BACKEND_WARNING, SMS_FAILED_WARNING, SMS_NO_PHONE_WARNING, isLocalSkip, teamMailWarning } from '../messages';

describe('bookingOutcome', () => {
  it('team mail only when the team has an address and no mail warning', () => {
    expect(bookingOutcome({ warnings: [], mailTeam: 'Samy', teamEmail: 'x@example.com', smsRequested: false })).toEqual({ teamMailed: true, smsSent: false, local: false });
    expect(bookingOutcome({ warnings: [], mailTeam: 'Samy', teamEmail: '', smsRequested: false }).teamMailed).toBe(false);
    expect(bookingOutcome({ warnings: [teamMailWarning('Samy')], mailTeam: 'Samy', teamEmail: 'x@example.com', smsRequested: false }).teamMailed).toBe(false);
    expect(bookingOutcome({ warnings: [], mailTeam: null, teamEmail: 'x', smsRequested: false }).teamMailed).toBe(false);
  });
  it('SMS only when requested and not failed or skipped', () => {
    expect(bookingOutcome({ warnings: [], mailTeam: 'Samy', teamEmail: 'x', smsRequested: true }).smsSent).toBe(true);
    expect(bookingOutcome({ warnings: [SMS_NO_PHONE_WARNING], mailTeam: 'Samy', teamEmail: 'x', smsRequested: true }).smsSent).toBe(false);
    expect(bookingOutcome({ warnings: [SMS_FAILED_WARNING], mailTeam: 'Samy', teamEmail: 'x', smsRequested: true }).smsSent).toBe(false);
  });
  it('testmiljön: varken mejl eller SMS räknas som skickat', () => {
    expect(bookingOutcome({ warnings: [LOCAL_BACKEND_WARNING], mailTeam: 'Samy', teamEmail: 'x@example.com', smsRequested: true })).toEqual({ teamMailed: false, smsSent: false, local: true });
  });
  it('svaret { skipped: local_backend } känns igen', () => {
    expect(isLocalSkip({ skipped: 'local_backend' })).toBe(true);
    expect(isLocalSkip({ skipped: 'no_valid_phone' })).toBe(false);
    expect(isLocalSkip({ success: true })).toBe(false);
    expect(isLocalSkip(null)).toBe(false);
  });
});
