import { useState, type ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  displayAmount, golvPerM2, kontrollFix, marginInfo, rowFigures, roomOf, sortKontroller,
  type KalkylData, type KalkylRow, type Kontroll, type KontrollFix,
} from '@/lib/kalkyl';
import { Button } from '@/components/ui/button';
import { useKalkylUi } from './context';
import { Segmented, focusRing, motion } from './ui';
import { kr } from './format';
import { KontrollItem } from './SummaryAside';

type Tab = 'settings' | 'drawing' | 'extras';

/**
 * Tre kolumner från 1024 px (318 px, flex, 360 px). 768–1023 px: ritningen överst i full bredd och
 * sidokolumnerna under. Under 768 px: en kolumn med växeln Inställningar, Ritning, Tillbehör.
 */
export function ConfiguratorShell({ left, center, right, footer, rightLabel = 'Tillbehör' }: {
  left: ReactNode; center: ReactNode; right: ReactNode; footer: ReactNode; rightLabel?: string;
}) {
  const [tab, setTab] = useState<Tab>('settings');
  const side = 'bg-card border-border';
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="md:hidden shrink-0 border-b border-border bg-card px-3 py-2">
        <Segmented label="Visa" value={tab} onChange={setTab} className="w-full" size="lg"
          options={[{ value: 'settings', label: 'Inställningar' }, { value: 'drawing', label: 'Ritning' }, { value: 'extras', label: rightLabel }]} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden md:grid md:grid-cols-2 md:content-start lg:grid-cols-[318px_minmax(0,1fr)_360px] lg:content-stretch">
        <section aria-label="Inställningar"
          className={cn(side, 'md:order-2 lg:order-1 md:border-r lg:min-h-0 lg:overflow-y-auto p-4 space-y-6', tab !== 'settings' && 'hidden md:block')}>
          {left}
        </section>
        <section aria-label="Ritning"
          className={cn('bg-background md:order-1 md:col-span-2 lg:col-span-1 lg:order-2 lg:min-h-0 lg:overflow-y-auto p-4 space-y-4 md:border-b lg:border-b-0', tab !== 'drawing' && 'hidden md:block')}>
          {center}
        </section>
        <section aria-label={rightLabel}
          className={cn(side, 'md:order-3 lg:border-l lg:min-h-0 lg:flex lg:flex-col', tab !== 'extras' && 'hidden md:block lg:flex')}>
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto p-4 space-y-4">{right}</div>
          <div className="hidden lg:block border-t border-border">{footer}</div>
        </section>
      </div>
      <div className="lg:hidden shrink-0 border-t border-border bg-card safe-bottom">{footer}</div>
    </div>
  );
}

function FLine({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', className)}>
      <span>{label}</span><span className="font-mono tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

/** Prisfältet för en kalkylrad. Under 1024 px kompakt och utfällbart. */
export function PriceFooter({ data, row }: { data: KalkylData; row: KalkylRow }) {
  const { opts, display, customerMode, settings } = useKalkylUi();
  const [open, setOpen] = useState(false);
  const f = rowFigures(data, row.id, opts);
  if (!f) return null;
  const mode = opts.vat_mode === 'omvand' ? 'exkl' : display;
  const show = (v: number) => displayAmount(v, mode);
  const incl = mode === 'inkl';
  const perM2 = golvPerM2(row, roomOf(data, row));
  const m = marginInfo(f.summary, settings);
  const rot = opts.rot_enabled && f.totals.rot_amount > 0;
  const sum = incl ? f.totals.total_incl_vat : f.totals.total_ex_vat;
  const details = (
    <div className="space-y-1.5">
      <FLine label="Material" value={kr(show(f.summary.material))} />
      <FLine label="Arbete" value={kr(show(f.summary.arbete))} />
      <FLine label="Övrigt" value={kr(show(f.summary.ovrigt))} />
      {rot && <FLine label={`ROT-avdrag ${opts.rot_percent} %`} value={`−${kr(f.totals.rot_amount)}`} className="text-primary font-semibold" />}
      {rot && <FLine label="Efter ROT" value={kr(f.totals.total_after_rot)} className="font-semibold" />}
      {perM2 != null && <FLine label="Golv och läggning per m²" value={`${kr(show(perM2))}/m²`} className="text-muted-foreground" />}
      {!customerMode && (
        <FLine label="Täckningsbidrag" value={f.summary.cost_known ? `${kr(m.tb)} · ${m.tb_pct?.toLocaleString('sv-SE') ?? '–'} %` : 'Kostnad saknas'} className="text-muted-foreground" />
      )}
    </div>
  );
  return (
    <div className="p-4">
      <div className="hidden lg:block space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{incl ? 'Summa inkl. moms' : 'Summa exkl. moms'}</span>
          <span className="font-mono text-[22px] font-semibold tabular-nums">{kr(sum)}</span>
        </div>
        {details}
      </div>
      <div className="lg:hidden">
        {open && <div className="mb-3">{details}</div>}
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className={cn('w-full min-h-[44px] flex items-center justify-between gap-3', motion, focusRing)}>
          <span className="text-sm font-semibold">{rot ? 'Efter ROT' : incl ? 'Summa inkl. moms' : 'Summa exkl. moms'}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-xl font-semibold tabular-nums">{kr(rot ? f.totals.total_after_rot : sum)}</span>
            <ChevronUp className={cn('h-5 w-5 transition-transform duration-[240ms] motion-reduce:transition-none', !open && 'rotate-180')} aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}

/** Kontrollkortet för en rad, med knapp för det som går att åtgärda direkt. */
export function RowKontroller({ kontroller, rowId, onFix }: { kontroller: Kontroll[]; rowId: string; onFix: (fix: KontrollFix) => void }) {
  const { customerMode, readOnly } = useKalkylUi();
  if (customerMode) return null;
  const list = sortKontroller(kontroller.filter(k => k.row_id === rowId));
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Kontroll för raden">
      <h3 className="font-display text-base font-semibold">Kontroll</h3>
      {list.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Inga anmärkningar på den här raden.</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map(k => {
            const fix = kontrollFix(k);
            return (
              <KontrollItem key={k.id} k={k} compact action={fix && !readOnly
                ? <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => onFix(fix)}>{fix.label}</Button>
                : undefined} />
            );
          })}
        </ul>
      )}
    </section>
  );
}
