// Läser PDF:ens textlager med positioner (Deno). Ingen AI, ingen gissning.
import { getDocumentProxy } from 'npm:unpdf@1.4.0';
import type { PdfTextItem } from './mockfjardsInvoice.ts';

export async function pdfTextItems(bytes: Uint8Array, maxPages = 10): Promise<PdfTextItem[]> {
  const pdf = await getDocumentProxy(bytes);
  const items: PdfTextItem[] = [];
  const pages = Math.min(pdf.numPages, maxPages);
  for (let page = 1; page <= pages; page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    for (const raw of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (typeof raw.str !== 'string' || !raw.transform) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width, page });
    }
  }
  return items;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
