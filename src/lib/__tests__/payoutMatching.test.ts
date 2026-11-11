import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { rankPayoutCases, rankCases } from '@/lib/caseMatching';
import { planPayoutOrderNumber } from '@/lib/payoutOrderNumber';

const c = (id: string, extra: Record<string, unknown>) => ({ id, status: 'vantar_km', order_number: null, ...extra });

describe('rankPayoutCases (Mockfjärds-utbetalningar)', () => {
  it('unikt exakt namn utan ordernummer kopplas automatiskt', () => {
    const cases = [
      c('yusuf', { customer_name: 'Yusuf Ayranci', address: 'Storgatan 5, Uppsala' }),
      c('other', { customer_name: 'Anna Berg', address: 'Lillgatan 2, Uppsala' }),
    ];
    const target = { name: 'Yusuf Ayranci', mockfjardsOrderNumber: '20521234' };
    expect(rankCases(cases, target)).toHaveLength(0);
    const [top, ...rest] = rankPayoutCases(cases, target);
    expect(top.case.id).toBe('yusuf');
    expect(top.level).toBe('auto');
    expect(top.label).toBe('namn (unikt)');
    expect(rest).toHaveLength(0);
  });

  it('delnamn "Bo Magnus Byström" mot "Magnus Byström" blir förslag', () => {
    const r = rankPayoutCases([c('mb', { customer_name: 'Magnus Byström' })], { name: 'Bo Magnus Byström', mockfjardsOrderNumber: '20520001' });
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe('suggest');
  });

  it('två ärenden "Kjell Karlsson" blir båda förslag, aldrig auto', () => {
    const r = rankPayoutCases([
      c('k1', { customer_name: 'Kjell Karlsson', address: 'Ekvägen 1' }),
      c('k2', { customer_name: 'Kjell Karlsson', address: 'Björkvägen 2' }),
    ], { name: 'Kjell Karlsson', mockfjardsOrderNumber: '20520002' });
    expect(r.map(x => x.case.id).sort()).toEqual(['k1', 'k2']);
    expect(r.every(x => x.level === 'suggest')).toBe(true);
  });

  it('felläst namn "DOVISTA Sverige AB" ger ingen träff', () => {
    const r = rankPayoutCases([
      c('a', { customer_name: 'Yusuf Ayranci' }),
      c('b', { customer_name: 'Magnus Byström' }),
      c('c', { customer_name: 'Kjell Karlsson' }),
    ], { name: 'DOVISTA Sverige AB', mockfjardsOrderNumber: '20520003' });
    expect(r).toHaveLength(0);
  });

  it('ordernummer på ett annat ärende vinner över namnträffen', () => {
    const r = rankPayoutCases([
      c('name', { customer_name: 'Yusuf Ayranci' }),
      c('order', { customer_name: 'Y. Ayranci-Holm', order_number: '20524444' }),
    ], { name: 'Yusuf Ayranci', mockfjardsOrderNumber: '20524444' });
    expect(r[0].case.id).toBe('order');
    expect(r[0].level).toBe('auto');
    expect(r.filter(x => x.level === 'auto')).toHaveLength(1);
  });
});

describe('planPayoutOrderNumber', () => {
  it('sparar Fsg.order när ärendet saknar ordernummer', () => {
    expect(planPayoutOrderNumber(null, '20521234', 'MIKH5678')).toEqual({
      orderNumber: '20521234',
      description: 'Mockfjärds ordernummer 20521234 sparat från utbetalning MIKH5678',
    });
    expect(planPayoutOrderNumber('  ', '20521234', 'MIKH5678')?.orderNumber).toBe('20521234');
  });
  it('skriver inte över ett annat ordernummer', () => {
    expect(planPayoutOrderNumber('20529999', '20521234', 'MIKH5678')).toBeNull();
  });
  it('ignorerar rader utan ordernummer', () => {
    expect(planPayoutOrderNumber(null, '—', 'MIKH5678')).toBeNull();
    expect(planPayoutOrderNumber(null, '', 'MIKH5678')).toBeNull();
  });
});
