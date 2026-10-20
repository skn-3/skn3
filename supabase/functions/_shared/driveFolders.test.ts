import { describe, expect, it } from 'vitest';
import { accountingFolders, sameYearFolder, sameCustomerFolder, existingDocument, eligibleSync } from './driveFolders';

describe('Drive accounting rules', () => {
  it('uses August 1 as start of fiscal year', () => {
    expect(accountingFolders('2026-07-31', 'outgoing').yearFolder).toBe('Kvitton&Fakturor 250801 - 260731');
    expect(accountingFolders('2026-08-01', 'outgoing').yearFolder).toBe('Kvitton&Fakturor 260801 - 270731');
    expect(accountingFolders('2026-08-01', 'incoming').yearFolder).toBe('Intäkter SKN3 2026/2027');
  });
  it.each([
    ['01','06','jan'], ['02','07','feb'], ['03','08','mar'], ['04','09','apr'],
    ['05','10','maj'], ['06','11','jun'], ['07','12','jul'], ['08','01','aug'],
    ['09','02','sep'], ['10','03','okt'], ['11','04','nov'], ['12','05','dec'],
  ])('maps calendar month %s to fiscal month %s and %s', (month, number, name) => {
    expect(accountingFolders(`2026-${month}-01`, 'incoming').monthFolder).toBe(`Intäkter SKN3 ${number} ${name} 2026`);
  });
  it('reuses old annual names ignoring case and spaces', () => {
    expect(sameYearFolder('Kvitton&Fakturor 250801-260731', 'kvitton&fakturor 250801 - 260731')).toBe(true);
    expect(sameYearFolder('Kvitton&Fakturor 250801-260731', 'Kvitton&Fakturor 260801 - 270731')).toBe(false);
  });
  it('reuses month folders even when their fiscal number is wrong', () => {
    const incoming = accountingFolders('2025-09-01', 'incoming');
    expect(incoming.monthPattern.test('Intäkter SKN3 01 sep 2025')).toBe(true);
    expect(incoming.monthPattern.test('Intäkter SKN3 01 sep 2026')).toBe(false);
    expect(accountingFolders('2026-09-01', 'outgoing').monthPattern.test('Kvitton&Fakturor 02 Sep 2026')).toBe(true);
  });
  it('preserves customer address characters and ignores case when matching', () => {
    expect(sameCustomerFolder(' Åvägen 3 ', 'åvägen 3')).toBe(true);
    expect(sameCustomerFolder('Åvägen 3', 'Avagen 3')).toBe(false);
  });
  it('skips exact names or an existing document number', () => {
    const files = [{ id: 'existing', name: 'manuellt-TOMEK-003.pdf' }];
    expect(existingDocument(files, 'nytt.pdf', 'TOMEK-003')?.id).toBe('existing');
    expect(existingDocument(files, 'manuellt-TOMEK-003.pdf')?.id).toBe('existing');
    expect(existingDocument(files, 'nytt.pdf', '')).toBeUndefined();
  });
  it('never retries synced/skipped documents and caps automatic attempts at five', () => {
    expect(eligibleSync({ status: 'synced', attempts: 0 })).toBe(false);
    expect(eligibleSync({ status: 'skipped', attempts: 1 })).toBe(false);
    expect(eligibleSync({ status: 'error', attempts: 4 })).toBe(true);
    expect(eligibleSync({ status: 'error', attempts: 5 })).toBe(false);
  });
  it('rejects invalid dates', () => expect(() => accountingFolders('2026-02-31', 'incoming')).toThrow());
});