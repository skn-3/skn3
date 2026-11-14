// Färg efter betydelse för bokningar i schemat. Bara designtokens.
import type { ScheduleEvent, ScheduleKind } from '@/lib/schedule';

export function eventClasses(e: Pick<ScheduleEvent, 'kind' | 'state' | 'weekBased'>): string {
  switch (e.kind) {
    case 'montage':
      if (e.state === 'pagar') return 'bg-primary text-primary-foreground border border-primary';
      if (e.state === 'klar') return 'bg-muted text-muted-foreground border border-border';
      return 'bg-success-soft text-primary border border-primary/25';
    case 'km':
      return e.state === 'klar' ? 'bg-muted text-muted-foreground border border-border' : 'bg-secondary text-secondary-foreground border border-secondary-foreground/20';
    case 'leverans':
      return e.weekBased ? 'bg-info-soft text-info border border-dashed border-info/60 schedule-stripes-info' : 'bg-info-soft text-info border border-info/25';
    case 'hamtning':
      return 'bg-card text-foreground border border-border-strong';
  }
}

/** Färgprick för typchips och förklaringar. */
export const KIND_DOT: Record<ScheduleKind, string> = {
  montage: 'bg-primary',
  km: 'bg-secondary-foreground',
  leverans: 'bg-info',
  hamtning: 'bg-border-strong',
};

/** Segmenterad kontroll: gemensamt utseende för knapparna. */
export function segmentClasses(active: boolean): string {
  return [
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold motion-safe:transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
  ].join(' ');
}
