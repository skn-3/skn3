import type { CaseRow } from '@/lib/supabaseClient';
import { STATUS_LABELS } from '@/lib/constants';
import { MapPin, User, Wrench, Calendar } from 'lucide-react';

interface CaseCardProps {
  caseData: CaseRow;
  onClick: () => void;
}

export function CaseCard({ caseData, onClick }: CaseCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow space-y-2"
    >
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-sm text-card-foreground leading-tight">{caseData.address}</h3>
        {caseData.order_value && (
          <span className="text-xs font-medium text-primary whitespace-nowrap ml-2">
            {Number(caseData.order_value).toLocaleString('sv-SE')} kr
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3" />
          {caseData.customer_name}
        </div>
        {caseData.team && (
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3 w-3" />
            {caseData.team}
          </div>
        )}
        {(caseData.km_date || caseData.montage_date) && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            {caseData.km_date && `KM: ${caseData.km_date}`}
            {caseData.montage_date && ` | Montage: ${caseData.montage_date}`}
          </div>
        )}
      </div>
    </button>
  );
}
