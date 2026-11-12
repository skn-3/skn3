import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { indexPrices, kalkylFromRow, sendCheck, DEFAULT_KALKYL_SETTINGS, type SendCheck } from '@/lib/kalkyl';
import { fetchKalkylSettings, fetchPriceItems, KALKYL_SETTINGS_KEY, PRICE_ITEMS_KEY } from '@/components/offers/priceList/api';

type OfferLike = Record<string, unknown> | object | null | undefined;
const calcOf = (offer: OfferLike) => (offer as { calc_data?: unknown } | null | undefined)?.calc_data;
export const hasKalkyl = (offer: OfferLike) => { const c = calcOf(offer); return c != null && typeof c === 'object'; };

const today = () => new Date().toISOString().slice(0, 10);
const statusOf = (offer: OfferLike) => ((offer as { status?: string | null } | null | undefined)?.status ?? null);

/** Skicka-spärr mot aktuell prislista (hämtas färskt). Offerter utan kalkyl påverkas inte. */
export async function checkKalkylSend(qc: QueryClient, offer: OfferLike): Promise<SendCheck> {
  if (!hasKalkyl(offer)) return { can_send: true, blocking: [], messages: [] };
  const [items, settings] = await Promise.all([
    qc.fetchQuery({ queryKey: PRICE_ITEMS_KEY, queryFn: fetchPriceItems, staleTime: 0 }),
    qc.fetchQuery({ queryKey: KALKYL_SETTINGS_KEY, queryFn: fetchKalkylSettings, staleTime: 0 }),
  ]);
  return sendCheck(kalkylFromRow(offer as Record<string, unknown>), indexPrices(items), settings, today(), { status: statusOf(offer) });
}

/** Samma kontroll som hook, för att visa varningen i formuläret. */
export function useKalkylSendCheck(offer: OfferLike): SendCheck | null {
  const enabled = hasKalkyl(offer);
  const prices = useQuery({ queryKey: PRICE_ITEMS_KEY, queryFn: fetchPriceItems, enabled });
  const settings = useQuery({ queryKey: KALKYL_SETTINGS_KEY, queryFn: fetchKalkylSettings, enabled });
  if (!enabled || !prices.data) return null;
  return sendCheck(kalkylFromRow(offer as Record<string, unknown>), indexPrices(prices.data), settings.data ?? DEFAULT_KALKYL_SETTINGS, today(), { status: statusOf(offer) });
}

export const sendBlockedText = (c: SendCheck) =>
  `Offerten kan inte skickas: ${c.messages.join('. ')}. Uppdatera priserna i kalkylen, låt en administratör godkänna dem i Prislista eller ändra kalkylen.`;

/** Felmeddelandet från send-offer (t.ex. serverspärren), annars klientens text. */
export async function functionErrorText(error: unknown): Promise<string> {
  let msg = (error as { message?: string } | null)?.message || 'Kunde inte skicka offert';
  try {
    const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)?.context?.json?.();
    if (body?.error) msg = body.error;
  } catch { /* svaret var inte JSON */ }
  return msg;
}
