import { Package } from 'lucide-react';
import { SignedImage } from '@/components/shared/SignedImage';
import { cn } from '@/lib/utils';
import { swatchStyle } from '@/lib/swatchStyle';
import type { PriceItem } from '@/lib/kalkyl';

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
