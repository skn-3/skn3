import { describe, it, expect } from 'vitest';
import { calendarGuideEmail, maskEmail } from '../../../supabase/functions/_shared/calendarGuideEmail';

describe('Mejlet med kalenderguiden', () => {
  const mail = calendarGuideEmail({ name: 'GVMO', team: true, webcal: 'webcal://abc.supabase.co/functions/v1/calendar-ics?token=t1', token: 't1' });
  it('rubrik, knappar och iPhone-raden', () => {
    expect(mail.heading).toBe('Lägg till schemat i din kalender');
    expect(mail.body).toContain('Lägg till i Google Kalender');
    expect(mail.body).toContain('href="https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fabc.supabase.co%2Ffunctions%2Fv1%2Fcalendar-ics%3Ftoken%3Dt1"');
    expect(mail.body).toContain('href="https://smartklimatentreprenad.com/kalender/t1"');
    expect(mail.body).toContain('Öppna guiden');
    expect(mail.body).toContain('Har du iPhone? Öppna guiden på telefonen.');
  });
  it('namnet escapas', () => {
    expect(calendarGuideEmail({ name: '<b>X</b>', team: true, webcal: 'webcal://x', token: 't' }).body).not.toContain('<b>X</b>');
  });
});

describe('maskEmail', () => {
  it('visar första tecknet och domänen', () => {
    expect(maskEmail('gvmo.bygg@gmail.com')).toBe('g***@gmail.com');
    expect(maskEmail('')).toBe('');
    expect(maskEmail('ingen-adress')).toBe('');
  });
});
