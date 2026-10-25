import type { CaseRow } from '@/lib/supabaseClient';
import { StatusChip, Chip } from '@/components/ui/chip';
import { Phone, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { statusDotClass } from '@/lib/statusTheme';
import { relevantCaseDate } from '@/lib/montorLists';

interface Props {
  cases: CaseRow[];
  unresolvedDeviationCaseIds: Set<string>;
  onSelect: (c: CaseRow) => void;
  teamName: string | null;
}

// Statusfärger kommer från src/lib/statusTheme.ts (samma i hela appen).

export function MontorCaseList({ cases, unresolvedDeviationCaseIds, onSelect, teamName }: Props) {
  return (
    <div className="grid items-start gap-2.5 lg:grid-cols-2">
      {cases.map((c) => {
        const hasDeviation = unresolvedDeviationCaseIds.has(c.id);
        const date = relevantCaseDate(c);
        return (
          <article
            key={c.id}
            className="relative min-w-0 text-left rounded-2xl border border-border bg-card p-4 shadow-card card-lift animate-fade-up motion-reduce:animate-none"
          >
            <span aria-hidden="true" className={`absolute inset-y-4 left-0 w-[3px] rounded-r ${statusDotClass(c.status)}`} />
            <Button variant="ghost" className="absolute inset-0 h-full w-full rounded-2xl p-0 hover:bg-muted/20" aria-label={`Öppna ärendet ${c.address}`} onClick={() => onSelect(c)} />
            <div className="relative pointer-events-none">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusChip status={c.status} />
              {c.km_team && (!teamName || c.km_team === teamName) && <Chip className="border border-border bg-background text-muted-foreground">KM</Chip>}
              {c.team && (!teamName || c.team === teamName) && <Chip className="border border-border bg-background text-muted-foreground">Montage</Chip>}
              <span className="ml-auto text-xs text-muted-foreground">{date || 'Ej bokat'}</span>
            </div>
            <h3 className="font-display font-semibold text-[17px] tracking-normal text-card-foreground leading-snug break-words">{c.address}</h3>
            {c.city && <p className="mt-1 text-sm text-muted-foreground">{c.city}</p>}
            <div className="mt-3 text-sm text-muted-foreground space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words">{c.customer_name}</span>
                {c.customer_phone ? (
                  <Button asChild variant="outline" size="icon" className="pointer-events-auto relative h-10 w-10 shrink-0 rounded-full border-border text-ink">
                  <a
                    href={`tel:${c.customer_phone}`}
                    aria-label={`Ring ${c.customer_name}: ${c.customer_phone}`}
                  >
                    <Phone />
                  </a>
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Telefon saknas
                  </span>
                )}
              </div>
              {hasDeviation && <Chip className="bg-gold-soft text-ink" icon={<AlertTriangle />}>Öppen reklamation</Chip>}
            </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
