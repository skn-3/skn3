import { googleToken } from './googleAuth.ts';

/** Hård spärr: Sheets-klienten får bara läsa och lägga till rader. Kastar på allt annat. */
export function assertAllowedSheetsRequest(method: string, path: string): void {
  const m = method.toUpperCase();
  const p = path.split('?')[0];
  const ok =
    (m === 'GET' && /^spreadsheets\/[^/]+$/.test(p)) ||
    (m === 'GET' && /^spreadsheets\/[^/]+\/values\/[^/]+$/.test(p)) ||
    (m === 'POST' && /^spreadsheets\/[^/]+\/values\/[^/]+:append$/.test(p));
  if (!ok) throw new Error(`Sheets-spärr: ${m} ${p} är inte tillåtet. Loggen får bara läsas och få nya rader, aldrig ändras eller rensas.`);
}

export const LOG_HEADER = ['Datum', 'Händelse', 'Konsult', 'Utbetalningsmånad', 'Period', 'TB', 'Procent', 'Provision', 'Bilavdrag', 'Kvittoavdrag', 'Kvitton (lista)', 'Amortering', 'Förskott', 'Netto ex moms', 'Moms', 'Totalt', 'Fakturanr', 'Fakturadatum', 'Lånesaldo efter', 'Faktura (Drive)', 'Underlag (Drive)', 'Status', 'Av', 'Anteckning'];

export class SheetsClient {
  private async request(path: string, init: RequestInit = {}) {
    assertAllowedSheetsRequest(init.method || 'GET', path);
    const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await googleToken('https://www.googleapis.com/auth/spreadsheets')}`, ...init.headers },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || response.status === 403) throw new Error(`Arket är inte delat med servicekontot, eller Google nekar åtkomst [${response.status}]: ${body}`);
      throw new Error(`Google Sheets [${response.status}]: ${body}`);
    }
    return response.json();
  }

  async readRange(sheetId: string, range: string): Promise<string[][]> {
    const data = await this.request(`spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`);
    return data.values ?? [];
  }

  /** Lägger rubrikraden om arket är tomt (första användningen). */
  async ensureHeader(sheetId: string): Promise<void> {
    const values = await this.readRange(sheetId, 'A1:A1');
    if (!values.length || !values[0]?.length) {
      await this.appendRows(sheetId, 'A:Z', [LOG_HEADER]);
    }
  }

  async appendRows(sheetId: string, range: string, rows: (string | number | null)[][]) {
    return this.request(`spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    });
  }
}
