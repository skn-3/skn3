import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertAllowedSheetsRequest } from './sheetsGuard';

// Skyddar Drive och Sheets mot framtida ändringar: konsultlönesystemet får
// endast läsa, skapa nya filer och lägga till loggrader — aldrig ändra eller radera.
const root = resolve(process.cwd(), 'supabase/functions');
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$|_test\.ts$/.test(entry.name) ? [path] : [];
  });
}
const files = [
  resolve(root, '_shared/googleDriveRead.ts'),
  resolve(root, '_shared/googleSheets.ts'),
  ...sourceFiles(resolve(root, 'consultant-drive')),
  ...sourceFiles(resolve(root, 'consultant-payout')),
];
const forbidden = [
  "'DELETE'", '"DELETE"', "'PATCH'", '"PATCH"', "'PUT'", '"PUT"',
  'batchUpdate', ':clear', 'trashed: true', 'trashed:true',
  'removeParents', 'addParents', 'permissions', 'emptyTrash',
];

describe('Consultant Drive/Sheets safety guard', () => {
  it('scans production consultant source files', () => {
    expect(files.length).toBeGreaterThan(2);
  });
  it.each(files)('contains no forbidden operation in %s', path => {
    const source = readFileSync(path, 'utf8');
    for (const operation of forbidden) {
      expect(source, `Forbidden operation ${operation} in ${path}`).not.toContain(operation);
    }
  });
});

describe('assertAllowedSheetsRequest', () => {
  it.each([
    ['GET', 'spreadsheets/abc123'],
    ['GET', 'spreadsheets/abc123/values/A1:A1'],
    ['POST', 'spreadsheets/abc123/values/A%3AZ:append'],
  ])('allows %s %s', (method, path) => {
    expect(() => assertAllowedSheetsRequest(method, path)).not.toThrow();
  });
  it.each([
    ['POST', 'spreadsheets/abc123/values/A1:A1'],
    ['POST', 'spreadsheets/abc123/values/A1:A1:clear'],
    ['POST', 'spreadsheets/abc123:batchUpdate'],
    ['POST', 'files'],
    ['GET', 'spreadsheets/abc123/values/A1:A1:clear'],
  ])('blocks %s %s', (method, path) => {
    expect(() => assertAllowedSheetsRequest(method, path)).toThrow(/Sheets-spärr/);
  });
});
