import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import type { RankedCase, CaseLike } from '@/lib/caseMatching';

/** Kandidatfält som får visas i matchningslistor: inga ekonomiska uppgifter. */
export interface MatchCaseRow extends CaseLike {
  address?: string | null;
  customer_name?: string | null;
  seller?: string | null;
  status?: string | null;
}

export function caseStatusLabel(status: string | null | undefined) {
  return status ? (STATUS_LABELS as Record<string, string>)[status] ?? status : '';
}

/** "Soprangränd 6 – Ulf Wencke (Daniel Malke, Montage klart)" */
export function caseMatchTitle(c: MatchCaseRow) {
  const meta = [c.seller, caseStatusLabel(c.status)].filter(Boolean).join(', ');
  return `${c.address || '—'}${c.customer_name ? ` – ${c.customer_name}` : ''}${meta ? ` (${meta})` : ''}`;
}

interface Props<T extends MatchCaseRow> {
  candidates: RankedCase<T>[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Tryckbar kandidatlista (inget hover-beroende, minst 48 px höga rader). */
export function CaseMatchCandidates<T extends MatchCaseRow>({ candidates, selectedId, onSelect }: Props<T>) {
  if (!candidates.length) return null;
  return (
    <div className="rounded-md border divide-y" role="radiogroup">
      {candidates.map(r => {
        const active = r.case.id === selectedId;
        return (
          <button
            key={r.case.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(r.case.id)}
            className={cn('w-full min-h-12 text-left px-3 py-2 flex items-start gap-2 text-sm', active && 'bg-muted')}
          >
            <Check className={cn('h-4 w-4 mt-0.5 shrink-0', active ? 'opacity-100 text-primary' : 'opacity-0')} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.case.address || '—'}</span>
              <span className="block text-xs text-muted-foreground">
                {[r.case.customer_name, r.case.seller, caseStatusLabel(r.case.status)].filter(Boolean).join(' · ')}
              </span>
              {r.label && <span className="block text-xs text-muted-foreground">Träff på {r.label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
