import { describe, it, expect } from 'vitest';
import {
  parseAddress, scoreCase, rankCases, sameStreetKey, streetDistance, matchesSearch, findSameAddress,
} from './caseMatching';

const c = (id: string, extra: Record<string, unknown>) => ({ id, ...extra });

describe('parseAddress', () => {
  it('tolkar gata, nummer, bokstav och ort', () => {
    const p = parseAddress('Zabergsvägen 24B ,  645 71 Strängnäs');
    expect(p).toMatchObject({ number: '24', letter: 'b', city: 'strängnäs', valid: true });
    expect(parseAddress('Zabergsvägen 24 B').key).toBe(p.key);
  });
  it('ort utan kommatecken', () => {
    expect(parseAddress('Näsåvägen 33 Nykvarn').city).toBe('nykvarn');
  });
  it('tar bort prefixtext', () => {
    expect(parseAddress('Rättelse - Hallongränd 19, Enebyberg').key).toBe(parseAddress('Hallongränd 19').key);
    expect(parseAddress('Komplettering Hallongränd 19').key).toBe(parseAddress('Hallongränd 19').key);
  });
  it('expanderar förkortningar', () => {
    expect(parseAddress('Storg. 5').key).toBe(parseAddress('Storgatan 5').key);
    expect(parseAddress('Bergv. 3').key).toBe(parseAddress('Bergvägen 3').key);
    expect(parseAddress('Lillgr. 2').key).toBe(parseAddress('Lillgränd 2').key);
    expect(parseAddress('Lost. 6').key).toBe(parseAddress('Lostigen 6').key);
  });
  it('ogiltiga adresser', () => {
    expect(parseAddress('Plissé').valid).toBe(false);
    expect(parseAddress('Komplettering av Faktura Jerk-002').valid).toBe(false);
    expect(parseAddress('').valid).toBe(false);
  });
  it('postnummer tolkas aldrig som husnummer', () => {
    expect(parseAddress('Zabergsvägen 24B, 645 71 Strängnäs').number).toBe('24');
    expect(parseAddress('Storgatan, 645 71 Strängnäs').valid).toBe(false);
    expect(parseAddress('Storgatan 645 71 Strängnäs').valid).toBe(false);
    expect(parseAddress('Storgatan 64571 Strängnäs').valid).toBe(false);
  });
});

describe('verkliga adresspar matchar', () => {
  const pairs: [string, string][] = [
    ['Lostigen 6 , Enhörna', 'Lostigen 6'],
    ['Näsåvägen 33, Nykvarn', 'Näsåvägen 33 Nykvarn'],
    ['Zabergsvägen 24B ,  645 71 Strängnäs', 'Zabergsvägen 24B, Strängnäs'],
    ['Relifstigen 29 Södertälje', 'Relifstigen 29'],
    ['Förriddargränd 10, Hässelby', 'Förridargränd 10'],
    ['Smultronvägen 36, Nykvarn', 'Smutronvägen 36 Nykvarn'],
    ['Bergvägen 36, Strängnäs', 'Bergväggen 36, Strängnäs'],
    ['Rättelse - Hallongränd 19, Enebyberg', 'Hallongränd 19, Enebyberg'],
  ];
  it.each(pairs)('%s ~ %s', (a, b) => {
    const [top] = rankCases([c('x', { address: b })], { address: a });
    expect(top).toBeDefined();
    expect(['auto', 'suggest']).toContain(top.level);
  });
});

describe('scoreCase', () => {
  it('Soprangränd-fallet blir auto', () => {
    const cases = [
      c('sopran', { address: 'Soprangränd 6', city: 'Vällingby', customer_name: 'Ulf Wencke', customer_email: 'ulf@encke.se', status: 'montage_klart' }),
      c('annan', { address: 'Soprangränd 8', city: 'Vällingby', customer_name: 'Eva Ek' }),
    ];
    const ranked = rankCases(cases, { address: 'Soprangränd 6, Vällingby', name: 'Ulf Wictor Encke' });
    expect(ranked[0].case.id).toBe('sopran');
    expect(ranked[0].level).toBe('auto');
    expect(ranked[0].label).toBe('adress + ort + namn (flera ord)');
  });
  it('e-postens domän ger namntoken', () => {
    const s = scoreCase(c('a', { customer_name: 'Ulf Wencke', customer_email: 'ulf@encke.se' }), { name: 'Ulf Wictor Encke' });
    expect(s.score).toBe(30);
  });
  it('enbart samma husnummer ger 0', () => {
    expect(scoreCase(c('a', { address: 'Hedemoravägen 175, Sollentuna' }), { address: 'Hedemoravägen 19, Sollentuna' }).addressScore).toBe(0);
    expect(scoreCase(c('a', { address: 'Klövervägen 25' }), { address: 'Nällsta 25' }).score).toBe(0);
    expect(scoreCase(c('a', { address: 'Sommarstigen 14' }), { address: 'Tapetserarvägen 14' }).score).toBe(0);
  });
  it('ogiltig adress ger inga poäng', () => {
    expect(scoreCase(c('a', { address: 'Plissé' }), { address: 'Plissé' }).score).toBe(0);
  });
  it('olika ort drar av 20', () => {
    expect(scoreCase(c('a', { address: 'Storgatan 5, Uppsala' }), { address: 'Storgatan 5, Lund' }).score).toBe(50);
  });
  it('ordernummer och telefon', () => {
    const s = scoreCase(c('a', { order_number: '20524725', customer_phone: '070-123 45 67' }), { mockfjardsOrderNumber: '20524725', phone: '+46701234567' });
    expect(s.score).toBe(140);
    expect(s.reasons).toEqual(['ordernummer', 'telefon']);
  });
  it('namnvarianter', () => {
    expect(scoreCase(c('a', { customer_name: 'Anna Berg' }), { name: 'anna berg' }).score).toBe(40);
    expect(scoreCase(c('a', { customer_name: 'Berg Anna' }), { name: 'Anna Berg' }).score).toBe(35);
    expect(scoreCase(c('a', { customer_name: 'Curt Högberg' }), { name: 'Curt' }).score).toBe(30);
  });
});

describe('rankCases', () => {
  it('två ärenden på samma adress med olika namn blir aldrig auto', () => {
    const cases = [
      c('a', { address: 'Storgatan 5, Uppsala', customer_name: 'Anna Berg' }),
      c('b', { address: 'Storgatan 5, Uppsala', customer_name: 'Per Ek' }),
    ];
    const r = rankCases(cases, { address: 'Storgatan 5, Uppsala', name: 'Lisa Holm' });
    expect(r.every(x => x.level !== 'auto')).toBe(true);
    const withPhone = rankCases(cases.map(x => ({ ...x, customer_phone: '0701234567' })), { address: 'Storgatan 5, Uppsala', phone: '0701234567' });
    expect(withPhone.every(x => x.level !== 'auto')).toBe(true);
  });
  it('fakturerade ärenden får -5 men ingår', () => {
    const r = rankCases([
      c('f', { address: 'Storgatan 5', status: 'fakturerad', customer_name: 'Anna Berg' }),
      c('o', { address: 'Storgatan 5', status: 'montage_klart', customer_name: 'Anna Berg' }),
    ], { address: 'Storgatan 5', name: 'Anna Berg' });
    expect(r.map(x => x.case.id)).toEqual(['o', 'f']);
    expect(r[1].score).toBe(105);
  });
  it('utesluter svaga träffar om inte includeAll', () => {
    const cases = [c('a', { customer_name: 'Ulf Berg' })];
    expect(rankCases(cases, { name: 'Ulf Ek' })).toHaveLength(0);
    expect(rankCases(cases, { name: 'Ulf Ek' }, { includeAll: true })[0].level).toBe('none');
  });
});

describe('hjälpare', () => {
  it('sameStreetKey', () => {
    expect(sameStreetKey('Soprangränd 6, Vällingby', 'Soprangränd 6')).toBe(true);
    expect(sameStreetKey('Soprangränd 6A', 'Soprangränd 6B')).toBe(false);
    expect(sameStreetKey('Soprangränd 6', 'Soprangränd 16')).toBe(false);
    expect(findSameAddress([c('a', { address: 'Soprangränd 6' }), c('b', { address: 'Altgränd 6' })], 'Soprangränd 6, Vällingby').map(x => x.id)).toEqual(['a']);
  });
  it('streetDistance', () => {
    expect(streetDistance('Förriddargränd 10', 'Förridargränd 10')).toBe(1);
    expect(streetDistance('Bergvägen 1', 'Bergväggen 1')).toBe(1);
  });
  it('matchesSearch med ord', () => {
    const fields = ['Soprangränd 6, Vällingby', 'Ulf Wencke'];
    expect(matchesSearch(fields, 'sopran 6')).toBe(true);
    expect(matchesSearch(fields, '6 vällingby')).toBe(true);
    expect(matchesSearch(fields, 'wencke')).toBe(true);
    expect(matchesSearch(['Soprangränd 16'], 'sopran 6')).toBe(false);
  });
});
