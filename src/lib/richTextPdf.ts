import type jsPDF from 'jspdf';
import { parseRichText, type RichSegment } from './richText';

type RGB = [number, number, number];

export interface DrawRichTextOptions {
  x: number;
  y: number;            // baslinje för första raden
  maxWidth: number;
  lineHeight: number;
  fontSize: number;
  color: RGB;
  redColor: RGB;
  /** Anropas när en ny sida behövs; ska returnera nytt y (baslinje). */
  onPageBreak: () => number;
  pageBreakAt: number;  // y-värde där sidbryt ska ske innan nästa rad ritas
}

type Token = RichSegment & { width: number };

/**
 * Ritar text med **fet** och ==röd== märkning i jsPDF med radbrytning.
 * Returnerar y för nästa rad (baslinje).
 */
export function drawRichText(doc: jsPDF, text: string, opts: DrawRichTextOptions): number {
  const { x, maxWidth, lineHeight, fontSize, color, redColor, onPageBreak, pageBreakAt } = opts;
  let y = opts.y;
  doc.setFontSize(fontSize);

  const measure = (s: string, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    return doc.getTextWidth(s);
  };

  const drawLine = (tokens: Token[]) => {
    if (y > pageBreakAt) y = onPageBreak();
    let cx = x;
    for (const t of tokens) {
      doc.setFont('helvetica', t.bold ? 'bold' : 'normal');
      doc.setTextColor(...(t.red ? redColor : color));
      doc.text(t.text, cx, y);
      cx += t.width;
    }
    y += lineHeight;
  };

  for (const line of parseRichText(text)) {
    // Dela varje segment i ord och mellanrum, så att stilen följer med varje ord.
    const tokens: Token[] = [];
    for (const seg of line) {
      for (const part of seg.text.split(/(\s+)/)) {
        if (!part) continue;
        const width = measure(part, seg.bold);
        if (width <= maxWidth || /^\s+$/.test(part)) {
          tokens.push({ ...seg, text: part, width });
        } else {
          // Ett enda ord bredare än raden: dela teckenvis
          let chunk = '';
          for (const ch of part) {
            if (measure(chunk + ch, seg.bold) > maxWidth && chunk) {
              tokens.push({ ...seg, text: chunk, width: measure(chunk, seg.bold) });
              chunk = '';
            }
            chunk += ch;
          }
          if (chunk) tokens.push({ ...seg, text: chunk, width: measure(chunk, seg.bold) });
        }
      }
    }

    if (tokens.length === 0) { // tom rad
      y += lineHeight;
      continue;
    }

    let current: Token[] = [];
    let currentW = 0;
    for (const t of tokens) {
      const isSpace = /^\s+$/.test(t.text);
      if (currentW + t.width > maxWidth && current.length > 0) {
        drawLine(current);
        current = [];
        currentW = 0;
        if (isSpace) continue; // inget inledande mellanrum på ny rad
      }
      current.push(t);
      currentW += t.width;
    }
    if (current.length > 0) drawLine(current);
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...color);
  return y;
}