import { supabase } from '@/integrations/supabase/client';

export interface KlimatEventResult {
  ok?: boolean;
  already_sent?: boolean;
  skipped?: boolean;
  claim_url?: string | null;
  verification_id?: string | null;
  total_trees?: number | null;
  tree_count?: number | null;
  error?: string;
}

interface SendArgs {
  eventType: 'visit' | 'signing';
  caseId?: string | null;
  visitId?: string | null;
  treeCount: number;
  seller?: string | null;
  eventRef: string;
}

/** Skickar en anonym trädhändelse till SmartKlimat via serverkanalen. Innehåller aldrig kunddata. */
export async function sendKlimatEvent(args: SendArgs): Promise<KlimatEventResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('klimatkompensera', {
      body: {
        event_type: args.eventType,
        case_id: args.caseId ?? null,
        visit_id: args.visitId ?? null,
        tree_count: args.treeCount,
        seller: args.seller ?? null,
        event_ref: args.eventRef,
      },
    });
    if (error) {
      console.warn('[klimat] invoke failed', error);
      return null;
    }
    return data as KlimatEventResult;
  } catch (e) {
    console.warn('[klimat] invoke threw', e);
    return null;
  }
}
