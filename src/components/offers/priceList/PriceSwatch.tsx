import type { CSSProperties } from 'react';
import { Package } from 'lucide-react';
import { SignedImage } from '@/components/shared/SignedImage';
import { cn } from '@/lib/utils';
import type { PriceItem } from '@/lib/kalkyl';

/** Bakgrund för en ritad provbit. Färgerna kommer från prisraden, inte från appens tema. */
function swatchStyle(item: Pick<PriceItem, 'swatch' | 'color_hex'>): CSSProperties | null {
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

export function PriceSwatch({ item, className }: { item: Pick<PriceItem, 'swatch' | 'color_hex' | 'image_path' | 'name'>; className?: string }) {
  const base = cn('shrink-0 rounded-md border border-border overflow-hidden', className ?? 'h-12 w-12');
  if (item.image_path) {
    return <SignedImage value={item.image_path} bucket="catalog-images" alt={item.name} className={cn(base, 'object-cover')} />;
  }
  const style = swatchStyle(item);
  if (style) return <div className={base} style={style} aria-hidden="true" />;
  return (
    <div className={cn(base, 'flex items-center justify-center bg-muted text-muted-foreground')} aria-hidden="true">
      <Package className="h-4 w-4" />
    </div>
  );
}
