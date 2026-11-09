import { CheckCircle2, PhoneCall } from 'lucide-react';
import type { CaseRow } from '@/lib/supabaseClient';
import { followupApplies } from '@/lib/customerFollowup';
import { useCustomerFollowup } from '@/hooks/useCustomerFollowup';
import { CustomerFollowupControls } from '@/components/shared/CustomerFollowupControls';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Kundavstämning i ärendepanelen. Renderas bara för personal (anroparen styr). */
export function CustomerFollowupBlock({ caseData, currentUser }: { caseData: CaseRow; currentUser: string }) {
  const followup = useCustomerFollowup(currentUser);
  if (!followupApplies(caseData)) return null;
  const doneAt = caseData.customer_followup_done_at;

  return (
    <section className="p-4 space-y-2" aria-label="Kundavstämning">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <PhoneCall className="h-4 w-4" /> Kundavstämning
      </h3>
      {doneAt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Avstämd med kund {fmtDate(doneAt)} av {caseData.customer_followup_done_by || 'okänd'}
          </span>
          <button
            type="button"
            className="min-h-11 px-2 text-xs font-medium underline underline-offset-2 text-emerald-900 dark:text-emerald-100"
            onClick={() => followup.reopen(caseData)}
          >
            Ångra
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Montaget är klart. Ring kunden och se till att signeringen är gjord innan du klarmarkerar.
          </p>
          <CustomerFollowupControls c={caseData} followup={followup} />
        </>
      )}
    </section>
  );
}
