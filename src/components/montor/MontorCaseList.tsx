import type { CaseRow } from '@/lib/supabaseClient';
import { StatusChip, Chip } from '@/components/ui/chip';
import { Phone, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { statusDotClass } from '@/lib/statusTheme';
import { dayTagSv, formatDayTimeSv } from '@/lib/dateSv';

interface Props {
  cases: CaseRow[];
  unresolvedDeviationCaseIds: Set<string>;
  onSelect: (c: CaseRow) => void;
  teamName: string | null;
}

const KM_PHASE = ['vantar_km', 'km_bokad', 'km_klar'];

/** Nästa tid för kortet: fas + datum + tid. */
function nextSlot(c: CaseRow) {
  const any = c as any;
  const km = KM_PHASE.includes(c.status);
  const date = km ? c.km_date : c.montage_date;
  const time = km ? any.km_time : any.montage_time;
  return { phase: km ? 'KM' : 'Montage', date, time };
}

function showCity(c: CaseRow) {
  return !!c.city && !(c.address || '').toLowerCase().includes(c.city.toLowerCase());
}

// Statusfärger kommer från src/lib/statusTheme.ts (samma i hela appen).
export function MontorCaseList({ cases, unresolvedDeviationCaseIds, onSelect, teamName }: Props) {
  return (
    <div className="grid items-start gap-2.5 lg:grid-cols-2">
      {cases.map((c) => {
        const hasDeviation = unresolvedDeviationCaseIds.has(c.id);
        const slot = nextSlot(c);
        const tag = dayTagSv(slot.date);
        return (
          <article
            key={c.id}
            className="relative min-w-0 text-left rounded-2xl border border-border bg-card p-4 shadow-card card-lift animate-fade-up motion-reduce:animate-none"
          >
            <span aria-hidden="true" className={`absolute inset-y-4 left-0 w-[3px] rounded-r ${statusDotClass(c.status)}`} />
            <Button variant="ghost" className="absolute inset-0 h-full w-full rounded-2xl p-0 hover:bg-muted/20" aria-label={`Öppna ärendet ${c.address}`} onClick={() => onSelect(c)} />
            <div className="relative pointer-events-none">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusChip status={c.status} />
                <span className="ml-auto flex items-center gap-1.5 text-right">
                  {slot.date ? <>
                    {tag && <Chip className="bg-gold-soft text-ink">{tag}</Chip>}
                    <span className="text-[13px] font-medium text-ink">{slot.phase} · {formatDayTimeSv(slot.date, slot.time)}</span>
                  </> : <span className="text-[13px] text-muted-foreground">Ej bokat</span>}
                </span>
              </div>
              {!teamName && (c.km_team || c.team) && <div className="mb-2 flex flex-wrap gap-1.5">
                {c.km_team && <Chip className="border border-border bg-background font-normal text-muted-foreground">KM: {c.km_team}</Chip>}
                {c.team && <Chip className="border border-border bg-background font-normal text-muted-foreground">Montage: {c.team}</Chip>}
              </div>}
              <h3 className="font-display font-semibold text-[17px] tracking-normal text-card-foreground leading-snug break-words">{c.address}</h3>
              {showCity(c) && <p className="mt-1 text-sm text-muted-foreground">{c.city}</p>}
              <div className="mt-3 text-sm text-muted-foreground space-y-2">
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <span className="min-w-0 break-words">{c.customer_name}</span>
                  {c.customer_phone && (
                    <Button asChild variant="outline" size="icon" className="pointer-events-auto relative h-11 w-11 shrink-0 rounded-full border-border text-ink">
                      <a href={`tel:${c.customer_phone}`} aria-label={`Ring ${c.customer_name}: ${c.customer_phone}`}>
                        <Phone />
                      </a>
                    </Button>
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
