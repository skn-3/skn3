import { describe, expect, it } from 'vitest';
import { attachmentPdfName } from '../../../supabase/functions/_shared/pdfFilename';

describe('attachmentPdfName', () => {
  it('removes characters outside the allowed filename set', () => {
    expect(attachmentPdfName('Faktura å/\\ 12.pdf', 'fallback.pdf')).toBe('Faktura12.pdf');
  });
  it('limits names to 120 characters while retaining the PDF extension', () => {
    expect(attachmentPdfName('x'.repeat(200) + '.pdf', 'fallback.pdf')).toBe('x'.repeat(116) + '.pdf');
  });
  it('retains the legacy name for missing or non-PDF filenames', () => {
    expect(attachmentPdfName(null, 'legacy.pdf')).toBe('legacy.pdf');
    expect(attachmentPdfName('invoice.exe', 'legacy.pdf')).toBe('legacy.pdf');
  });
});