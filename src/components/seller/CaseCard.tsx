import type { CaseRow } from '@/lib/supabaseClient';
import { User, Wrench, UserCircle, AlertTriangle, Clock } from 'lucide-react';

interface CaseCardProps {
  caseData: CaseRow;
  onClick: () => void;
  showSeller?: boolean;
  warnings?: string[];
}

function getScheduledDeliveryBadge(c: any): { label: string; urgent: boolean } | null {
  if (!c.scheduled_delivery) return null;
  const dt: string | null = c.delivery_time || null;
  const dd: string | null = c.delivery_date || null;
  const dw: number | null = c.delivery_week || null;
  const dy: number | null = c.delivery_year || null;
  let daysUntil: number | null = null;
  if (dd) {
    daysUntil = Math.ceil((new Date(dd + 'T00:00:00').getTime() - Date.now()) / 86400000);
  } else if (dw && dy) {
    const jan4 = new Date(dy, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (dw - 1) * 7);
    daysUntil = Math.ceil((weekStart.getTime() - Date.now()) / 86400000);
  }
  if (dt) return { label: `🕐 Tidsstyrd — kl ${String(dt).slice(0, 5)}`, urgent: false };
  if (daysUntil != null && daysUntil <= 14 && daysUntil >= -1) {
    return { label: '🕐 Tidsstyrd — tid saknas!', urgent: true };
  }
  return { label: '🕐 Tidsstyrd leverans', urgent: false };
}

export function CaseCard({ caseData, onClick, showSeller, warnings }: CaseCardProps) {
  const tidsBadge = getScheduledDeliveryBadge(caseData as any);
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
      {(tidsBadge || (warnings && warnings.length > 0)) && (
        <div className="flex flex-wrap gap-1 pt-1">
          {tidsBadge && (
            <span
              className={
                tidsBadge.urgent
                  ? 'inline-flex items-center gap-1 rounded-full border border-red-400 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 animate-pulse'
                  : 'inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800'
              }
            >
              <Clock className="h-3 w-3" />
              {tidsBadge.label}
            </span>
          )}
          {warnings?.map((w) => (
            <span
              key={w}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
            >
              <AlertTriangle className="h-3 w-3" />
              {w}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
