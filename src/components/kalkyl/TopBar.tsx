import { ArrowLeft, Eye, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { focusRing, motion } from './ui';
import { timeLabel } from './format';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Utkast', cls: 'bg-white/10 text-white' },
  sent: { label: 'Skickad', cls: 'bg-info-soft text-info' },
  accepted: { label: 'Accepterad', cls: 'bg-success-soft text-success' },
  declined: { label: 'Avböjd', cls: 'bg-destructive-soft text-destructive' },
};

export function TopBar({
  backLabel, onBack, eyebrow, title, status, savedAt, dirty, customerMode, onCustomerMode, onSave, onDone, saving, readOnly, doneLabel = 'Klar', showSave = true, onPreview,
}: {
  backLabel: string; onBack: () => void; eyebrow: string; title: string; status?: string | null; savedAt: Date | null; dirty: boolean;
  customerMode: boolean; onCustomerMode: (v: boolean) => void; onSave?: () => void; onDone: () => void; saving: boolean; readOnly: boolean;
  doneLabel?: string; showSave?: boolean;
  /** "Förhandsvisa": kundens offert byggd från kalkylen som den är just nu. */
  onPreview?: () => void;
}) {
  const st = status ? STATUS[status] ?? STATUS.draft : null;
  const btn = cn('min-h-[44px] rounded-lg px-4 text-sm', motion, focusRing, 'focus-visible:ring-offset-ink-deep disabled:opacity-50 disabled:cursor-not-allowed');
  return (
    <header className="h-16 shrink-0 bg-ink-deep text-white flex items-center gap-2 sm:gap-3 px-2 sm:px-4 safe-top">
      <button type="button" onClick={onBack} aria-label={backLabel}
        className={cn('h-11 w-11 shrink-0 rounded-lg flex items-center justify-center active:bg-white/10', motion, focusRing, 'focus-visible:ring-offset-ink-deep')}>
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink-muted leading-none truncate">{eyebrow}</div>
        <div className="flex items-center gap-2 min-w-0 mt-1">
          <h1 className="font-display text-lg sm:text-xl font-semibold leading-tight truncate">{title}</h1>
          {st && <span className={cn('hidden sm:inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', st.cls)}>{st.label}</span>}
          <span className="hidden md:inline text-xs text-ink-muted whitespace-nowrap" aria-live="polite">
            {readOnly ? 'Skrivskyddad' : saving ? 'Sparar…' : dirty || !savedAt ? 'Ej sparad' : `Sparad kl. ${timeLabel(savedAt)}`}
          </span>
        </div>
      </div>
      <label className="flex items-center gap-2 min-h-[44px] px-1 cursor-pointer select-none">
        <span className="text-sm hidden sm:inline">Kundläge</span>
        <Switch checked={customerMode} onCheckedChange={onCustomerMode} aria-label="Kundläge" className="data-[state=unchecked]:bg-white/25" />
      </label>
      {onPreview && (
        <button type="button" onClick={onPreview} aria-label="Förhandsvisa"
          className={cn(btn, 'inline-flex items-center gap-2 px-3 sm:px-4 border border-white/40 font-semibold active:bg-white/10')}>
          <Eye className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Förhandsvisa</span>
        </button>
      )}
      {showSave && onSave && !readOnly && (
        <button type="button" onClick={onSave} disabled={saving} className={cn(btn, 'hidden sm:inline-flex items-center border border-white/40 font-semibold active:bg-white/10')}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Sparar" /> : 'Spara'}
        </button>
      )}
      <button type="button" onClick={onDone} disabled={saving} className={cn(btn, 'bg-gold text-ink-deep font-bold active:brightness-95')}>
        {doneLabel}
      </button>
    </header>
  );
}
