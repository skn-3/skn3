import { describe, it, expect } from 'vitest';
import { parseAiReply, stockholmMidnight, scopeInterval, dailyLimitReached, isoWeek } from '../aiChat';
const id = '12345678-1234-1234-1234-123456789abc';
describe('AI ärendereferenser', () => {
  it('tar bort markörer och behåller högst tre unika giltiga id', () => {
    const result = parseAiReply(`Klart.\n[[case:${id}]]\n[[case:${id}]]\n[[case:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]]\n[[case:bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee]]\n[[case:cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee]]\n[[case:ogiltig]]`);
    expect(result.reply).toBe('Klart.'); expect(result.case_ids).toEqual([id,'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee']);
  });
});
it('dagstaket är 40 användarmeddelanden', () => { expect(dailyLimitReached(39)).toBe(false); expect(dailyLimitReached(40)).toBe(true); });
it('Stockholm-midnatt tar hänsyn till vintertid och sommartid', () => {
  expect(stockholmMidnight(new Date('2026-10-25T23:29:00Z'))).toBe('2026-10-25T23:00:00.000Z');
  expect(stockholmMidnight(new Date('2026-07-20T12:00:00Z'))).toBe('2026-07-19T22:00:00.000Z');
});
it('midnatt på dagen när klockan ställs om använder offset vid midnatt', () => {
  expect(stockholmMidnight(new Date('2026-10-25T12:00:00Z'))).toBe('2026-10-24T22:00:00.000Z');
  expect(stockholmMidnight(new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-28T23:00:00.000Z');
});
it('scope today följer Stockholm-datum', () => { expect(scopeInterval('today', new Date('2026-10-25T23:29:00Z'))).toEqual({start:'2026-10-26',end:'2026-10-26'}); });
it('scope week är måndag till söndag', () => { expect(scopeInterval('week', new Date('2026-10-25T12:00:00Z'))).toEqual({start:'2026-10-19',end:'2026-10-25'}); });
it('upcoming omfattar 14 dagar inklusive idag', () => { expect(scopeInterval('upcoming', new Date('2026-10-25T12:00:00Z'))).toEqual({start:'2026-10-25',end:'2026-11-07'}); });
it('active saknar datumgräns', () => { expect(scopeInterval('active')).toBeNull(); });
it('veckonummer följer ISO och Stockholm', () => { expect(isoWeek(new Date('2026-10-25T23:29:00Z'))).toBe(44); });
