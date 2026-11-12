import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { indexPrices, kalkylFromRow, sendCheck, DEFAULT_KALKYL_SETTINGS, type SendCheck } from '@/lib/kalkyl';
import { fetchKalkylSettings, fetchPriceItems, KALKYL_SETTINGS_KEY, PRICE_ITEMS_KEY } from '@/components/offers/priceList/api';

type OfferLike = Record<string, unknown> | object | null | undefined;
const calcOf = (offer: OfferLike) => (offer as { calc_data?: unknown } | null | undefined)?.calc_data;
export const hasKalkyl = (offer: OfferLike) => { const c = calcOf(offer); return c != null && typeof c === 'object'; };

const today = () => new Date().toISOString().slice(0, 10);

/** Skicka-spärr mot aktuell prislista (hämtas färskt). Offerter utan kalkyl påverkas inte. */
export async function checkKalkylSend(qc: QueryClient, offer: OfferLike): Promise<SendCheck> {
  if (!hasKalkyl(offer)) return { can_send: true, blocking: [], messages: [] };
  const [items, settings] = await Promise.all([
    qc.fetchQuery({ queryKey: PRICE_ITEMS_KEY, queryFn: fetchPriceItems, staleTime: 0 }),
    qc.fetchQuery({ queryKey: KALKYL_SETTINGS_KEY, queryFn: fetchKalkylSettings, staleTime: 0 }),
  ]);
  return sendCheck(kalkylFromRow(offer as Record<string, unknown>), indexPrices(items), settings, today());
}

/** Samma kontroll som hook, för att visa varningen i formuläret. */
export function useKalkylSendCheck(offer: OfferLike): SendCheck | null {
  const enabled = hasKalkyl(offer);
  const prices = useQuery({ queryKey: PRICE_ITEMS_KEY, queryFn: fetchPriceItems, enabled });
  const settings = useQuery({ queryKey: KALKYL_SETTINGS_KEY, queryFn: fetchKalkylSettings, enabled });
  if (!enabled || !prices.data) return null;
  return sendCheck(kalkylFromRow(offer as Record<string, unknown>), indexPrices(prices.data), settings.data ?? DEFAULT_KALKYL_SETTINGS, today());
}

export const sendBlockedText = (c: SendCheck) =>
  `Offerten kan inte skickas: ${c.messages.join('. ')}. Godkänn priserna i Prislista eller ändra kalkylen.`;
