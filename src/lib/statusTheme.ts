// Ett statusspråk för hela appen.
// Samma färg för samma betydelse i pipeline, montörvy, kundsida och PDF.
// Alla klasser pekar på tokens i index.css, så mörkt läge följer med automatiskt.
import { STATUS_LABELS } from '@/lib/constants';

export type Tone =
  | 'neutral'
  | 'sage'
  | 'sageStrong'
  | 'info'
  | 'infoFilled'
  | 'warning'
  | 'danger'
  | 'success'
  | 'successFilled'
  | 'ink';

export const TONE_CLASS: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-muted text-foreground/80', dot: 'bg-muted-foreground/60' },
  sage: { chip: 'bg-secondary text-secondary-foreground', dot: 'bg-sage' },
  sageStrong: { chip: 'bg-secondary-foreground text-secondary', dot: 'bg-secondary' },
  info: { chip: 'bg-info-soft text-info', dot: 'bg-info' },
  infoFilled: { chip: 'bg-info text-info-foreground', dot: 'bg-info-foreground' },
  warning: { chip: 'bg-warning-soft text-warning-ink', dot: 'bg-gold' },
  danger: { chip: 'bg-destructive-soft text-destructive', dot: 'bg-destructive' },
  success: { chip: 'bg-success-soft text-success', dot: 'bg-success' },
  successFilled: { chip: 'bg-primary text-primary-foreground', dot: 'bg-gold' },
  ink: { chip: 'bg-foreground text-background', dot: 'bg-gold' },
};

export type Phase = 'forsaljning' | 'matning' | 'beslut' | 'leverans' | 'montage' | 'avslut';

export const PHASES: Array<{ value: Phase; label: string; statuses: string[]; textClass: string; lineClass: string }> = [
  { value: 'forsaljning', label: 'Försäljning', statuses: ['ny'], textClass: 'text-muted-foreground', lineClass: 'border-border' },
  { value: 'matning', label: 'Mätning', statuses: ['vantar_km', 'km_bokad', 'km_klar'], textClass: 'text-sage', lineClass: 'border-secondary' },
  { value: 'beslut', label: 'Beslut', statuses: ['vantar_godkannande', 'godkand'], textClass: 'text-warning-ink', lineClass: 'border-warning-soft' },
  { value: 'leverans', label: 'Leverans', statuses: ['i_produktion', 'leverans_klar'], textClass: 'text-info', lineClass: 'border-info-soft' },
  { value: 'montage', label: 'Montage', statuses: ['montage_bokat', 'montage_pagar', 'montage_klart'], textClass: 'text-primary', lineClass: 'border-success-soft' },
  { value: 'avslut', label: 'Avslut', statuses: ['fakturerad', 'pausad'], textClass: 'text-foreground', lineClass: 'border-border-strong' },
];

export const STATUS_TONE: Record<string, Tone> = {
  ny: 'neutral',
  vantar_km: 'sage',
  km_bokad: 'sage',
  km_klar: 'sageStrong',
  vantar_godkannande: 'warning',
  godkand: 'success',
  i_produktion: 'info',
  leverans_klar: 'infoFilled',
  montage_bokat: 'success',
  montage_pagar: 'successFilled',
  montage_klart: 'successFilled',
  fakturerad: 'ink',
  pausad: 'danger',
};

export function statusTone(status: string | null | undefined): Tone {
  return (status && STATUS_TONE[status]) || 'neutral';
}

export function statusChipClass(status: string | null | undefined): string {
  return TONE_CLASS[statusTone(status)].chip;
}

export function statusDotClass(status: string | null | undefined): string {
  return TONE_CLASS[statusTone(status)].dot;
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  const text = status.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—';
}

export function phaseOf(status: string | null | undefined): (typeof PHASES)[number] | undefined {
  return PHASES.find((p) => !!status && p.statuses.includes(status));
}

/** Första statusen i varje fas – används för att rita fasrubriken över rätt kolumn. */
export function isFirstInPhase(status: string): boolean {
  const p = phaseOf(status);
  return !!p && p.statuses[0] === status;
}
