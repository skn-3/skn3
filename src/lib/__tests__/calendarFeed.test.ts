import { describe, it, expect } from 'vitest';
import {
  buildIcs, calendarClient, feedEvents, feedInfo, feedMontageDates, foldIcsLine, escapeIcsText, isConnected,
  feedHttpsUrl, webcalUrl, googleAddUrl, guidePageUrl, isoWeekMonday, type FeedCase,
} from '@/lib/calendarFeed';
import { montageDates, deliveryWeekMonday } from '@/lib/schedule/dates';

const TODAY = '2026-11-16';
const base: FeedCase = {
  id: 'c1', status: 'montage_bokat', address: 'Storgatan 1', city: 'Gävle', customer_name: 'Anna Svensson', customer_phone: '070-123 45 67',
  units: 8, seller: 'Daniel Malke', team: 'Samy', km_team: 'GVMO', km_date: '2026-11-17', km_time: '09:00:00',
  montage_date: '2026-11-20', montage_time: '07:00', montage_days: 3, delivery_date: '2026-11-18', delivery_time: null,
  waste_pickup_date: '2026-11-26', montor_notes: 'Ring före',
};

describe('feedMontageDates följer montageDates i schemat', () => {
  it.each([
    ['2026-11-20', 3], ['2026-11-21', 2], ['2026-11-16', 1], ['2026-11-16', null], ['2026-11-27', 7], ['2026-03-27', 4], ['2026-12-31', 30], ['2026-11-18', 0],
  ] as const)('%s, %s dagar', (start, days) => {
    expect(feedMontageDates(start, days)).toEqual(montageDates(start, days));
  });
  it('ISO-veckans måndag är densamma som i schemat', () => {
    for (const [y, w] of [[2026, 1], [2026, 47], [2027, 1], [2020, 53]]) expect(isoWeekMonday(y, w)).toBe(deliveryWeekMonday(y, w));
  });
});

describe('Vem får vad', () => {
  const cases: FeedCase[] = [
    base,
    { ...base, id: 'c2', km_team: null, team: 'GVMO', seller: 'Gabriel Hanna', montage_date: null, delivery_date: null },
    { ...base, id: 'c3', status: 'pausad', team: 'GVMO' },
  ];
  it('montör: montage där team = namnet och KM där km_team = namnet (utan km_team gäller team)', () => {
    const uids = feedEvents(cases, { name: 'GVMO', role: 'montor' }, TODAY).map((e) => e.uid);
    expect(uids).toEqual(['c1-km@smartklimat', 'c2-km@smartklimat']);
  });
  it('montör: inga leveranser eller hämtningar', () => {
    const kinds = new Set(feedEvents(cases, { name: 'Samy', role: 'montor' }, TODAY).map((e) => e.kind));
    expect([...kinds]).toEqual(['montage']);
  });
  it('säljare: KM, montage och leverans för egna ärenden, ingen hämtning', () => {
    const ev = feedEvents(cases, { name: 'Daniel Malke', role: 'seller' }, TODAY);
    expect(new Set(ev.map((e) => e.kind))).toEqual(new Set(['km', 'montage', 'leverans']));
    expect(ev.every((e) => e.caseId === 'c1')).toBe(true);
  });
  it('koordinator: alla typer för alla ärenden, men aldrig pausade', () => {
    const ev = feedEvents(cases, { name: 'Mirna Malke', role: 'coordinator' }, TODAY);
    expect(new Set(ev.map((e) => e.kind))).toEqual(new Set(['km', 'montage', 'leverans', 'hamtning']));
    expect(ev.some((e) => e.caseId === 'c3')).toBe(false);
  });
  it('60 dagar bakåt, framåt utan gräns', () => {
    const old = { ...base, id: 'old', km_date: '2026-09-17', montage_date: '2030-01-07', montage_days: 1, delivery_date: null, waste_pickup_date: null };
    const uids = feedEvents([old], { name: 'Mirna Malke', role: 'coordinator' }, TODAY).map((e) => e.uid);
    expect(uids).toEqual(['old-km@smartklimat', 'old-montage@smartklimat']);
    const tooOld = { ...old, km_date: '2026-09-16' };
    expect(feedEvents([tooOld], { name: 'Mirna Malke', role: 'coordinator' }, TODAY).map((e) => e.kind)).toEqual(['montage']);
  });
});

describe('Händelser', () => {
  const montor = feedEvents([base], { name: 'Samy', role: 'montor' }, TODAY);
  it('montage ger en händelse per arbetsdag med dagens UID för dag 1', () => {
    expect(montor.map((e) => [e.uid, e.date])).toEqual([
      ['c1-montage@smartklimat', '2026-11-20'],
      ['c1-montage-d2@smartklimat', '2026-11-23'],
      ['c1-montage-d3@smartklimat', '2026-11-24'],
    ]);
  });
  it('titel för montör utan team, med (dag n av N)', () => {
    expect(montor[1].summary).toBe('Montage – Storgatan 1, Gävle (dag 2 av 3)');
  });
  it('säljare och koordinator får även team i titeln', () => {
    const ev = feedEvents([base], { name: 'Daniel Malke', role: 'seller' }, TODAY);
    expect(ev.find((e) => e.kind === 'km')!.summary).toBe('KM – Storgatan 1, Gävle · GVMO');
    expect(ev.find((e) => e.uid === 'c1-montage@smartklimat')!.summary).toBe('Montage – Storgatan 1, Gävle (dag 1 av 3) · Samy');
  });
  it('beskrivning med kund, telefon, enheter, säljare, till montör och länken', () => {
    expect(montor[0].description).toBe('Kund: Anna Svensson\nTelefon: 070-123 45 67\nEnheter: 8\nSäljare: Daniel Malke\nTill montör: Ring före\nÖppna i appen: https://smartklimatentreprenad.com/?case=c1');
    expect(montor[0].url).toBe('https://smartklimatentreprenad.com/?case=c1');
    expect(montor[0].location).toBe('Storgatan 1, Gävle');
  });
  it('"Till montör" bara för montörer', () => {
    const ev = feedEvents([base], { name: 'Daniel Malke', role: 'seller' }, TODAY);
    expect(ev.every((e) => !e.description.includes('Till montör'))).toBe(true);
  });
  it('leveransvecka och hämtning behåller respektive får sina UID', () => {
    const w = { ...base, delivery_date: null, delivery_week: 48, delivery_year: 2026 };
    const ev = feedEvents([w], { name: 'Mirna Malke', role: 'coordinator' }, TODAY);
    const week = ev.find((e) => e.uid === 'c1-leverans-w@smartklimat')!;
    expect(week.date).toBe('2026-11-23');
    expect(week.allDayLength).toBe(7);
    expect(ev.find((e) => e.kind === 'hamtning')!.uid).toBe('c1-hamtning@smartklimat');
  });
});

describe('Inga belopp i något flöde', () => {
  it('ordervärde, TB och andra beloppsfält följer aldrig med, inte heller för säljare', () => {
    const withMoney = { ...base, order_value: 123456, tb_percent: 31, a_order_total: 55555 } as FeedCase;
    for (const role of ['montor', 'seller', 'coordinator'] as const) {
      const name = role === 'montor' ? 'Samy' : role === 'seller' ? 'Daniel Malke' : 'Mirna Malke';
      const ics = buildIcs({ name, events: feedEvents([withMoney], { name, role }, TODAY), now: new Date('2026-11-16T10:00:00Z') });
      expect(ics).not.toMatch(/123\s?456|55\s?555|Ordervärde|ordervärde| kr\b|TB/);
    }
  });
});

describe('ICS-format', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  const ics = buildIcs({ name: 'Samy', events: feedEvents([base], { name: 'Samy', role: 'montor' }, TODAY), now });
  const unfolded = ics.replace(/\r\n /g, '');
  it('CRLF, kalendernamn, tidszon och uppdateringsintervall', () => {
    expect(ics.includes('\n') && !/[^\r]\n/.test(ics)).toBe(true);
    expect(unfolded).toContain('X-WR-CALNAME:SmartKlimat N3prenad – Samy\r\n');
    expect(ics).toContain('X-WR-TIMEZONE:Europe/Stockholm\r\n');
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n');
    expect(ics).toContain('X-PUBLISHED-TTL:PT1H\r\n');
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Stockholm');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('tider med TZID, aldrig flytande; montage 8 timmar', () => {
    expect(ics).toContain('DTSTART;TZID=Europe/Stockholm:20261120T070000\r\nDTEND;TZID=Europe/Stockholm:20261120T150000');
    const events = ics.split('BEGIN:VEVENT').slice(1).join('');
    expect(events).not.toMatch(/^DTSTART:\d{8}T\d{6}\r?$/m);
  });
  it('KM 2 timmar, leverans 1 timme, heldag med DTEND dagen efter', () => {
    const office = buildIcs({ name: 'Mirna Malke', events: feedEvents([{ ...base, delivery_time: '10:30' }], { name: 'Mirna Malke', role: 'coordinator' }, TODAY), now });
    expect(office).toContain('DTSTART;TZID=Europe/Stockholm:20261117T090000\r\nDTEND;TZID=Europe/Stockholm:20261117T110000');
    expect(office).toContain('DTSTART;TZID=Europe/Stockholm:20261118T103000\r\nDTEND;TZID=Europe/Stockholm:20261118T113000');
    expect(office).toContain('DTSTART;VALUE=DATE:20261126\r\nDTEND;VALUE=DATE:20261127');
  });
  it('rader är högst 75 oktetter och delar aldrig ett tecken', () => {
    const enc = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    const long = 'DESCRIPTION:' + 'åäö€'.repeat(40);
    const folded = foldIcsLine(long);
    for (const line of folded.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
  it('escaping av backslash, semikolon, komma och radbrytning', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('calendarClient', () => {
  it.each([
    ['Google-Calendar-Importer', 'google'],
    ['Mozilla/5.0 (compatible; Google-Calendar-Importer)', 'google'],
    ['iOS/17.1 (21B74) dataaccessd/1.0', 'apple'],
    ['macOS/14.1 (23B74) CalendarAgent/988.1', 'apple'],
    ['iOS/18.0 remindd/1.0', 'apple'],
    ['Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17126; Pro)', 'outlook'],
    ['Outlook-iOS/709.2189947.prod.iphone (4.2425.0)', 'outlook'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'browser'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'browser'],
    ['Thunderbird/115', 'other'],
    ['', 'other'],
  ] as const)('%s → %s', (ua, expected) => {
    expect(calendarClient(ua)).toBe(expected);
  });
});

describe('Kopplad', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  it('högst 10 dagar gammal hämtning från en kalenderklient', () => {
    expect(isConnected({ last_fetched_at: '2026-11-06T12:00:00Z', last_client: 'apple' }, now)).toBe(true);
    expect(isConnected({ last_fetched_at: '2026-11-06T11:59:00Z', last_client: 'apple' }, now)).toBe(false);
    expect(isConnected({ last_fetched_at: '2026-11-16T11:00:00Z', last_client: 'browser' }, now)).toBe(false);
    expect(isConnected({ last_fetched_at: null, last_client: null }, now)).toBe(false);
    expect(isConnected(null, now)).toBe(false);
  });
  it('info-svaret har bara namn, kopplad, klient och tid', () => {
    expect(feedInfo('GVMO', { last_fetched_at: '2026-11-16T11:00:00Z', last_client: 'google', fetch_count: 4 } as never, now)).toEqual({ name: 'GVMO', connected: true, last_client: 'google', last_fetched_at: '2026-11-16T11:00:00Z' });
  });
});

describe('Länkar', () => {
  const https = feedHttpsUrl('https://abc.supabase.co', 'tok123');
  it('prenumerationsadress, webcal, Google och guidesida', () => {
    expect(https).toBe('https://abc.supabase.co/functions/v1/calendar-ics?token=tok123');
    expect(webcalUrl(https)).toBe('webcal://abc.supabase.co/functions/v1/calendar-ics?token=tok123');
    expect(googleAddUrl(webcalUrl(https))).toBe('https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fabc.supabase.co%2Ffunctions%2Fv1%2Fcalendar-ics%3Ftoken%3Dtok123');
    expect(guidePageUrl('tok123')).toBe('https://smartklimatentreprenad.com/kalender/tok123');
  });
});
