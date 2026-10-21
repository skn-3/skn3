/** Hård spärr: Sheets-klienten får bara läsa och lägga till rader. Kastar på allt annat. */
export function assertAllowedSheetsRequest(method: string, path: string): void {
  const m = method.toUpperCase();
  const p = path.split('?')[0];
  const ok =
    (m === 'GET' && /^spreadsheets\/[^/]+$/.test(p)) ||
    (m === 'GET' && /^spreadsheets\/[^/]+\/values\/[^/]+$/.test(p) && !/:(clear|append|copyTo|batchUpdate)$/i.test(p)) ||
    (m === 'POST' && /^spreadsheets\/[^/]+\/values\/[^/]+:append$/.test(p));
  if (!ok) throw new Error(`Sheets-spärr: ${m} ${p} är inte tillåtet. Loggen får bara läsas och få nya rader, aldrig ändras eller rensas.`);
}
