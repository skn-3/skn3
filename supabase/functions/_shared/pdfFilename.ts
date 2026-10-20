/** Client names are optional; legacy callers retain their existing attachment names. */
export function attachmentPdfName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const safe = value.replace(/[^A-Za-z0-9._-]/g, '');
  if (!/\.pdf$/i.test(safe) || safe.length <= 4) return fallback;
  return safe.length > 120 ? safe.slice(0, 116) + '.pdf' : safe;
}