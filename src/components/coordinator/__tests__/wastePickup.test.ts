import { describe, it, expect } from 'vitest';
import {
  canRequestWastePickup,
  wastePickupState,
  selectOpenWastePickups,
  wasteAgeDays,
  isWasteOverdue,
  requestPatch,
  cancelPatch,
  bookPatch,
  requestDescription,
  pendingSummary,
} from '@/lib/wastePickup';
import { wastePickupEmail, COORDINATOR_TO } from '../../../../supabase/functions/notify-email/wastePickupEmail';

const base = { status: 'montage_klart' };

describe('Skräphämtning — vem kan begära', () => {
  it.each(['montage_bokat', 'montage_pagar', 'montage_klart', 'fakturerad'])('tillåter %s', (status) => {
    expect(canRequestWastePickup({ status })).toBe(true);
  });
  it.each(['godkand', 'leverans_klar', 'km_bokad', 'pausad'])('inte %s', (status) => {
    expect(canRequestWastePickup({ status })).toBe(false);
  });
});

describe('Skräphämtning — urval till inkorgen', () => {
  it('tar bara begärda och obokade, äldst först', () => {
    const rows = [
      { ...base, id: 'b', waste_pickup_requested_at: '2026-11-08T10:00:00Z' },
      { ...base, id: 'none' },
      { ...base, id: 'a', waste_pickup_requested_at: '2026-11-05T10:00:00Z' },
      { ...base, id: 'booked', waste_pickup_requested_at: '2026-11-01T10:00:00Z', waste_pickup_booked_at: '2026-11-02T10:00:00Z' },
    ];
    expect(selectOpenWastePickups(rows).map((r) => r.id)).toEqual(['a', 'b']);
    expect(wastePickupState(rows[3])).toBe('booked');
    expect(wastePickupState(rows[1])).toBe('none');
  });

  it('chipen blir röd först efter 2 dagar', () => {
    const now = new Date('2026-11-09T12:00:00');
    expect(wasteAgeDays({ ...base, waste_pickup_requested_at: '2026-11-07T08:00:00' }, now)).toBe(2);
    expect(isWasteOverdue(2)).toBe(false);
    expect(isWasteOverdue(3)).toBe(true);
  });
});

describe('Skräphämtning — kolumner som skrivs', () => {
  const now = '2026-11-09T08:00:00.000Z';

  it('begäran skriver bara begäransfälten', () => {
    expect(requestPatch({ actor: 'GVMO', note: '  8 fönster på uppfarten ', earliest: '2026-11-12', nowIso: now })).toEqual({
      waste_pickup_requested_at: now,
      waste_pickup_requested_by: 'GVMO',
      waste_pickup_note: '8 fönster på uppfarten',
      waste_pickup_earliest: '2026-11-12',
    });
    expect(requestPatch({ actor: 'GVMO', note: ' ', earliest: '', nowIso: now })).toMatchObject({ waste_pickup_note: null, waste_pickup_earliest: null });
  });

  it('ångra nollställer begäran men aldrig bokningen', () => {
    const p = cancelPatch();
    expect(Object.keys(p).sort()).toEqual(['waste_pickup_earliest', 'waste_pickup_note', 'waste_pickup_requested_at', 'waste_pickup_requested_by']);
  });

  it('bokning skriver bokningsfälten och kräver hämtdag', () => {
    expect(bookPatch({ actor: 'Mirna Malke', date: '2026-11-14', nowIso: now })).toEqual({
      waste_pickup_booked_at: now,
      waste_pickup_booked_by: 'Mirna Malke',
      waste_pickup_date: '2026-11-14',
    });
    expect(() => bookPatch({ actor: 'Mirna Malke', date: '', nowIso: now })).toThrow('Välj hämtdag');
  });

  it('historiktexten följer mallen', () => {
    expect(requestDescription('Storgatan 1', 'GVMO')).toBe('Skräp redo för hämtning (Ragn-Sells) hos Storgatan 1 – GVMO');
    expect(requestDescription('Storgatan 1', 'GVMO', 'emballage', null)).toBe('Skräp redo för hämtning (Ragn-Sells) hos Storgatan 1 – GVMO: emballage');
  });
});

describe('Skräphämtning — sammanfattningsraden', () => {
  it.each([
    [2, 1, '2 kundavstämningar och 1 skräphämtning väntar'],
    [1, 0, '1 kundavstämning väntar'],
    [0, 3, '3 skräphämtningar väntar'],
    [1, 1, '1 kundavstämning och 1 skräphämtning väntar'],
  ])('%i avstämningar + %i hämtningar', (f, p, text) => {
    expect(pendingSummary(f, p)).toBe(text);
  });
  it('visar inget när inget väntar', () => expect(pendingSummary(0, 0)).toBeNull());
});

describe('Skräphämtning — mejlet', () => {
  const c = {
    id: 'abc-123', address: 'Storgatan 1 <b>', customer_name: 'Kund', team: 'GVMO',
    waste_pickup_requested_by: 'GVMO', waste_pickup_note: 'På uppfarten', waste_pickup_earliest: '2026-11-12',
    waste_pickup_requested_at: '2026-11-09T08:00:00Z',
  };
  it('går till koordinatorn med ärendelänk och escapat innehåll', () => {
    const m = wastePickupEmail(c, 'https://n3prenad.smartklimat.org');
    expect(COORDINATOR_TO).toBe('mirna.malke@mockfjards.se');
    expect(m.subject).toBe('Skräp redo att hämtas: Storgatan 1 <b>');
    expect(m.body).toContain('https://n3prenad.smartklimat.org/?case=abc-123');
    expect(m.body).toContain('Storgatan 1 &lt;b&gt;');
    expect(m.body).toContain('På uppfarten');
    expect(m.body).toContain('2026-11-12');
  });
  it('innehåller aldrig ekonomifält', () => {
    const m = wastePickupEmail({ ...c, order_value: 99999, tb_percent: 40 } as any, 'https://x');
    expect(m.body).not.toMatch(/99999|order_value|tb_percent|\d kr/);
  });
});
