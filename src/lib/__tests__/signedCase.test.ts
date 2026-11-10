import { describe, it, expect } from 'vitest';
import { buildSignedCaseRecord, emptySignedCaseFields, signedCaseFieldsValid } from '@/lib/signedCase';

const base = {
  customer_name: 'Kund Testsson',
  address: 'Storgatan 1, Visby',
  customer_email: '',
  ...emptySignedCaseFields(),
  units: '2',
  city: 'Visby',
  offer_number: 'AF-123',
};

describe('buildSignedCaseRecord', () => {
  it('Gotland ger Congard som både KM- och montageteam', () => {
    const r = buildSignedCaseRecord(base, 'Säljare');
    expect(r.team).toBe('Congard');
    expect(r.km_team).toBe('Congard');
    expect(r.is_gotland).toBe(true);
  });

  it('utanför Gotland lämnas teamen tomma (null)', () => {
    const r = buildSignedCaseRecord({ ...base, address: 'Storgatan 1, Uppsala', city: 'Uppsala' }, 'Säljare');
    expect(r.team).toBeNull();
    expect(r.km_team).toBeNull();
    expect(r.is_gotland).toBe(false);
  });

  it('TB null, extra timmar 0 och telefon tom sträng', () => {
    const r = buildSignedCaseRecord({ ...base, city: 'Uppsala', address: 'Gatan 2' }, 'Säljare');
    expect(r.tb_percent).toBeNull();
    expect(r.extra_hours_sold).toBe(0);
    expect(r.customer_phone).toBe('');
    expect(r.google_drive_link).toBeNull();
    expect(r.notes).toBeNull();
    expect(r.status).toBe('vantar_km');
  });
});

describe('signedCaseFieldsValid', () => {
  it('kräver affärsförslagsnummer', () => {
    expect(signedCaseFieldsValid(base)).toBe(true);
    expect(signedCaseFieldsValid({ ...base, offer_number: '  ' })).toBe(false);
  });
  it('kräver heltal minst 1 enhet', () => {
    expect(signedCaseFieldsValid({ ...base, units: '0' })).toBe(false);
    expect(signedCaseFieldsValid({ ...base, units: '1.5' })).toBe(false);
  });
});
