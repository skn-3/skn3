import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllCases, fetchAllDeviations } from '@/lib/supabaseClient';
import { inboxOpenCount } from '@/lib/coordinatorInbox';

/** Ärenden som redan har en plåtbeställning (samma fråga och nyckel som inkorgen). */
export async function fetchSheetMetalCaseIds(): Promise<Set<string>> {
  const { data, error } = await (supabase as any).from('sheet_metal_orders').select('case_id, status');
  if (error) throw error;
  return new Set(((data || []) as Array<{ case_id: string }>).map(o => o.case_id));
}

/** Antal öppna punkter i Min inkorg. Delar frågorna (och cachen) med inkorgen. */
export function useCoordinatorInboxCount(enabled = true): number {
  const cases = useQuery({ queryKey: ['coordinator-cases'], queryFn: () => fetchAllCases(), enabled });
  const deviations = useQuery({ queryKey: ['coordinator-deviations'], queryFn: () => fetchAllDeviations(), enabled });
  const sheet = useQuery({ queryKey: ['coordinator-sheet-metal-cases'], queryFn: fetchSheetMetalCaseIds, enabled });
  return useMemo(
    () => inboxOpenCount({ cases: cases.data ?? [], deviations: deviations.data ?? [], sheetMetalCaseIds: sheet.data }),
    [cases.data, deviations.data, sheet.data],
  );
}
