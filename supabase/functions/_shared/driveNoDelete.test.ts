import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Skyddar Driven mot framtida ändringar: synken får endast läsa och skapa.
const root = resolve(process.cwd(), 'supabase/functions');
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !/\.(test|spec)\.ts$|_test\.ts$/.test(entry.name) ? [path] : [];
  });
}
const files = [
  ...sourceFiles(resolve(root, 'drive-sync')),
  ...sourceFiles(resolve(root, '_shared')).filter(path => /[\\/]drive[^\\/]*\.ts$/.test(path)),
];
const forbidden = [
  "'DELETE'", '"DELETE"', "'PATCH'", '"PATCH"', "'PUT'", '"PUT"',
  'trashed: true', 'trashed:true', 'removeParents', 'addParents', 'permissions', 'emptyTrash',
];

describe('Drive source safety guard', () => {
  it('scans production Drive source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files)('contains no forbidden operation in %s', path => {
    const source = readFileSync(path, 'utf8');
    for (const operation of forbidden) {
      expect(source, `Forbidden Drive operation ${operation} in ${path}`).not.toContain(operation);
    }
  });
});