import type { CaseRow } from '@/lib/supabaseClient';
import { User, Wrench, UserCircle } from 'lucide-react';

interface CaseCardProps {
  caseData: CaseRow;
  onClick: () => void;
  showSeller?: boolean;
}

export function CaseCard({ caseData, onClick, showSeller }: CaseCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow space-y-1.5"
    >
      <h3 className="font-bold text-sm text-card-foreground leading-tight">{caseData.address}</h3>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 shrink-0" />
          {caseData.customer_name}
        </div>
        {caseData.team && (
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3 w-3 shrink-0" />
            {caseData.team}
          </div>
        )}
        {showSeller && (
          <div className="flex items-center gap-1.5">
            <UserCircle className="h-3 w-3 shrink-0" />
            <span className="italic">{caseData.seller || '(saknas)'}</span>
          </div>
        )}
        {caseData.order_value && (
          <div className="text-primary font-medium">
            {Number(caseData.order_value).toLocaleString('sv-SE')} kr
          </div>
        )}
      </div>
    </button>
  );
}

