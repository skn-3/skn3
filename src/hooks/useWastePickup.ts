import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCase, createCaseEvent, sendWastePickupEmail } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import {
  requestPatch,
  cancelPatch,
  bookPatch,
  requestDescription,
  bookedDescription,
  type WasteFields,
} from '@/lib/wastePickup';

type CaseLike = WasteFields & { id: string; address: string };

/** Gemensam spar-logik för skräphämtning (montörsvyn, inkorgen och ärendepanelen). */
export function useWastePickup(actorName: string) {
  const qc = useQueryClient();
  const invalidate = (id: string) => {
    qc.invalidateQueries({ queryKey: ['case', id] });
    qc.invalidateQueries({ queryKey: ['case_events', id] });
    qc.invalidateQueries({ queryKey: ['coordinator-cases'] });
    qc.invalidateQueries({ queryKey: ['cases'] });
  };

  // Primärraden sparas först; historik, logg och mejl får aldrig fälla begäran.
  const safeEvent = async (case_id: string, event_type: string, description: string) => {
    try {
      await createCaseEvent({ case_id, event_type, description, created_by: actorName });
    } catch (e) {
      console.warn('Kunde inte logga skräphämtning i historiken', e);
    }
  };

  const request = useMutation({
    mutationFn: async ({ c, note, earliest }: { c: CaseLike; note?: string; earliest?: string }) => {
      const patch = requestPatch({ actor: actorName, note, earliest, nowIso: new Date().toISOString() });
      await updateCase(c.id, patch);
      await safeEvent(c.id, 'waste_pickup_requested', requestDescription(c.address, actorName, note, earliest));
      logActivity({
        category: 'case',
        action: 'waste_pickup_requested',
        description: `Begärde skräphämtning (Ragn-Sells) för ${c.address}`,
        case_id: c.id,
        metadata: { note: patch.waste_pickup_note, earliest: patch.waste_pickup_earliest },
      });
      try {
        await sendWastePickupEmail(c.id);
        logActivity({ category: 'email', action: 'waste_pickup_requested', description: `Mejl skickat (waste_pickup_requested) för ${c.address}`, case_id: c.id, metadata: { template: 'waste_pickup_requested' } });
        return { emailOk: true };
      } catch (e) {
        console.error('[waste_pickup_requested] mejlet via notify-email misslyckades:', e);
        return { emailOk: false };
      }
    },
    onSuccess: ({ emailOk }) => {
      if (emailOk) toast.success('✓ Skickat till kontoret');
      else toast.success('✓ Skickat till kontoret', { description: 'Mejlet till koordinatorn gick inte iväg, men kontoret ser begäran i appen.' });
    },
    onError: (e: any) => toast.error('Kunde inte skicka: ' + (e?.message ?? 'okänt fel')),
    onSettled: (_d, _e, { c }) => invalidate(c.id),
  });

  const cancel = useMutation({
    mutationFn: async (c: CaseLike) => {
      await updateCase(c.id, cancelPatch());
      await safeEvent(c.id, 'waste_pickup_cancelled', `Skräphämtning ångrad av ${actorName}`);
      logActivity({ category: 'case', action: 'waste_pickup_cancelled', description: `Ångrade skräphämtning för ${c.address}`, case_id: c.id });
    },
    onSuccess: () => toast.success('Begäran om hämtning ångrad'),
    onError: (e: any) => toast.error('Kunde inte ångra: ' + (e?.message ?? 'okänt fel')),
    onSettled: (_d, _e, c) => invalidate(c.id),
  });

  const book = useMutation({
    mutationFn: async ({ c, date, note }: { c: CaseLike; date: string; note?: string }) => {
      await updateCase(c.id, bookPatch({ actor: actorName, date, nowIso: new Date().toISOString() }));
      await safeEvent(c.id, 'waste_pickup_booked', bookedDescription(date, actorName, note));
      logActivity({
        category: 'case',
        action: 'waste_pickup_booked',
        description: `Bokade Ragn-Sells till ${date} för ${c.address}`,
        case_id: c.id,
        metadata: { date, note: note?.trim() || null },
      });
    },
    onSuccess: () => toast.success('✓ Hämtning bokad'),
    onError: (e: any) => toast.error('Kunde inte boka: ' + (e?.message ?? 'okänt fel')),
    onSettled: (_d, _e, { c }) => invalidate(c.id),
  });

  return { request, cancel, book };
}
