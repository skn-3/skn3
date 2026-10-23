import type { CaseRow } from '@/lib/supabaseClient';
import { StatusChip, Chip } from '@/components/ui/chip';
import { Phone, Calendar, AlertTriangle } from 'lucide-react';

interface Props {
  cases: CaseRow[];
  unresolvedDeviationCaseIds: Set<string>;
  onSelect: (c: CaseRow) => void;
}

// Statusfärger kommer från src/lib/statusTheme.ts (samma i hela appen).

export function MontorCaseList({ cases, unresolvedDeviationCaseIds, onSelect }: Props) {
  return (
    <div className="space-y-3">
      {cases.map((c) => {
        const hasDeviation = unresolvedDeviationCaseIds.has(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`w-full text-left rounded-xl border bg-card p-4 shadow-card card-lift animate-fade-up min-h-[72px] ${
              hasDeviation ? 'border-l-[3px] border-l-warning-ink' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <StatusChip status={c.status} />
              {c.montage_date && (
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {c.montage_date}
                </span>
              )}
            </div>
            <h3 className="font-display font-semibold text-[17px] text-card-foreground leading-tight mb-1.5">{c.address}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>{c.customer_name}</div>
              <div className="flex items-center justify-between gap-2">
                {c.customer_phone ? (
                  <a
                    href={`tel:${c.customer_phone}`}
                    onClick={e => e.stopPropagation()}
                    className="inline-flex min-h-8 items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {c.customer_phone}
                  </a>
                ) : (
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    Telefon saknas
                  </span>
                )}
                {hasDeviation && (
                  <Chip tone="warning" icon={<AlertTriangle />}>Öppen reklamation</Chip>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
