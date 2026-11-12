import type { CSSProperties } from 'react';

export interface SwatchLike { color: string; line?: string; pattern?: string; step?: number }

/** Bakgrund för en ritad provbit. Färgerna kommer från prisraden, inte från appens tema. */
export function swatchStyle(item: { swatch?: SwatchLike | null; color_hex?: string | null }): CSSProperties | null {
  const s = item.swatch;
  if (s?.color) {
    const line = s.line || 'rgba(0,0,0,0.25)';
    const step = Math.max(4, Number(s.step) || 10);
    if (s.pattern === 'plank') {
      return {
        backgroundColor: s.color,
        backgroundImage: `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px ${step}px), repeating-linear-gradient(90deg, transparent 0 ${step * 3}px, ${line} ${step * 3}px ${step * 3 + 1}px)`,
      };
    }
    if (s.pattern === 'fiskben') {
      return {
        backgroundColor: s.color,
        backgroundImage: `repeating-linear-gradient(45deg, ${line} 0 1px, transparent 1px ${step / 2}px), repeating-linear-gradient(-45deg, ${line} 0 1px, transparent 1px ${step}px)`,
      };
    }
    return { backgroundColor: s.color };
  }
  if (item.color_hex) return { backgroundColor: item.color_hex };
  return null;
}
