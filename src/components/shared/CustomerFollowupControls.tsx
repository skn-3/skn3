import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { CaseRow } from '@/lib/supabaseClient';
import { canCompleteFollowup } from '@/lib/customerFollowup';
import type { useCustomerFollowup } from '@/hooks/useCustomerFollowup';

type Followup = ReturnType<typeof useCustomerFollowup>;

function BigCheck({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-12 cursor-pointer select-none items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        checked
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-border bg-card',
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="h-6 w-6" />
      {label}
    </label>
  );
}

/** Två kryssrutor + Klarmarkera. Samma kontroller i inkorgen och ärendepanelen. */
export function CustomerFollowupControls({ c, followup, className }: { c: CaseRow; followup: Followup; className?: string }) {
  const ready = canCompleteFollowup(c);
  const pending = followup.pendingDone(c);
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-stretch', className)}>
      <div className="grid flex-1 gap-2 sm:grid-cols-2">
        <BigCheck
          id={`fu-contacted-${c.id}`}
          label="Kund kontaktad"
          checked={!!c.customer_followup_contacted_at}
          onChange={(v) => followup.setContacted(c, v)}
        />
        <BigCheck
          id={`fu-signed-${c.id}`}
          label="Kund har signerat"
          checked={!!c.customer_followup_signed_at}
          onChange={(v) => followup.setSigned(c, v)}
        />
      </div>
      <Button
        size="lg"
        className="min-h-12 shrink-0 gap-2"
        disabled={!ready || pending}
        onClick={() => followup.markDone(c)}
      >
        <Check className="h-5 w-5" />
        {pending ? 'Sparar...' : 'Klarmarkera'}
      </Button>
    </div>
  );
}
