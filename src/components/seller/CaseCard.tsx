import type { CSSProperties } from 'react';
import type { CaseRow } from '@/lib/supabaseClient';
import { User, Wrench, UserCircle, AlertTriangle, Clock } from 'lucide-react';
import { differenceInCalendarDays, startOfISOWeek } from 'date-fns';

const DELIVERY_RELEVANT_STATUSES = new Set([
  'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat',
]);

type DeliveryBadge = { label: string; tone: 'red' | 'orange' | 'yellow' | 'gray' };

function getDeliveryCountdownBadge(c: any): DeliveryBadge | null {
  if (!DELIVERY_RELEVANT_STATUSES.has(c.status)) return null;
  const dd: string | null = c.delivery_date || null;
  const dw: number | null = c.delivery_week || null;
  const dy: number | null = c.delivery_year || null;

  let refDate: Date | null = null;
  let weekStartDate: Date | null = null;
  const isWeekBased = !dd && !!(dw && dy);

  if (dd) {
    refDate = new Date(dd + 'T00:00:00');
  } else if (dw && dy) {
    const jan4 = new Date(dy, 0, 4);
    weekStartDate = startOfISOWeek(jan4);
    weekStartDate.setDate(weekStartDate.getDate() + (dw - 1) * 7);
    refDate = new Date(weekStartDate);
    refDate.setDate(weekStartDate.getDate() + 6); // söndag
  } else {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToEarliest = differenceInCalendarDays(isWeekBased ? weekStartDate! : refDate, today);
  const daysToEnd = differenceInCalendarDays(refDate, today);

  if (daysToEnd < 0) return { label: '✓ Levererad', tone: 'gray' };

  if (isWeekBased) {
    const weekTxt = `v${dw}`;
    if (daysToEarliest <= 0) return { label: `📦 Leverans ${weekTxt} (denna vecka)`, tone: 'red' };
    if (daysToEarliest <= 3) return { label: `📦 Leverans ${weekTxt} (om ${daysToEarliest} dag${daysToEarliest === 1 ? '' : 'ar'})`, tone: 'red' };
    if (daysToEarliest <= 7) return { label: `📦 Leverans ${weekTxt} (om ${daysToEarliest} dagar)`, tone: 'orange' };
    if (daysToEarliest <= 14) return { label: `📦 Leverans ${weekTxt} (om ${daysToEarliest} dagar)`, tone: 'yellow' };
    return { label: `📦 Leverans ${weekTxt}`, tone: 'gray' };
  }

  const dateTxt = refDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  if (daysToEnd === 0) return { label: '📦 Levereras idag', tone: 'red' };
  if (daysToEnd <= 3) return { label: `📦 Leverans om ${daysToEnd} dag${daysToEnd === 1 ? '' : 'ar'}`, tone: 'red' };
  if (daysToEnd <= 7) return { label: `📦 Leverans om ${daysToEnd} dagar`, tone: 'orange' };
  if (daysToEnd <= 14) return { label: `📦 Leverans om ${daysToEnd} dagar`, tone: 'yellow' };
  return { label: `📦 Leverans ${dateTxt}`, tone: 'gray' };
}

const DELIVERY_TONE_CLASSES: Record<DeliveryBadge['tone'], string> = {
  red: 'border-red-400 bg-red-100 text-red-800',
  orange: 'border-orange-300 bg-orange-100 text-orange-800',
  yellow: 'border-yellow-300 bg-yellow-100 text-yellow-800',
  gray: 'border-gray-300 bg-gray-100 text-gray-700',
};

// Storleksgradient för antal enheter — lätt att justera.
// Skala 1..UNITS_SCALE_CAP mappas linjärt till alpha MIN..MAX.
const UNITS_SCALE_CAP = 25;
const UNITS_ALPHA_MIN = 0.18;
const UNITS_ALPHA_MAX = 0.85;
const UNITS_BG_ALPHA_MAX = 0.06; // mycket svag bakgrundston
function unitsIntensity(units: number | null | undefined) {
  if (!units || units <= 0) return null;
  const t = Math.min(1, units / UNITS_SCALE_CAP);
  const edge = UNITS_ALPHA_MIN + (UNITS_ALPHA_MAX - UNITS_ALPHA_MIN) * t;
  const bg = UNITS_BG_ALPHA_MAX * t;
  return { edge, bg };
}


interface CaseCardProps {
  caseData: CaseRow;
  onClick: () => void;
  showSeller?: boolean;
  warnings?: string[];
  hideFinancials?: boolean;
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

export function CaseCard({ caseData, onClick, showSeller, warnings, hideFinancials }: CaseCardProps) {
  const tidsBadge = getScheduledDeliveryBadge(caseData as any);
  const deliveryBadge = getDeliveryCountdownBadge(caseData as any);
  const units = (caseData as any).units as number | null | undefined;
  const intensity = unitsIntensity(units);
  const cardStyle: React.CSSProperties | undefined = intensity
    ? {
        borderLeftWidth: 3,
        borderLeftColor: `hsl(var(--primary) / ${intensity.edge})`,
        backgroundColor: `hsl(var(--primary) / ${intensity.bg})`,
      }
    : undefined;

  return (
    <button
      onClick={onClick}
      style={cardStyle}
      className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 motion-reduce:hover:translate-y-0 motion-reduce:transition-none animate-fade-in space-y-1.5"
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
        {showSeller && !hideFinancials && (
          <div className="flex items-center gap-1.5">
            <UserCircle className="h-3 w-3 shrink-0" />
            <span className="italic">{caseData.seller || '(saknas)'}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {caseData.order_value && !hideFinancials ? (
            <span className="text-primary font-medium">
              {Number(caseData.order_value).toLocaleString('sv-SE')} kr
            </span>
          ) : <span />}
          {units != null && units > 0 ? (
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {units} st
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">–</span>
          )}
        </div>
      </div>
      {(deliveryBadge || tidsBadge || (warnings && warnings.length > 0)) && (
        <div className="flex flex-wrap gap-1 pt-1">
          {deliveryBadge && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${DELIVERY_TONE_CLASSES[deliveryBadge.tone]}${deliveryBadge.tone === 'red' ? ' font-semibold' : ''}`}
            >
              {deliveryBadge.label}
            </span>
          )}

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
