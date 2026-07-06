import type { CSSProperties } from 'react';
import type { CaseRow } from '@/lib/supabaseClient';
import { User, Wrench, UserCircle, AlertTriangle, Clock, Ruler } from 'lucide-react';
import { differenceInCalendarDays, startOfISOWeek } from 'date-fns';
import { KlimatKompenseradBadge } from '@/components/shared/KlimatKompenseradBadge';

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

// Storleksindikator för antal enheter — vivid azurblå, enbart vänsterkant.
// Intensiteten skalar opacitet (aldrig en grå ton): ljus/låg vid 1 enhet → mättad/full vid 20+.
// Ankarvärden: 1 → ~0  ·  ~8 → 0.5  ·  20+ → 1.0 (capad).
// Saknas värde (null/0) → ingen stapel.
const UNITS_HUE = 210;        // azurblå
const UNITS_SAT = 90;         // % — hög mättnad, aldrig grå
const UNITS_LIGHT = 45;       // %
const UNITS_ALPHA_MIN = 0.08;
const UNITS_ALPHA_MAX = 1.0;

function unitsIntensity(units: number | null | undefined): number | null {
  if (units == null || units <= 0) return null;
  let t: number;
  if (units <= 1) t = 0;
  else if (units <= 8) t = ((units - 1) / 7) * 0.5;          // 1→0, 8→0.5
  else if (units <= 20) t = 0.5 + ((units - 8) / 12) * 0.5;  // 8→0.5, 20→1
  else t = 1;
  return UNITS_ALPHA_MIN + (UNITS_ALPHA_MAX - UNITS_ALPHA_MIN) * t;
}


interface CaseCardProps {
  caseData: CaseRow;
  onClick: () => void;
  showSeller?: boolean;
  warnings?: string[];
  kmInbox?: boolean;
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

// Liggetid: [varningsdagar, röda dagar] per status. Statusar som saknas här visar aldrig chip.
const STATUS_DWELL: Record<string, [number, number]> = {
  ny: [7, 14],
  vantar_km: [7, 14],
  km_bokad: [14, 21],
  km_klar: [3, 7],
  vantar_godkannande: [3, 7],
  godkand: [35, 50],
  i_produktion: [35, 50],
  leverans_klar: [7, 14],
  montage_pagar: [7, 14],
  montage_klart: [14, 30],
};

function getDwellBadge(c: any): { label: string; tone: 'amber' | 'red' } | null {
  const th = STATUS_DWELL[c.status];
  if (!th) return null;
  const since: string | null = c.status_changed_at || c.created_at || null;
  if (!since) return null;
  const days = differenceInCalendarDays(new Date(), new Date(since));
  if (days >= th[1]) return { label: `${days} dagar i steget`, tone: 'red' };
  if (days >= th[0]) return { label: `${days} dagar i steget`, tone: 'amber' };
  return null;
}

export function CaseCard({ caseData, onClick, showSeller, warnings, kmInbox, hideFinancials }: CaseCardProps) {
  const tidsBadge = getScheduledDeliveryBadge(caseData as any);
  const deliveryBadge = getDeliveryCountdownBadge(caseData as any);
  const dwellBadge = getDwellBadge(caseData as any);
  const units = (caseData as any).units as number | null | undefined;
  const intensity = unitsIntensity(units);
  const cardStyle: CSSProperties | undefined = intensity != null
    ? {
        borderLeftWidth: 3,
        borderLeftColor: `hsla(${UNITS_HUE}, ${UNITS_SAT}%, ${UNITS_LIGHT}%, ${intensity})`,
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
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {units} st
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">–</span>
          )}
        </div>
      </div>
      {(deliveryBadge || tidsBadge || kmInbox || (warnings && warnings.length > 0)) && (
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
          {kmInbox && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
              <Ruler className="h-3 w-3" />
              KM-ändringar väntar
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
      <div className="pt-1">
        <KlimatKompenseradBadge caseId={caseData.id} compact />
      </div>
    </button>
  );
}
