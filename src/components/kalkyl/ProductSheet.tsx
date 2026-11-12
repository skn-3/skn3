// Byt produkt i en valgrupp (underlag, sockel, tröskel, väggfärg, takfärg, snickerifärg).
// Komponenten visar bara prislistans produkter; vilken kod som gäller avgör resolveSlotCode.
import { Check, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { displayAmount, hasProductChoice, slotProducts, SLOT_LABEL, type PriceItem, type PriceLevel, type SelectableSlot } from '@/lib/kalkyl';
import { PriceSwatch } from '@/components/offers/priceList/PriceSwatch';
import { useKalkylUi } from './context';
import { SmallSheet } from './LineSheets';
import { focusRing, motion } from './ui';
import { kr2 } from './format';

export const LEVEL_LABEL: Record<PriceLevel, string> = { bas: 'Bas', standard: 'Standard', premium: 'Premium' };

/** Pris per enhet i vald visning, "Pris saknas" när priset saknas. */
export function useUnitPriceText() {
  const { opts, display } = useKalkylUi();
  return (i: Pick<PriceItem, 'price_ex_vat' | 'unit'>) =>
    i.price_ex_vat == null ? 'Pris saknas' : `${kr2(displayAmount(Number(i.price_ex_vat), opts.vat_mode === 'omvand' ? 'exkl' : display))}/${i.unit}`;
}

/** Knappen "Byt" visas bara när valgruppen har minst två valbara produkter. */
export function SwapButton({ slot, label, onClick }: { slot: SelectableSlot; label: string; onClick: () => void }) {
  const { items, readOnly } = useKalkylUi();
  if (readOnly || !hasProductChoice(slot, items)) return null;
  return (
    <button type="button" onClick={onClick} aria-label={`Byt ${label.toLocaleLowerCase('sv-SE')}`}
      className={cn('min-h-[44px] shrink-0 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing)}>
      Byt
    </button>
  );
}

export function SlotProductSheet({ slot, current, onOpenChange, onPick, onGallery }: {
  slot: SelectableSlot | null; current: string | null; onOpenChange: (open: boolean) => void;
  onPick: (slot: SelectableSlot, code: string) => void; onGallery?: (slot: SelectableSlot) => void;
}) {
  const { items, readOnly } = useKalkylUi();
  const priceText = useUnitPriceText();
  const products = slot ? slotProducts(slot, items) : [];
  const title = slot ? `Välj ${SLOT_LABEL[slot].toLocaleLowerCase('sv-SE')}` : '';
  return (
    <SmallSheet open={!!slot} onOpenChange={onOpenChange} title={title} description="Priset kommer från prislistan och visas per enhet.">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {products.map(p => {
          const active = p.code === current;
          return (
            <li key={p.code} className="flex items-center gap-3 p-2.5">
              <PriceSwatch item={p} className="h-14 w-14" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold">{p.name}</span>
                  {p.level && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{LEVEL_LABEL[p.level]}</span>}
                </div>
                {p.spec && <div className="text-xs text-muted-foreground">{p.spec}</div>}
                {p.color_code && <div className="font-mono text-[11px] text-muted-foreground">{p.color_code}</div>}
                <div className={cn('mt-0.5 font-mono text-xs tabular-nums', p.price_ex_vat == null && 'text-destructive')}>{priceText(p)}</div>
              </div>
              {active ? (
                <span className="inline-flex min-h-[44px] items-center gap-1.5 px-2 text-sm font-semibold text-primary"><Check className="h-4 w-4" aria-hidden="true" /> Vald</span>
              ) : (
                <button type="button" disabled={readOnly} onClick={() => { if (slot) onPick(slot, p.code); onOpenChange(false); }}
                  aria-label={`Välj ${p.name}`}
                  className={cn('min-h-[44px] shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50', motion, focusRing)}>
                  Välj
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {slot && onGallery && (
        <button type="button" onClick={() => { onOpenChange(false); onGallery(slot); }}
          className={cn('min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold active:bg-muted', motion, focusRing)}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Visa i galleriet
        </button>
      )}
    </SmallSheet>
  );
}
