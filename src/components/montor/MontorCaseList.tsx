import type { CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Phone, Calendar, AlertTriangle } from 'lucide-react';

interface Props {
  cases: CaseRow[];
  unresolvedDeviationCaseIds: Set<string>;
  onSelect: (c: CaseRow) => void;
}

const statusColor: Record<string, string> = {
  ny: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
  vantar_km: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
  km_bokad: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300',
  km_klar: 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300',
  vantar_godkannande: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300',
  godkand: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
  i_produktion: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300',
  leverans_klar: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300',
  montage_bokat: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
  montage_pagar: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300',
  montage_klart: 'bg-green-200 text-green-900 dark:text-green-300',

  fakturerad: 'bg-muted text-muted-foreground',
  pausad: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
};

export function MontorCaseList({ cases, unresolvedDeviationCaseIds, onSelect }: Props) {
  return (
    <div className="space-y-3">
      {cases.map((c) => {
        const hasDeviation = unresolvedDeviationCaseIds.has(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`w-full text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow min-h-[72px] ${
              hasDeviation ? 'border-l-4 border-l-amber-400' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-card-foreground leading-tight">{c.address}</h3>
              <Badge className={`text-xs shrink-0 ml-2 ${statusColor[c.status] || ''}`}>
                {STATUS_LABELS[c.status] || c.status}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>{c.customer_name}</div>
              <div className="flex items-center justify-between">
                <a
                  href={`tel:${c.customer_phone}`}
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {c.customer_phone}
                </a>
                {c.montage_date && (
                  <span className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    {c.montage_date}
                  </span>
                )}
              </div>
              {hasDeviation && (
                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Öppen reklamation
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
