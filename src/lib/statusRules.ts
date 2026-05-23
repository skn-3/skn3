import type { CaseRow } from '@/lib/supabaseClient';
import { getISOWeek, getISOWeekYear, endOfISOWeek } from 'date-fns';

export type StatusCheck = { ok: boolean; reason?: string };

type CaseLike = Partial<CaseRow> & Record<string, any>;

/**
 * Whether `caseData` may transition into `newStatus` based on business rules.
 * Returns { ok: false, reason } when forbidden — caller decides whether to
 * block, warn or allow admin override.
 */
export function canEnterStatus(newStatus: string, c: CaseLike): StatusCheck {
  switch (newStatus) {
    case 'montage_bokat':
      if (!c.team) return { ok: false, reason: 'Montage-montör måste tilldelas först' };
      if (!c.montage_date) return { ok: false, reason: 'Montagedatum måste sättas först' };
      return { ok: true };

    case 'leverans_klar': {
      const dw = (c as any).delivery_week;
      if (!c.delivery_date && !dw) {
        return { ok: false, reason: 'Inget leveransdatum/vecka angivet' };
      }
      return { ok: true };
    }

    case 'montage_klart':
      if (c.status !== 'montage_bokat') {
        return { ok: false, reason: 'Montage måste vara bokat först' };
      }
      return { ok: true };

    case 'fakturerad':
      if (c.status !== 'montage_klart') {
        return { ok: false, reason: 'Montage måste vara klart först' };
      }
      return { ok: true };

    default:
      return { ok: true };
  }
}

/** True if the given ISO week (year+week) has fully passed (end-of-week < today). */
function isWeekPassed(year: number, week: number): boolean {
  // Pick a date inside the target ISO week (Jan 4 is always in week 1)
  const jan4 = new Date(year, 0, 4);
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() + (week - getISOWeek(jan4)) * 7);
  const end = endOfISOWeek(weekStart);
  return end.getTime() < Date.now();
}

/** What the status SHOULD be based on delivery facts. */
export function deriveDeliveryStatus(c: CaseLike): 'leverans_klar' | 'godkand' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (c.delivery_date) {
    const d = new Date(c.delivery_date);
    if (d.getTime() < today.getTime()) return 'leverans_klar';
  }
  const dw = (c as any).delivery_week as number | null | undefined;
  const dy = (c as any).delivery_year as number | null | undefined;
  if (dw && dy && isWeekPassed(dy, dw)) return 'leverans_klar';
  return 'godkand';
}

export type PipelineIssue = {
  case: CaseRow;
  currentStatus: string;
  suggestedStatus: string | null; // null = manual review
  reason: string;
};

const STATUS_ORDER = [
  'ny', 'vantar_km', 'km_bokad', 'km_klar', 'vantar_godkannande',
  'godkand', 'leverans_klar', 'montage_bokat', 'montage_klart', 'fakturerad',
];

function statusIdx(s: string): number {
  return STATUS_ORDER.indexOf(s);
}

export function findPipelineIssues(cases: CaseRow[]): PipelineIssue[] {
  const issues: PipelineIssue[] = [];
  for (const c of cases) {
    // 1) montage_bokat without team or montage_date
    if (c.status === 'montage_bokat' && (!c.team || !c.montage_date)) {
      const suggested = deriveDeliveryStatus(c);
      const missing = [!c.team && 'montör', !c.montage_date && 'montagedatum'].filter(Boolean).join(' + ');
      issues.push({
        case: c,
        currentStatus: c.status,
        suggestedStatus: suggested,
        reason: `Saknar ${missing} för montage_bokat`,
      });
      continue;
    }

    // 2) leverans_klar but no delivery info
    if (c.status === 'leverans_klar' && !c.delivery_date && !(c as any).delivery_week) {
      issues.push({
        case: c,
        currentStatus: c.status,
        suggestedStatus: null,
        reason: 'Status "leverans_klar" men inget leveransdatum eller vecka',
      });
      continue;
    }

    // 3) status later than km_klar but no km_date
    if (statusIdx(c.status) >= statusIdx('km_klar') && !c.km_date && c.status !== 'pausad') {
      issues.push({
        case: c,
        currentStatus: c.status,
        suggestedStatus: null,
        reason: `Status "${c.status}" men inget KM-datum`,
      });
    }
  }
  return issues;
}
