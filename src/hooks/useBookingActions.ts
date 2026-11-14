import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  bookKm, bookMontage, rescheduleMontage, rescheduleKm, changeBookingTeam, unbookKm, unbookMontage,
  INFO_WARNINGS, type BookingResult,
} from '@/lib/booking';

/** Frågor som en bokning påverkar (samma som dagens flöden; ['cases'] täcker montörens listor). */
export function bookingQueryKeys(caseId: string): QueryKey[] {
  return [['case', caseId], ['cases'], ['case_events', caseId], ['calendar']];
}

/** Visar varningar från bokningstjänsten som separata toaster (som kontorsflödet gjort hittills). */
export function toastBookingWarnings(warnings: readonly string[]) {
  for (const w of warnings) {
    if (INFO_WARNINGS.includes(w)) toast.info(w);
    else toast.warning(w);
  }
}

function useBookingMutation<V extends { caseData: { id: string } }>(fn: (vars: V) => Promise<BookingResult>) {
  const queryClient = useQueryClient();
  return useMutation<BookingResult, Error, V>({
    mutationFn: fn,
    onSuccess: (_r, vars) => {
      for (const queryKey of bookingQueryKeys(vars.caseData.id)) queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Bokningstjänsten som mutationer. Visningen av resultat och fel sköts av anroparen. */
export function useBookingActions() {
  return {
    bookKm: useBookingMutation(bookKm),
    bookMontage: useBookingMutation(bookMontage),
    rescheduleMontage: useBookingMutation(rescheduleMontage),
    rescheduleKm: useBookingMutation(rescheduleKm),
    changeBookingTeam: useBookingMutation(changeBookingTeam),
    unbookKm: useBookingMutation(unbookKm),
    unbookMontage: useBookingMutation(unbookMontage),
  };
}
