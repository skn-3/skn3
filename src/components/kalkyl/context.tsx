import { createContext, useContext } from 'react';
import type { KalkylOfferOptions, KalkylSettings, PriceDisplay, PriceIndex, PriceItem } from '@/lib/kalkyl';

export interface KalkylUi {
  customerMode: boolean;
  readOnly: boolean;
  display: PriceDisplay;
  prices: PriceIndex;
  items: PriceItem[];
  settings: KalkylSettings;
  opts: KalkylOfferOptions;
  today: string;
}

const Ctx = createContext<KalkylUi | null>(null);
export const KalkylUiProvider = Ctx.Provider;
export function useKalkylUi(): KalkylUi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useKalkylUi utanför KalkylWorkspace');
  return v;
}
