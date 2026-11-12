import { useEffect, useId, useState, type ReactNode } from 'react';
import { Minus, Plus, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseSvNumber } from '@/lib/kalkyl';
import { dec } from './format';

/** Gemensam fokusring för kalkylvyns knappar. */
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
export const motion = 'transition-colors duration-[160ms] motion-reduce:transition-none';

export function Segmented<T extends string>({ value, options, onChange, label, disabled, className, size = 'md' }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean; className?: string; size?: 'md' | 'lg';
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-lg border border-border bg-muted p-1 gap-1', className)}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-md px-3 text-sm font-semibold', size === 'lg' ? 'min-h-[44px]' : 'min-h-[40px]',
              motion, focusRing,
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground active:bg-background',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Mått med − och +, tryck på värdet för att skriva (decimalkomma). */
export function DimField({ label, value, onChange, step = 0.1, min = 0, max = 99, unit = 'm', decimals = 2, integer, disabled }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; decimals?: number; integer?: boolean; disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(dec(value, decimals));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(dec(value, decimals)); setError(null); }, [value, decimals]);
  const clamp = (v: number) => Math.min(max, Math.max(min, integer ? Math.round(v) : Math.round(v * 100) / 100));
  const commit = () => {
    const n = parseSvNumber(text);
    if (n == null || n === 'invalid' || !Number.isFinite(n)) { setError(`Skriv ett tal, t.ex. ${integer ? '2' : '4,2'}.`); return; }
    if (n < min || n > max) { setError(`Värdet ska vara mellan ${dec(min)} och ${dec(max)}.`); return; }
    setError(null);
    onChange(clamp(n));
  };
  const btn = cn('h-11 w-11 shrink-0 rounded-lg border border-border bg-background flex items-center justify-center', motion, focusRing,
    'active:bg-muted disabled:opacity-40 disabled:cursor-not-allowed');
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} aria-label={`Minska ${label.toLowerCase()}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))}>
          <Minus className="h-4 w-4" />
        </button>
        <div className="relative flex-1 min-w-0">
          <input
            id={id}
            inputMode={integer ? 'numeric' : 'decimal'}
            value={text}
            disabled={disabled}
            aria-invalid={!!error}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
            className={cn(
              'h-11 w-full rounded-lg border bg-background px-2 pr-8 text-center font-mono tabular-nums text-base',
              focusRing, error ? 'border-destructive' : 'border-input', 'disabled:opacity-60',
            )}
          />
          {unit && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}
        </div>
        <button type="button" className={btn} aria-label={`Öka ${label.toLowerCase()}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
      {aside}
    </div>
  );
}

export function StatusDot({ warn, label }: { warn: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        warn ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success')}
    >
      {warn ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

/** Pris i monotext. */
export function Money({ value, className }: { value: string; className?: string }) {
  return <span className={cn('font-mono tabular-nums whitespace-nowrap', className)}>{value}</span>;
}
