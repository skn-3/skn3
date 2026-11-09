import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateCase, createCaseEvent, type CaseRow } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activityLog';
import {
  canCompleteFollowup,
  followupPatch,
  followupRollback,
  type FollowupAction,
  type FollowupPatch,
} from '@/lib/customerFollowup';

type Vars = { c: CaseRow; action: FollowupAction };

function patchCaches(qc: QueryClient, id: string, patch: FollowupPatch) {
  const patchList = (old: unknown) =>
    Array.isArray(old) ? old.map((r: any) => (r?.id === id ? { ...r, ...patch } : r)) : old;
  qc.setQueriesData({ queryKey: ['coordinator-cases'] }, patchList);
  qc.setQueriesData({ queryKey: ['cases'] }, patchList);
  qc.setQueryData(['case', id], (old: any) => (old ? { ...old, ...patch } : old));
}

/** Gemensam spar-logik för kundavstämningen (inkorgen och ärendepanelen). */
export function useCustomerFollowup(actorName: string) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ c, action }: Vars) => {
      if (action.kind === 'done' && !canCompleteFollowup(c)) {
        throw new Error('Bocka i både Kund kontaktad och Kund har signerat först');
      }
      const patch = followupPatch(action, actorName, new Date().toISOString());
      await updateCase(c.id, patch);

      if (action.kind === 'done' || action.kind === 'reopen') {
        const done = action.kind === 'done';
        // Primärraden är sparad; historik och logg får inte fälla klarmarkeringen.
        try {
          await createCaseEvent({
            case_id: c.id,
            event_type: done ? 'customer_followup_done' : 'customer_followup_reopened',
            description: done
              ? `Kundavstämning klar: kund kontaktad och har signerat — av ${actorName}`
              : `Kundavstämning öppnad igen av ${actorName}`,
            created_by: actorName,
          });
        } catch (e) {
          console.warn('Kunde inte logga kundavstämning i historiken', e);
        }
        logActivity({
          category: 'case',
          action: done ? 'customer_followup_done' : 'customer_followup_reopened',
          description: done
            ? `Kundavstämning klar för ${c.address} av ${actorName}`
            : `Kundavstämning öppnad igen för ${c.address} av ${actorName}`,
          case_id: c.id,
        });
      }
    },
    onMutate: async ({ c, action }: Vars) => {
      const patch = followupPatch(action, actorName, new Date().toISOString());
      const rollback = followupRollback(c as any, patch);
      patchCaches(qc, c.id, patch);
      return { rollback };
    },
    onError: (e: any, { c }, ctx) => {
      if (ctx?.rollback) patchCaches(qc, c.id, ctx.rollback);
      toast.error('Kunde inte spara kundavstämningen: ' + (e?.message ?? 'okänt fel'));
    },
    onSuccess: (_d, { action }) => {
      if (action.kind === 'done') toast.success('✓ Avstämning klar');
      if (action.kind === 'reopen') toast.success('Avstämningen är öppen igen');
    },
    onSettled: (_d, _e, { c, action }) => {
      qc.invalidateQueries({ queryKey: ['coordinator-cases'] });
      qc.invalidateQueries({ queryKey: ['case', c.id] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      if (action.kind === 'done' || action.kind === 'reopen') {
        qc.invalidateQueries({ queryKey: ['case_events', c.id] });
      }
    },
  });

  return {
    setContacted: (c: CaseRow, checked: boolean) => mutation.mutate({ c, action: { kind: 'contacted', checked } }),
    setSigned: (c: CaseRow, checked: boolean) => mutation.mutate({ c, action: { kind: 'signed', checked } }),
    markDone: (c: CaseRow) => mutation.mutate({ c, action: { kind: 'done' } }),
    reopen: (c: CaseRow) => mutation.mutate({ c, action: { kind: 'reopen' } }),
    pendingDone: (c: CaseRow) =>
      mutation.isPending && mutation.variables?.c.id === c.id && mutation.variables.action.kind === 'done',
  };
}
