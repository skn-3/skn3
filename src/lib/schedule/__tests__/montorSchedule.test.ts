import { describe, it, expect } from 'vitest';
import {
  canMontorBookKm, canMontorBookMontage, cardTimeLine, dayCards, dayCountPhrase, montorScheduleEvents, montorToBook, upcomingRows, weekStrip,
  type ScheduleCase,
} from '@/lib/schedule';

const TODAY = '2026-11-17';
const cases: ScheduleCase[] = [
  { id: 'm1', status: 'montage_pagar', address: 'Ekbacken 7', city: 'Lidingö', customer_name: 'Anna', units: 8, team: 'GVMO', montage_date: '2026-11-16', montage_time: '07:00', montage_days: 3 },
  { id: 'k1', status: 'km_bokad', address: 'Lönnstigen 5', city: 'Sollentuna', customer_name: 'Bo', team: 'GVMO', km_date: '2026-11-19', km_time: '09:00' },
  { id: 'k2', status: 'km_bokad', address: 'Björkvägen 2', city: 'Täby', team: 'Samy', km_team: 'GVMO', km_date: '2026-11-19' },
  { id: 'x1', status: 'montage_bokat', address: 'Annat team 1', team: 'Samy', montage_date: '2026-11-19' },
  { id: 'd1', status: 'i_produktion', address: 'Leverans 1', team: 'GVMO', delivery_date: '2026-11-18' },
  { id: 'p1', status: 'pausad', address: 'Pausad 1', team: 'GVMO', montage_date: '2026-11-18' },
];

describe('Montörens händelser', () => {
  it('bara teamets KM och montage, inga leveranser, inga pausade', () => {
    expect(montorScheduleEvents(cases, 'GVMO').map((e) => e.id)).toEqual(['m1-montage', 'k1-km', 'k2-km']);
  });
});

describe('Veckoremsan', () => {
  it('prickar och aria-etikett per dag', () => {
    const strip = weekStrip(TODAY, montorScheduleEvents(cases, 'GVMO'), TODAY);
    expect(strip.map((d) => d.short)).toEqual(['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön']);
    const thu = strip[3];
    expect(thu.dots).toEqual(['km', 'km']);
    expect(thu.ariaLabel).toBe('torsdag 19 november, två kontrollmätningar');
    expect(strip[1].isToday).toBe(true);
    expect(strip[1].ariaLabel).toBe('tisdag 17 november, ett montage');
    expect(strip[6].ariaLabel).toBe('söndag 22 november, inget bokat');
  });
  it('högst tre prickar', () => {
    const many: ScheduleCase[] = [1, 2, 3, 4].map((i) => ({ id: `k${i}`, status: 'km_bokad', address: `A${i}`, team: 'GVMO', km_date: TODAY }));
    expect(weekStrip(TODAY, montorScheduleEvents(many, 'GVMO'), TODAY)[1].dots).toHaveLength(3);
  });
  it('antal i ord', () => {
    expect(dayCountPhrase(1, 1)).toBe('ett montage och en kontrollmätning');
    expect(dayCountPhrase(0, 0)).toBe('inget bokat');
    expect(dayCountPhrase(12, 0)).toBe('12 montage');
  });
});

describe('Dagens kort', () => {
  const events = montorScheduleEvents(cases, 'GVMO');
  it('tidsrad: idag från tid med dag n av N, klockslag eller heldag', () => {
    const [card] = dayCards(TODAY, events, TODAY);
    expect(card.chip).toBe('Montage pågår');
    expect(card.timeLine).toBe('Idag från 07:00 · dag 2 av 3');
    expect(card.sub).toBe('Lidingö · 8 enheter · Anna');
    const thu = dayCards('2026-11-19', events, TODAY);
    expect(thu.map((c) => c.timeLine)).toEqual(['09:00', 'Heldag']);
    expect(thu.map((c) => c.chip)).toEqual(['KM', 'KM']);
  });
  it('tidsrad för montage annan dag', () => {
    expect(cardTimeLine({ kind: 'montage', time: '07:00', days: 1, dates: ['2026-11-20'] }, '2026-11-20', TODAY)).toBe('Från 07:00');
  });
});

describe('Kommande', () => {
  it('bokningar som börjar efter vald dag, högst tio', () => {
    const rows = upcomingRows(montorScheduleEvents(cases, 'GVMO'), TODAY);
    expect(rows.map((r) => [r.day, r.time, r.place, r.chip])).toEqual([
      ['tors 19', '09:00', 'Lönnstigen 5, Sollentuna', 'KM'],
      ['tors 19', 'heldag', 'Björkvägen 2, Täby', 'KM'],
    ]);
    const many: ScheduleCase[] = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, status: 'montage_bokat', address: `G${i}`, team: 'GVMO', units: 4, montage_date: '2026-11-20' }));
    const up = upcomingRows(montorScheduleEvents(many, 'GVMO'), TODAY);
    expect(up).toHaveLength(10);
    expect(up[0].place).toBe('G0 · 4 enh');
  });
});

describe('Att boka', () => {
  it('samma villkor som ärendesidan', () => {
    expect(canMontorBookKm({ status: 'vantar_km' })).toBe(true);
    expect(canMontorBookKm({ status: 'km_bokad' })).toBe(false);
    expect(canMontorBookMontage({ status: 'godkand', montage_date: null })).toBe(true);
    expect(canMontorBookMontage({ status: 'leverans_klar', montage_date: null })).toBe(true);
    expect(canMontorBookMontage({ status: 'i_produktion', montage_date: '2026-11-20' })).toBe(false);
    expect(canMontorBookMontage({ status: 'km_klar', montage_date: null })).toBe(false);
  });
  it('teamets ärenden, äldst först, med väntetid', () => {
    const rows = montorToBook([
      { id: 'a', status: 'vantar_km', address: 'Ny 1', city: 'Solna', team: 'GVMO', status_changed_at: '2026-11-10T08:00:00Z' },
      { id: 'b', status: 'godkand', address: 'Gammal 2', city: 'Nacka', team: 'GVMO', status_changed_at: '2026-10-28T08:00:00Z' },
      { id: 'c', status: 'vantar_km', address: 'KM-team 3', team: 'Samy', km_team: 'GVMO', created_at: '2026-11-16T08:00:00Z' },
      { id: 'd', status: 'vantar_km', address: 'Annat 4', team: 'Samy' },
      { id: 'e', status: 'pausad', address: 'Pausad 5', team: 'GVMO' },
    ], 'GVMO', TODAY);
    expect(rows.map((r) => r.text)).toEqual([
      'Gammal 2, Nacka · Montage · väntat 20 d',
      'Ny 1, Solna · KM · väntat 7 d',
      'KM-team 3 · KM · väntat 1 d',
    ]);
  });
});
