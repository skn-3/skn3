import { describe, it, expect } from 'vitest';
import { calcPriceCodes, checkOfferSendGate, effectiveCalcLines } from './offerSendGate';

const calc = {
  version: 1,
  rows: [{
    id: 'g', trade: 'golv',
    lines: [
      { key: 'golv.material', code: 'golv.mat.ekparkett-3stav', unit_price: 343.2, price_status: 'godkand' },
      { key: 'golv.rivning', code: 'golv.arb.rivning', unit_price: null, price_status: 'utkast' },
    ],
    overrides: {},
  }],
  common: [{ key: 'gem.1', code: 'gem.ovr.etablering', unit_price: 2500, price_status: 'godkand' }],
};

describe('serverspärren i send-offer', () => {
  it('stoppar rad utan pris och ej godkänt pris', () => {
    const r = checkOfferSendGate(calc, { 'golv.mat.ekparkett-3stav': 'godkand', 'golv.arb.rivning': 'utkast', 'gem.ovr.etablering': 'godkand' });
    expect(r.ok).toBe(false);
    expect(r.missing).toBe(1);
    expect(r.not_approved).toEqual(['golv.arb.rivning']);
    expect(r.error).toBe('Offerten kan inte skickas: 1 rad saknar pris och 1 pris är inte godkänt i prislistan. Öppna kalkylen och rätta innan du skickar.');
  });

  it('borttagen rad hoppas över och ändrat à-pris gäller före sparat', () => {
    const c = { ...calc, rows: [{ ...calc.rows[0], overrides: { 'golv.rivning': { removed: true } } }] };
    expect(effectiveCalcLines(c)).toHaveLength(2);
    expect(checkOfferSendGate(c, { 'golv.mat.ekparkett-3stav': 'godkand', 'gem.ovr.etablering': 'godkand' }).ok).toBe(true);
    const priced = { ...calc, rows: [{ ...calc.rows[0], overrides: { 'golv.rivning': { unit_price: 80 } } }] };
    const r = checkOfferSendGate(priced, { 'golv.mat.ekparkett-3stav': 'godkand', 'golv.arb.rivning': 'godkand', 'gem.ovr.etablering': 'godkand' });
    expect(r).toMatchObject({ ok: true, missing: 0 });
  });

  it('aktuell status i prislistan gäller före sparad; saknad kod använder radens status', () => {
    expect(checkOfferSendGate(calc, { 'golv.mat.ekparkett-3stav': 'utkast', 'golv.arb.rivning': 'utkast', 'gem.ovr.etablering': 'godkand' }).not_approved)
      .toEqual(['golv.mat.ekparkett-3stav', 'golv.arb.rivning']);
    // Koden finns inte kvar: radens sparade price_status (utkast) används.
    expect(checkOfferSendGate(calc, { 'golv.mat.ekparkett-3stav': 'godkand', 'gem.ovr.etablering': 'godkand' }).not_approved).toEqual(['golv.arb.rivning']);
    expect(checkOfferSendGate(calc, { 'golv.mat.ekparkett-3stav': 'arkiverad', 'golv.arb.rivning': 'godkand', 'gem.ovr.etablering': 'godkand' }).error)
      .toBe('Offerten kan inte skickas: 1 rad saknar pris och 1 pris är inte godkänt i prislistan. Öppna kalkylen och rätta innan du skickar.');
  });

  it('koder och offert utan kalkyl', () => {
    expect(calcPriceCodes(calc)).toEqual(['golv.mat.ekparkett-3stav', 'golv.arb.rivning', 'gem.ovr.etablering']);
    expect(checkOfferSendGate(null, {})).toMatchObject({ ok: true, error: null });
  });
});
