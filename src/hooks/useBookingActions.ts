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

/** Bokningstjänsten som mutationer. Visningen av resultat och fel sköts av anroparen. */
export function useBookingActions() {
  const queryClient = useQueryClient();
  const onSuccess = (_r: BookingResult, vars: { caseData: { id: string } }) => {
    for (const queryKey of bookingQueryKeys(vars.caseData.id)) queryClient.invalidateQueries({ queryKey });
  };
  return {
    bookKm: useMutation({ mutationFn: bookKm, onSuccess }),
    bookMontage: useMutation({ mutationFn: bookMontage, onSuccess }),
    rescheduleMontage: useMutation({ mutationFn: rescheduleMontage, onSuccess }),
    rescheduleKm: useMutation({ mutationFn: rescheduleKm, onSuccess }),
    changeBookingTeam: useMutation({ mutationFn: changeBookingTeam, onSuccess }),
    unbookKm: useMutation({ mutationFn: unbookKm, onSuccess }),
    unbookMontage: useMutation({ mutationFn: unbookMontage, onSuccess }),
  };
}
