export const DRIVE_KINDS = [
  'a_order_invoice', 'montor_invoice', 'mockfjards_payout', 'uppdrag_handpenning', 'uppdrag_slutfaktura', 'signed_offer', 'offer_confirmation',
  'sheet_metal_invoice', 'uploaded_montor_invoice', 'uploaded_a_order', 'cost_receipt', 'other_document',
] as const;
export type DriveKind = typeof DRIVE_KINDS[number];
export type Destination = 'outgoing' | 'incoming' | 'customers';
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** Statusar i drive_sync. review och out_of_range laddar aldrig upp något. */
export const DRIVE_STATUSES = ['pending', 'synced', 'skipped', 'error', 'review', 'out_of_range'] as const;

/** Hård spärr: Drive-klienten får bara läsa och skapa. Kastar på allt annat. */
export function assertAllowedDriveRequest(method: string, path: string): void {
  const m = method.toUpperCase();
  const p = path.split('?')[0];
  const ok =
    (m === 'GET' && (p === 'files' || /^files\/[^/]+$/.test(p))) ||
    (m === 'POST' && p === 'files') ||
    (m === 'POST' && p === 'upload/drive/v3/files' && /[?&]uploadType=multipart(&|$)/.test(path));
  if (!ok) throw new Error(`Drive-spärr: ${m} ${p} är inte tillåtet. Synken får bara läsa och skapa, aldrig ändra eller radera.`);
}

// ---------------------------------------------------------------------------
// Routing: vilka källor och dokumenttyper som arkiveras, och var.

/** Källor som hör till Daniel Malke AB (konsultlöner). Arkiveras aldrig i N3prenads mappar. */
export const NEVER_ARCHIVE_SOURCES = ['consultant_payouts', 'consultant_payout_lines', 'consultant_loans', 'consultants', 'consultant_previews'] as const;
export function assertArchivableSource(sourceTable: string): void {
  if ((NEVER_ARCHIVE_SOURCES as readonly string[]).includes(sourceTable)) throw new Error(`${sourceTable} får aldrig arkiveras i N3prenads Drive`);
}

export type Route =
  | { action: 'archive'; kind: DriveKind; destination: Destination }
  | { action: 'review'; kind: 'other_document'; reason: string }
  | { action: 'never'; reason: string };

const CASE_DOCUMENT_ROUTES: Record<string, { kind: DriveKind; destination: Destination }> = {
  mockfjards_payout: { kind: 'mockfjards_payout', destination: 'incoming' },
  sheet_metal_invoice: { kind: 'sheet_metal_invoice', destination: 'outgoing' },
  montor_invoice: { kind: 'uploaded_montor_invoice', destination: 'outgoing' },
  a_order: { kind: 'uploaded_a_order', destination: 'outgoing' },
};

/** Uppladdade dokument (case_documents.doc_type). Okända typer gissas aldrig – de granskas. */
export function routeCaseDocument(docType: string | null | undefined): Route {
  const known = CASE_DOCUMENT_ROUTES[String(docType ?? '')];
  if (known) return { action: 'archive', ...known };
  return { action: 'review', kind: 'other_document', reason: `Okänd dokumenttyp (${docType || 'saknas'}) – arkiveras inte automatiskt` };
}

/** Routing per källtabell (för tester och spärrar). */
export function routeSource(sourceTable: string, docType?: string | null, opts: { selfBilling?: boolean } = {}): Route {
  if ((NEVER_ARCHIVE_SOURCES as readonly string[]).includes(sourceTable)) return { action: 'never', reason: 'Daniel Malke AB arkiveras aldrig i N3prenads mappar' };
  switch (sourceTable) {
    case 'case_documents': return routeCaseDocument(docType);
    case 'case_costs': return { action: 'archive', kind: 'cost_receipt', destination: 'outgoing' };
    case 'a_orders': return { action: 'archive', kind: 'a_order_invoice', destination: 'outgoing' };
    case 'montor_debit_invoices': return { action: 'archive', kind: 'montor_invoice', destination: opts.selfBilling ? 'outgoing' : 'incoming' };
    case 'uppdrag': return { action: 'archive', kind: docType === 'handpenning' ? 'uppdrag_handpenning' : 'uppdrag_slutfaktura', destination: 'incoming' };
    case 'offers': return { action: 'archive', kind: docType === 'confirmation' ? 'offer_confirmation' : 'signed_offer', destination: 'customers' };
    default: return { action: 'never', reason: `Okänd källa ${sourceTable}` };
  }
}

// ---------------------------------------------------------------------------
// Datumkontroll: stängda räkenskapsår och orimliga datum stoppas.

const DAY = 86_400_000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const addDays = (iso: string, days: number) => new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);
export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(utc(value));
  return d.toISOString().slice(0, 10) === value;
};
/** Kalenderdatum i Stockholm för en tidsstämpel. */
export function stockholmDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export type DateCheck = { state: 'ok' } | { state: 'out_of_range'; reason: string } | { state: 'review'; reason: string };
/**
 * Dokumentdatum måste ligga inom [earliestOpen, idag + 7]. Uppladdade dokument
 * måste dessutom ligga inom [uppladdning − 150, uppladdning + 7]. Ett datum som
 * strider mot uppladdningsfönstret är misstänkt (granskas) även om det ligger i
 * ett stängt år; ett rimligt datum före earliestOpen är bara utanför intervallet.
 */
export function checkDocumentDate(input: { date: string | null | undefined; earliestOpen: string; today: string; uploadedAt?: string | null }): DateCheck {
  const date = input.date?.slice(0, 10);
  if (!date || !isIsoDate(date)) return { state: 'review', reason: 'Dokumentet saknar giltigt datum' };
  if (input.uploadedAt) {
    const uploaded = input.uploadedAt.length > 10 ? stockholmDate(input.uploadedAt) : input.uploadedAt;
    if (date < addDays(uploaded, -150)) return { state: 'review', reason: `Datumet ${date} ligger mer än 150 dagar före uppladdningen (${uploaded})` };
    if (date > addDays(uploaded, 7)) return { state: 'review', reason: `Datumet ${date} ligger mer än 7 dagar efter uppladdningen (${uploaded})` };
  }
  if (date < input.earliestOpen) return { state: 'out_of_range', reason: `Före ${input.earliestOpen} – stängt räkenskapsår` };
  if (date > addDays(input.today, 7)) return { state: 'review', reason: `Datumet ${date} ligger mer än 7 dagar fram i tiden` };
  return { state: 'ok' };
}

// ---------------------------------------------------------------------------
// Mappar

export function accountingFolders(date: string, destination: 'outgoing' | 'incoming') {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new Error('Ogiltigt dokumentdatum');
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error('Ogiltigt dokumentdatum');
  const startYear = month >= 8 ? year : year - 1;
  const fiscalMonth = String(((month + 4) % 12) + 1).padStart(2, '0');
  const monthName = MONTHS[month - 1];
  const prefix = destination === 'outgoing' ? 'Kvitton&Fakturor' : 'Intäkter SKN3';
  const yy = (v: number) => String(v % 100).padStart(2, '0');
  const yearFolder = destination === 'outgoing'
    ? `${prefix} ${yy(startYear)}0801 - ${yy(startYear + 1)}0731`
    : `${prefix} ${startYear}/${startYear + 1}`;
  return {
    startYear, fiscalMonth, monthName, yearFolder,
    monthFolder: `${prefix} ${fiscalMonth} ${monthName} ${year}`,
    monthPattern: new RegExp(`^${prefix}\\s+\\d{2}\\s+${monthName}\\s+${year}$`, 'i'),
  };
}

export const sameYearFolder = (a: string, b: string) => a.replace(/\s/g, '').toLocaleLowerCase('sv') === b.replace(/\s/g, '').toLocaleLowerCase('sv');
export const sameCustomerFolder = (a: string, b: string) => a.trim().toLocaleLowerCase('sv') === b.trim().toLocaleLowerCase('sv');

export class YearFolderMissingError extends Error {
  constructor(public folderName: string) { super(`Årsmappen ${folderName} finns inte – skapa den i Drive`); }
}
export interface FolderIO {
  listFolders(parent: string): Promise<{ id: string; name: string }[]>;
  createFolder(parent: string, name: string): Promise<{ id: string; name: string }>;
}
/**
 * Hittar månadsmappen. Årsmappen skapas ALDRIG (saknas den kastas
 * YearFolderMissingError); bara månadsmappar inne i en befintlig årsmapp skapas.
 */
export async function resolveAccountingTarget(io: FolderIO, rootId: string, destination: 'outgoing' | 'incoming', date: string) {
  const names = accountingFolders(date, destination);
  const year = (await io.listFolders(rootId)).find(f => sameYearFolder(f.name, names.yearFolder));
  if (!year) throw new YearFolderMissingError(names.yearFolder);
  const months = await io.listFolders(year.id);
  const month = months.find(f => names.monthPattern.test(f.name)) ?? await io.createFolder(year.id, names.monthFolder);
  return { id: month.id, path: `Smartklimat N3Prenad/${year.name}/${month.name}`, yearName: year.name, monthName: month.name };
}

/** Ligger en sparad mappsökväg i rätt års- och månadsmapp för datumet? */
export function inExpectedFolder(folderPath: string | null | undefined, destination: 'outgoing' | 'incoming', date: string): boolean {
  // Årsmappen för intäkter innehåller själv ett snedstreck ("Intäkter SKN3 2026/2027").
  const path = String(folderPath ?? '');
  const cut = path.lastIndexOf('/');
  if (cut < 0) return false;
  const names = accountingFolders(date, destination);
  const norm = (v: string) => v.replace(/\s/g, '').toLocaleLowerCase('sv');
  return names.monthPattern.test(path.slice(cut + 1)) && norm(path.slice(0, cut)).endsWith('/' + norm(names.yearFolder));
}

/** "…/Intäkter SKN3 03 okt 2026" -> "2026-10". */
export function monthKeyFromFolder(folderPath: string | null | undefined): string | null {
  const last = String(folderPath ?? '').split('/').pop() ?? '';
  const m = /\b(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\s+(\d{4})$/i.exec(last.trim());
  if (!m) return null;
  return `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}`;
}
/** Tolv månader för räkenskapsåret som innehåller datumet: 01 aug … 12 jul. */
export function fiscalYearMonths(date: string) {
  const { startYear } = accountingFolders(date, 'incoming');
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((7 + i) % 12) + 1, year = month >= 8 ? startYear : startYear + 1;
    return { key: `${year}-${String(month).padStart(2, '0')}`, fiscalMonth: String(i + 1).padStart(2, '0'), monthName: MONTHS[month - 1], year };
  });
}

// ---------------------------------------------------------------------------
// Dubbletter och filtyper

const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Exakt filnamn, eller dokumentnumret som eget ord (N3-01 träffar inte N3-010). */
export function existingDocument<T extends { id: string; name: string }>(files: T[], name: string, number?: string | null): T | undefined {
  const nr = number?.trim();
  const pattern = nr ? new RegExp(`(^|[^0-9a-z])${escapeRegex(nr)}($|[^0-9])`, 'i') : null;
  return files.find(f => f.name === name) ?? (pattern ? files.find(f => pattern.test(f.name)) : undefined);
}

export function mimeTypeFor(path: string | null | undefined): string {
  const ext = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(String(path ?? ''))?.[1]?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'application/pdf';
}

export function eligibleSync(row?: { status: string; attempts: number } | null): boolean {
  return !row || (row.status !== 'synced' && row.status !== 'skipped' && row.status !== 'review' && row.status !== 'out_of_range' && row.attempts < 5);
}
