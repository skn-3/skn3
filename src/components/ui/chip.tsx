import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_CLASS, statusChipClass, statusDotClass, statusLabel, type Tone } from '@/lib/statusTheme';

// Chip: en anatomi för alla små etiketter i appen.
// 24 px hög, 12 px text, en färg per betydelse (tone). Ikoner från lucide, aldrig emoji.

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export function Chip({ tone = 'neutral', dot, icon, size = 'sm', className, children, ...rest }: ChipProps) {
  const t = TONE_CLASS[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap leading-none',
        size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-[13px]',
        '[&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0',
        t.chip,
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', t.dot)} aria-hidden="true" />}
      {icon}
      {children}
    </span>
  );
}

export function StatusChip({ status, size = 'sm', className }: { status: string | null | undefined; size?: 'sm' | 'md'; className?: string }) {
  const done = status === 'montage_klart';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap leading-none',
        size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-[13px]',
        statusChipClass(status),
        className,
      )}
    >
      {done ? (
        <Check className="h-3 w-3 shrink-0 text-gold" strokeWidth={3} aria-hidden="true" />
      ) : (
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', statusDotClass(status))} aria-hidden="true" />
      )}
      {statusLabel(status)}
    </span>
  );
}

/** Liten räknare i mono, t.ex. antal i en kolumn eller flik. */
export function CountPill({ children, className, tone = 'neutral' }: { children: React.ReactNode; className?: string; tone?: 'neutral' | 'danger' | 'warning' | 'onDark' }) {
  const cls =
    tone === 'danger' ? 'bg-destructive-soft text-destructive'
    : tone === 'warning' ? 'bg-warning-soft text-warning-ink'
    : tone === 'onDark' ? 'bg-white/15 text-white'
    : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-medium leading-none', cls, className)}>
      {children}
    </span>
  );
}
