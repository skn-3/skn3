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
  ny: 'bg-blue-100 text-blue-800',
  vantar_km: 'bg-yellow-100 text-yellow-800',
  km_bokad: 'bg-sky-100 text-sky-800',
  km_klar: 'bg-teal-100 text-teal-800',
  vantar_godkannande: 'bg-orange-100 text-orange-800',
  godkand: 'bg-emerald-100 text-emerald-800',
  i_produktion: 'bg-indigo-100 text-indigo-800',
  leverans_klar: 'bg-purple-100 text-purple-800',
  montage_bokat: 'bg-green-100 text-green-800',
  montage_klart: 'bg-green-200 text-green-900',
  fakturerad: 'bg-gray-100 text-gray-700',
  pausad: 'bg-red-100 text-red-800',
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
                <div className="flex items-center gap-1 text-amber-600 text-xs font-medium mt-1">
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
