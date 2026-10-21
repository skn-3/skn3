export const DRIVE_KINDS = ['a_order_invoice', 'montor_invoice', 'mockfjards_payout', 'uppdrag_handpenning', 'uppdrag_slutfaktura', 'signed_offer', 'offer_confirmation'] as const;
export type DriveKind = typeof DRIVE_KINDS[number];
export type Destination = 'outgoing' | 'incoming' | 'customers';
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Hård spärr: Drive-klienten får bara läsa och skapa. Kastar på allt annat. */
export function assertAllowedDriveRequest(method: string, path: string): void {
  const m = method.toUpperCase();
  const p = path.split('?')[0];
  const ok =
    (m === 'GET' && (p === 'files' || /^files\/[^/]+$/.test(p))) ||
    (m === 'POST' && p === 'files');
  if (!ok) throw new Error(`Drive-spärr: ${m} ${p} är inte tillåtet. Synken får bara läsa och skapa, aldrig ändra eller radera.`);
}

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
export function existingDocument<T extends { id: string; name: string }>(files: T[], name: string, number?: string | null): T | undefined {
  return files.find(f => f.name === name || (Boolean(number?.trim()) && f.name.includes(String(number).trim())));
}
export function eligibleSync(row?: { status: string; attempts: number } | null): boolean {
  return !row || (row.status !== 'synced' && row.status !== 'skipped' && row.attempts < 5);
}