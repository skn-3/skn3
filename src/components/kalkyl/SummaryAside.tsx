import { useState } from 'react';
import { ChevronUp, AlertTriangle, Info, Check, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  costMissingCount, kalkylTotals, marginInfo, rowNeedsAction, sortKontroller, summarizeKalkyl, summaryView,
  type KalkylData, type Kontroll, type PriceDisplay,
} from '@/lib/kalkyl';
import { useKalkylUi } from './context';
import { focusRing, motion } from './ui';
import { kr } from './format';

function Line({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', className)}>
      <span>{label}</span>
      <span className="font-mono tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

export function SummaryCard({ data, display, onDisplay }: { data: KalkylData; display: PriceDisplay; onDisplay: (d: PriceDisplay) => void }) {
  const { opts } = useKalkylUi();
  const v = summaryView(kalkylTotals(data, opts), summarizeKalkyl(data), display, opts);
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Summering">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Summering</h2>
        {opts.vat_mode === 'vanlig' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground min-h-[44px] cursor-pointer">
            Inkl. moms
            <Switch checked={display === 'inkl'} onCheckedChange={c => onDisplay(c ? 'inkl' : 'exkl')} aria-label="Visa priser inklusive moms" />
          </label>
        )}
      </div>
      <div className="space-y-1.5">
        <Line label="Material" value={kr(v.material)} />
        <Line label="Arbete" value={kr(v.arbete)} />
        <Line label="Övrigt" value={kr(v.ovrigt)} />
      </div>
      <div className="border-t border-border pt-3">
        <Line label={v.sumLabel} value={kr(v.sum)} className="font-semibold" />
        <div className="text-xs text-muted-foreground mt-0.5">{opts.vat_mode === 'omvand' ? v.vatLabel : `${v.vatLabel} ${kr(v.vat)}`}</div>
      </div>
      {v.rotActive && (
        <Line label={v.rotLabel + (v.rotCapped ? ', begränsat av taket' : '')} value={`−${kr(v.rot)}`} className="text-primary font-semibold" />
      )}
      <div className="rounded-lg bg-muted px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground">{v.payLabel}</div>
        <div className="font-display text-[30px] leading-tight font-semibold tabular-nums">{kr(v.pay)}</div>
      </div>
      {(opts.handpenning_percent ?? 25) > 0 && (
        <div className="space-y-1.5">
          <Line label={v.handpenningLabel} value={kr(v.handpenning)} />
          <Line label="Slutfaktura" value={kr(v.slutfaktura)} />
        </div>
      )}
    </section>
  );
}

export function InternalCard({ data, onOpenPriceList }: { data: KalkylData; onOpenPriceList: () => void }) {
  const { settings, customerMode } = useKalkylUi();
  if (customerMode) return null;
  const s = summarizeKalkyl(data);
  const m = marginInfo(s, settings);
  const missing = costMissingCount(data);
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Internt">
      <h2 className="font-display text-lg font-semibold">Internt</h2>
      {missing > 0 ? (
        <p className="text-sm">
          Kostnad saknas på {missing} {missing === 1 ? 'rad' : 'rader'}.{' '}
          <button type="button" onClick={onOpenPriceList} className={cn('min-h-[44px] font-semibold text-primary underline underline-offset-4', focusRing)}>Prislista</button>
        </p>
      ) : (
        <>
          <Line label="Täckningsbidrag" value={`${kr(m.tb)} · ${m.tb_pct == null ? '–' : m.tb_pct.toLocaleString('sv-SE')} %`} className="font-semibold" />
          <div className="relative h-2 rounded-full bg-muted" role="img" aria-label={`Täckningsbidrag ${m.tb_pct ?? 0} procent av målet ${m.target} procent`}>
            <div className={cn('absolute inset-y-0 left-0 rounded-full', m.reached ? 'bg-success' : 'bg-gold')} style={{ width: `${m.ratio * 100}%` }} />
          </div>
          <div className="text-xs text-muted-foreground">Mål {m.target} %</div>
        </>
      )}
    </section>
  );
}

const LEVEL_ICON = { atgard: AlertTriangle, info: Info, ok: Check } as const;

export function KontrollItem({ k, onShowRow, compact, action }: { k: Kontroll; onShowRow?: (rowId: string) => void; compact?: boolean; action?: React.ReactNode }) {
  const Icon = k.blocking ? Ban : LEVEL_ICON[k.level];
  return (
    <li className="flex gap-3 py-3">
      <span className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        k.blocking ? 'bg-destructive-soft text-destructive' : k.level === 'atgard' ? 'bg-warning-soft text-warning-ink' : k.level === 'ok' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{k.title}{k.blocking && <span className="ml-2 text-xs font-semibold text-destructive">Stoppar utskick</span>}</div>
        <p className="text-sm text-muted-foreground">{k.text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span>Källa: {k.source}</span>
          {!compact && k.row_id && onShowRow && (
            <button type="button" onClick={() => onShowRow(k.row_id!)} className={cn('min-h-[44px] font-semibold text-primary', focusRing)}>Visa rad</button>
          )}
        </div>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </li>
  );
}

export function KontrollCard({ data, kontroller, onShowRow }: { data: KalkylData; kontroller: Kontroll[]; onShowRow: (rowId: string) => void }) {
  const { customerMode } = useKalkylUi();
  if (customerMode) return null;
  const toFix = kontroller.filter(k => k.blocking || k.level === 'atgard').length;
  const clean = (data.rows ?? []).filter(r => !rowNeedsAction(kontroller, r.id)).length;
  const sorted = sortKontroller(kontroller);
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Kontroll">
      <h2 className="font-display text-lg font-semibold">Kontroll</h2>
      <p className="text-sm text-muted-foreground mt-0.5">
        <span className="font-mono tabular-nums">{toFix}</span> att åtgärda · <span className="font-mono tabular-nums">{clean}</span> {clean === 1 ? 'rad' : 'rader'} utan anmärkning
      </p>
      {sorted.length > 0 && <ul className="mt-1 divide-y divide-border">{sorted.map(k => <KontrollItem key={k.id} k={k} onShowRow={onShowRow} />)}</ul>}
    </section>
  );
}

/** Fält längst ner under 1024 px: "Att betala" som går att fälla ut. */
export function SummaryBar({ data, display, onDisplay, children }: { data: KalkylData; display: PriceDisplay; onDisplay: (d: PriceDisplay) => void; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { opts } = useKalkylUi();
  const v = summaryView(kalkylTotals(data, opts), summarizeKalkyl(data), display, opts);
  return (
    <div className="lg:hidden shrink-0 border-t border-border bg-card safe-bottom">
      {open && <div className="max-h-[60dvh] overflow-y-auto p-3 space-y-3 border-b border-border">{children ?? <SummaryCard data={data} display={display} onDisplay={onDisplay} />}</div>}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={cn('w-full min-h-[56px] flex items-center justify-between gap-3 px-4', motion, focusRing)}>
        <span className="text-sm font-medium">{v.payLabel}</span>
        <span className="flex items-center gap-2">
          <span className="font-display text-xl font-semibold tabular-nums">{kr(v.pay)}</span>
          <ChevronUp className={cn('h-5 w-5 transition-transform duration-[240ms] motion-reduce:transition-none', open ? '' : 'rotate-180')} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
