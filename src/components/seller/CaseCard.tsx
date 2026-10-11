import type { ReactNode } from 'react';
import type { CaseRow } from '@/lib/supabaseClient';
import { AlertTriangle, Clock, Ruler, Check, Truck } from 'lucide-react';
import { sellerStepsFor } from '@/lib/sellerSteps';
import { differenceInCalendarDays, startOfISOWeek } from 'date-fns';
import { KlimatKompenseradBadge } from '@/components/shared/KlimatKompenseradBadge';
import { Chip } from '@/components/ui/chip';
import type { Tone } from '@/lib/statusTheme';

const DELIVERY_RELEVANT_STATUSES = new Set([
  'godkand', 'i_produktion', 'leverans_klar', 'montage_bokat',
]);

type DeliveryBadge = { label: string; tone: 'red' | 'orange' | 'yellow' | 'gray'; delivered?: boolean };

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
  const daysToEarliest = differenceInCalendarDays(isWeekBased ? (weekStartDate ?? refDate) : refDate, today);
  const daysToEnd = differenceInCalendarDays(refDate, today);

  if (daysToEnd < 0) return { label: 'Levererad', tone: 'gray', delivered: true };

  if (isWeekBased) {
    const weekTxt = `v${dw}`;
    if (daysToEarliest <= 0) return { label: `Leverans ${weekTxt} · denna vecka`, tone: 'red' };
    if (daysToEarliest <= 3) return { label: `Leverans ${weekTxt} · om ${daysToEarliest} dag${daysToEarliest === 1 ? '' : 'ar'}`, tone: 'red' };
    if (daysToEarliest <= 7) return { label: `Leverans ${weekTxt} · om ${daysToEarliest} dagar`, tone: 'orange' };
    if (daysToEarliest <= 14) return { label: `Leverans ${weekTxt} · om ${daysToEarliest} dagar`, tone: 'yellow' };
    return { label: `Leverans ${weekTxt}`, tone: 'gray' };
  }

  const dateTxt = refDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  if (daysToEnd === 0) return { label: 'Levereras i dag', tone: 'red' };
  if (daysToEnd <= 3) return { label: `Leverans om ${daysToEnd} dag${daysToEnd === 1 ? '' : 'ar'}`, tone: 'red' };
  if (daysToEnd <= 7) return { label: `Leverans om ${daysToEnd} dagar`, tone: 'orange' };
  if (daysToEnd <= 14) return { label: `Leverans om ${daysToEnd} dagar`, tone: 'yellow' };
  return { label: `Leverans ${dateTxt}`, tone: 'gray' };
}

const DELIVERY_TONE: Record<DeliveryBadge['tone'], Tone> = {
  red: 'danger',
  orange: 'warning',
  yellow: 'warning',
  gray: 'neutral',
};

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
  if (dt) return { label: `Tidsstyrd kl ${String(dt).slice(0, 5)}`, urgent: false };
  if (daysUntil != null && daysUntil <= 14 && daysUntil >= -1) {
    return { label: 'Tidsstyrd – tid saknas', urgent: true };
  }
  return { label: 'Tidsstyrd leverans', urgent: false };
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
  if (days >= th[1]) return { label: `${days} dagar här`, tone: 'red' };
  if (days >= th[0]) return { label: `${days} dagar här`, tone: 'amber' };
  return null;
}

type CardChip = { key: string; tone: Tone; icon?: ReactNode; label: string };
const MAX_CHIPS = 3;

export function CaseCard({ caseData, onClick, showSeller, warnings, kmInbox, hideFinancials }: CaseCardProps) {
  const tidsBadge = getScheduledDeliveryBadge(caseData as any);
  const deliveryBadge = getDeliveryCountdownBadge(caseData as any);
  const dwellBadge = getDwellBadge(caseData as any);
  const hoursBadge = (caseData as any).extra_hours_requested > 0
    && (caseData as any).extra_hours_approved === 0
    && caseData.status === 'vantar_godkannande';
  const units = (caseData as any).units as number | null | undefined;
  const steps = sellerStepsFor(caseData as any);
  const stepsMissing = steps.applicable && steps.incomplete;

  // Chips i prioritetsordning: det som kräver handling först. Max tre syns, resten räknas.
  const chips: CardChip[] = [];
  if (stepsMissing) {
    const missing = [!steps.hoursDone ? 'timmar' : null, !steps.deliveryDone ? 'leveransvecka' : null].filter(Boolean);
    chips.push({ key: 'steps', tone: 'danger', icon: <AlertTriangle />, label: `${missing.join(' + ') || 'Uppgifter'} saknas` });
  }
  if (tidsBadge?.urgent) chips.push({ key: 'tids', tone: 'danger', icon: <Clock />, label: tidsBadge.label });
  if (hoursBadge) chips.push({ key: 'hours', tone: 'warning', icon: <Clock />, label: 'Timmar att godkänna' });
  if (deliveryBadge && deliveryBadge.tone === 'red') chips.push({ key: 'delivery', tone: 'danger', icon: <Truck />, label: deliveryBadge.label });
  if (dwellBadge?.tone === 'red') chips.push({ key: 'dwell', tone: 'danger', icon: <Clock />, label: dwellBadge.label });
  warnings?.forEach((w, i) => chips.push({ key: `warn${i}`, tone: 'warning', icon: <AlertTriangle />, label: w }));
  if (kmInbox) chips.push({ key: 'km', tone: 'info', icon: <Ruler />, label: 'KM-ändringar väntar' });
  if (deliveryBadge && deliveryBadge.tone !== 'red') {
    chips.push({
      key: 'delivery',
      tone: deliveryBadge.delivered ? 'success' : DELIVERY_TONE[deliveryBadge.tone],
      icon: deliveryBadge.delivered ? <Check /> : <Truck />,
      label: deliveryBadge.label,
    });
  }
  if (dwellBadge?.tone === 'amber') chips.push({ key: 'dwell', tone: 'warning', icon: <Clock />, label: dwellBadge.label });
  if (tidsBadge && !tidsBadge.urgent) chips.push({ key: 'tids', tone: 'info', icon: <Clock />, label: tidsBadge.label });

  const shown = chips.slice(0, MAX_CHIPS);
  const rest = chips.slice(MAX_CHIPS);
  const attention = stepsMissing || tidsBadge?.urgent || dwellBadge?.tone === 'red' || deliveryBadge?.tone === 'red';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border bg-card p-3.5 shadow-card card-lift animate-fade-up flex flex-col gap-2 ${
        attention ? 'border-l-[3px] border-l-destructive' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display font-semibold text-[15px] leading-tight text-card-foreground">{caseData.address}</h3>
        {units != null && units > 0 && (
          <span className="shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">{units} st</span>
        )}
      </div>

      <div className="text-[13px] text-muted-foreground truncate">
        {caseData.customer_name}
        {caseData.team ? ` · ${caseData.team}` : ''}
        {showSeller && !hideFinancials ? ` · ${caseData.seller || 'säljare saknas'}` : ''}
      </div>

      {(caseData.order_value && !hideFinancials) || shown.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          {caseData.order_value && !hideFinancials ? (
            <span className="font-mono text-[13px] text-foreground">
              {Number(caseData.order_value).toLocaleString('sv-SE')} kr
            </span>
          ) : <span />}
          {shown.length > 0 && (
            <Chip tone={shown[0].tone} icon={shown[0].icon} className="min-w-0 max-w-full [&>span:last-child]:truncate">
              <span>{shown[0].label}</span>
            </Chip>
          )}
        </div>
      ) : null}

      {(shown.length > 1 || rest.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.slice(1).map((c) => (
            <Chip key={c.key} tone={c.tone} icon={c.icon}>{c.label}</Chip>
          ))}
          {rest.length > 0 && (
            <Chip tone="neutral" title={rest.map((c) => c.label).join(' · ')}>+{rest.length}</Chip>
          )}
        </div>
      )}

      <KlimatKompenseradBadge caseId={caseData.id} compact />
    </button>
  );
}
