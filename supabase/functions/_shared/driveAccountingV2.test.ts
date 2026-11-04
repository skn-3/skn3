import { describe, expect, it } from 'vitest';
import {
  routeSource, routeCaseDocument, checkDocumentDate, existingDocument, resolveAccountingTarget, YearFolderMissingError,
  inExpectedFolder, monthKeyFromFolder, fiscalYearMonths, mimeTypeFor, eligibleSync, assertArchivableSource, type FolderIO,
} from './driveFolders';
import { receiptArchiveName, sheetMetalArchiveName, isLogicalUploadName } from './pdfNames';
import { holdFor, storagePathOf, type Candidate } from '../drive-sync/candidates';

describe('routing per dokumenttyp', () => {
  it.each([
    ['case_documents', 'mockfjards_payout', 'archive', 'incoming'],
    ['case_documents', 'sheet_metal_invoice', 'archive', 'outgoing'],
    ['case_documents', 'montor_invoice', 'archive', 'outgoing'],
    ['case_documents', 'a_order', 'archive', 'outgoing'],
    ['case_costs', null, 'archive', 'outgoing'],
    ['a_orders', null, 'archive', 'outgoing'],
    ['uppdrag', 'slutfaktura', 'archive', 'incoming'],
    ['offers', 'signed', 'archive', 'customers'],
  ])('%s/%s -> %s %s', (table, docType, action, destination) => {
    const route = routeSource(table, docType);
    expect(route.action).toBe(action);
    if (route.action === 'archive') expect(route.destination).toBe(destination);
  });
  it('montörsfakturor: självfaktura är utgift, debitering är intäkt', () => {
    expect(routeSource('montor_debit_invoices', null, { selfBilling: true })).toMatchObject({ destination: 'outgoing' });
    expect(routeSource('montor_debit_invoices', null, { selfBilling: false })).toMatchObject({ destination: 'incoming' });
  });
  it('okända uppladdade typer granskas i stället för att arkiveras', () => {
    expect(routeCaseDocument('kontrakt_skannat').action).toBe('review');
    expect(routeCaseDocument(null).action).toBe('review');
  });
  it.each(['consultant_payouts', 'consultant_payout_lines', 'consultant_loans', 'consultants'])('%s arkiveras aldrig', table => {
    expect(routeSource(table).action).toBe('never');
    expect(() => assertArchivableSource(table)).toThrow();
  });
});

describe('datumkontroll', () => {
  const base = { earliestOpen: '2026-08-01', today: '2026-11-04' };
  it('godkänner datum inom öppet år och uppladdningsfönster', () => {
    expect(checkDocumentDate({ ...base, date: '2026-10-16', uploadedAt: '2026-11-02T10:00:00Z' })).toEqual({ state: 'ok' });
  });
  it('fel år från AI-tolkningen (2024) blir granskning, inte stängt år', () => {
    expect(checkDocumentDate({ ...base, date: '2024-10-16', uploadedAt: '2026-11-02T10:00:00Z' }).state).toBe('review');
  });
  it('rimligt datum före earliest_open_date blir out_of_range', () => {
    expect(checkDocumentDate({ ...base, date: '2026-07-20', uploadedAt: '2026-07-25T10:00:00Z' }).state).toBe('out_of_range');
    expect(checkDocumentDate({ ...base, date: '2026-07-31' }).state).toBe('out_of_range');
  });
  it('mer än 7 dagar fram i tiden granskas', () => {
    expect(checkDocumentDate({ ...base, date: '2026-11-11' }).state).toBe('ok');
    expect(checkDocumentDate({ ...base, date: '2026-11-12' }).state).toBe('review');
  });
  it('uppladdningsfönster: 150 dagar bakåt, 7 dagar framåt', () => {
    expect(checkDocumentDate({ ...base, today: '2027-02-01', date: '2026-08-05', uploadedAt: '2027-01-01T12:00:00Z' }).state).toBe('ok');
    expect(checkDocumentDate({ ...base, today: '2027-02-01', date: '2026-08-03', uploadedAt: '2027-01-01T12:00:00Z' }).state).toBe('review');
    expect(checkDocumentDate({ ...base, date: '2026-10-10', uploadedAt: '2026-10-02T12:00:00Z' }).state).toBe('review');
  });
  it('saknat datum granskas', () => {
    expect(checkDocumentDate({ ...base, date: null }).state).toBe('review');
  });
});

describe('granskning per kandidat', () => {
  const cand = (p: Partial<Candidate>): Candidate => ({ source_table: 'case_documents', source_id: 'x', doc_kind: 'mockfjards_payout', bucket: 'case-documents', storage_path: 'p.pdf', file_name: 'f.pdf', number: 'MIKH0334', date: '2024-10-16', destination: 'incoming', uploaded_at: '2026-10-20T08:00:00Z', ...p });
  const settings = { earliest_open_date: '2026-08-01' };
  it('fel år hålls för granskning', () => expect(holdFor(cand({}), settings, '2026-11-04')?.status).toBe('review'));
  it('rättat datum släpps', () => expect(holdFor(cand({ date: '2026-10-16' }), settings, '2026-11-04')).toBeNull());
  it('flaggad vid uppladdning hålls tills "Arkivera ändå"', () => {
    const c = cand({ date: '2026-10-16', hold_code: 'flagged', hold_reason: 'Total stämmer inte' });
    expect(holdFor(c, settings, '2026-11-04')?.code).toBe('flagged');
    expect(holdFor(c, settings, '2026-11-04', true)).toBeNull();
  });
  it('okänd typ kan aldrig tvingas igenom', () => {
    expect(holdFor(cand({ destination: null, hold_code: 'unknown_type' }), settings, '2026-11-04', true)?.code).toBe('unknown_type');
  });
});

describe('mappar', () => {
  const io = (folders: Record<string, { id: string; name: string }[]>) => {
    const created: { parent: string; name: string }[] = [];
    const api: FolderIO = {
      listFolders: async parent => folders[parent] ?? [],
      createFolder: async (parent, name) => { created.push({ parent, name }); return { id: `new-${name}`, name }; },
    };
    return { api, created };
  };
  it('target() skapar aldrig en årsmapp', async () => {
    const { api, created } = io({ root: [{ id: 'y25', name: 'Intäkter SKN3 2025/2026' }] });
    await expect(resolveAccountingTarget(api, 'root', 'incoming', '2026-10-16')).rejects.toBeInstanceOf(YearFolderMissingError);
    await expect(resolveAccountingTarget(api, 'root', 'incoming', '2026-10-16')).rejects.toThrow('Årsmappen Intäkter SKN3 2026/2027 finns inte – skapa den i Drive');
    expect(created).toEqual([]);
  });
  it('skapar bara månadsmapp inne i befintlig årsmapp', async () => {
    const { api, created } = io({ root: [{ id: 'y26', name: 'Intäkter SKN3 2026/2027' }], y26: [] });
    const t = await resolveAccountingTarget(api, 'root', 'incoming', '2026-10-16');
    expect(created).toEqual([{ parent: 'y26', name: 'Intäkter SKN3 03 okt 2026' }]);
    expect(t.path).toBe('Smartklimat N3Prenad/Intäkter SKN3 2026/2027/Intäkter SKN3 03 okt 2026');
  });
  it('återanvänder manuell månadsmapp med annan skrivning', async () => {
    const { api, created } = io({ root: [{ id: 'k', name: 'Kvitton&Fakturor 260801-270731' }], k: [{ id: 'm', name: 'Kvitton&Fakturor 02 Sep 2026' }] });
    const t = await resolveAccountingTarget(api, 'root', 'outgoing', '2026-09-10');
    expect(t.id).toBe('m');
    expect(created).toEqual([]);
  });
  it('känner igen felplacerade filer', () => {
    expect(inExpectedFolder('Smartklimat N3Prenad/Intäkter SKN3 2024/2025/Intäkter SKN3 03 okt 2024', 'incoming', '2026-10-16')).toBe(false);
    expect(inExpectedFolder('Smartklimat N3Prenad/Intäkter SKN3 2026/2027/Intäkter SKN3 03 okt 2026', 'incoming', '2026-10-16')).toBe(true);
  });
  it('månadsöversikt för räkenskapsåret', () => {
    const months = fiscalYearMonths('2026-11-04');
    expect(months[0]).toMatchObject({ key: '2026-08', fiscalMonth: '01', monthName: 'aug' });
    expect(months[11]).toMatchObject({ key: '2027-07', fiscalMonth: '12', monthName: 'jul' });
    expect(monthKeyFromFolder('x/Intäkter SKN3 03 okt 2026')).toBe('2026-10');
  });
});

describe('dubblettkontroll med ordgräns', () => {
  it('N3-01 träffar inte N3-010', () => {
    expect(existingDocument([{ id: '1', name: 'Faktura-N3-010-Kund.pdf' }], 'ny.pdf', 'N3-01')).toBeUndefined();
    expect(existingDocument([{ id: '1', name: 'Faktura-N3-01-Kund.pdf' }], 'ny.pdf', 'N3-01')?.id).toBe('1');
  });
  it('GVMO-45 träffar inte GVMO-450, oavsett versaler', () => {
    expect(existingDocument([{ id: '1', name: 'Sjalvfaktura-GVMO-450.pdf' }], 'ny.pdf', 'GVMO-45')).toBeUndefined();
    expect(existingDocument([{ id: '1', name: 'sjalvfaktura-gvmo-45.pdf' }], 'ny.pdf', 'GVMO-45')?.id).toBe('1');
  });
  it('exakt filnamn träffar alltid', () => {
    expect(existingDocument([{ id: '1', name: 'Kvitto-2026-10-12-Gatan-1-100kr.jpg' }], 'Kvitto-2026-10-12-Gatan-1-100kr.jpg', null)?.id).toBe('1');
  });
  it('granskade och utanför-intervall-rader körs inte automatiskt', () => {
    expect(eligibleSync({ status: 'review', attempts: 0 })).toBe(false);
    expect(eligibleSync({ status: 'out_of_range', attempts: 0 })).toBe(false);
  });
});

describe('filnamn och filtyper', () => {
  it('kvitton och bilagor till A-order', () => {
    expect(receiptArchiveName({ date: '2026-10-12', address: 'Bergsvägen 48', amount: 1250, storage_path: 'a/b/kvitto.JPEG' })).toBe('Kvitto-2026-10-12-Bergsvagen-48-1250kr.jpg');
    expect(receiptArchiveName({ date: '2026-10-12', address: 'Bergsvägen 48', amount: 99.5, storage_path: 'x.png', a_order_number: 1234 })).toBe('Bilaga-1234-Kvitto-2026-10-12-Bergsvagen-48-99-50kr.png');
  });
  it('plåtfaktura behåller logiskt namn, annars byggs ett', () => {
    expect(isLogicalUploadName('Byggplatar_faktura_55123.pdf', '55123')).toBe(true);
    expect(sheetMetalArchiveName({ file_name: 'scan001.pdf', invoice_number: '55123', supplier: 'Byggplåtar i Sverige', date: '2026-10-01' })).toBe('Platfaktura-55123-Byggplatar-i-Sverige-2026-10-01.pdf');
  });
  it('rätt Content-Type för bilder och PDF', () => {
    expect(mimeTypeFor('a.jpg')).toBe('image/jpeg');
    expect(mimeTypeFor('a.PNG')).toBe('image/png');
    expect(mimeTypeFor('a.pdf')).toBe('application/pdf');
  });
  it('lagringssökväg ur äldre publik URL', () => {
    expect(storagePathOf('https://x.supabase.co/storage/v1/object/public/case-images/c1/kvitto_1.jpg', 'case-images')).toBe('c1/kvitto_1.jpg');
    expect(storagePathOf('c1/kvitto_1.jpg', 'case-images')).toBe('c1/kvitto_1.jpg');
  });
});
