import { forwardRef } from 'react';
import { ChevronDown, Plus, LayoutGrid, Settings2, Replace, Copy, ArrowUp, ArrowDown, Trash2, X, Percent, CirclePlus, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  resolveSlotItem, displayAmount, isGrenRow, rowTypeLabel, rowFigures, rowLines, rowNeedsAction, rowQuantityLabel, rowSpecText, roomOf, lineQtyText,
  type GolvInput, type KalkylData, type KalkylRow, type Kontroll, type MalningInput,
} from '@/lib/kalkyl';
import { PriceSwatch } from '@/components/offers/priceList/PriceSwatch';
import { useKalkylUi } from './context';
import { RoomPlan, KulorSwatch } from './drawings';
import { focusRing, motion, StatusDot } from './ui';
import { kr } from './format';


export interface RowActions {
  onConfigure: (rowId: string) => void;
  onChangeMaterial: (rowId: string) => void;
  onDuplicate: (rowId: string) => void;
  onMove: (rowId: string, dir: 'up' | 'down') => void;
  onRemove: (rowId: string) => void;
  /** Gör raden till tillval (true) eller räkna in den i summan igen (false). */
  onOptional: (rowId: string, optional: boolean) => void;
}

function RowSwatch({ row }: { row: KalkylRow }) {
  const { prices } = useKalkylUi();
  if (row.trade === 'golv' && row.input) {
    const inp = row.input as GolvInput;
    const mat = prices[inp.material_code];
    const sockel = inp.sockel ? resolveSlotItem('golv.sockel', inp.selections, prices) ?? null : null;
    return (
      <div className="flex items-center gap-2 min-w-0">
        {mat ? <PriceSwatch item={mat} className="h-6 w-6 rounded" /> : <span className="h-6 w-6 rounded border border-dashed border-border" aria-hidden="true" />}
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] truncate">{mat?.name ?? 'Inget material'}</div>
          {sockel?.color_code && <div className="text-xs text-muted-foreground truncate">Sockel <span className="font-mono">{sockel.color_code}</span></div>}
        </div>
      </div>
    );
  }
  if (row.trade === 'malning' && row.input) {
    const inp = row.input as MalningInput;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <KulorSwatch kulor={inp.kulor_vagg} size={24} className="rounded" />
        <div className="min-w-0 leading-tight">
          <div className="text-[13px] font-mono truncate">{inp.kulor_vagg?.code ?? 'Ingen kulör'}</div>
          {inp.tak && <div className="text-xs text-muted-foreground truncate">Tak <span className="font-mono">{inp.kulor_tak?.code ?? '–'}</span></div>}
        </div>
      </div>
    );
  }
  return null;
}

function ExpandedRow({ data, row, actions, index, count }: { data: KalkylData; row: KalkylRow; actions: RowActions; index: number; count: number }) {
  const { opts, display, readOnly } = useKalkylUi();
  const f = rowFigures(data, row.id, opts);
  if (!f) return null;
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const lines = rowLines(row);
  const btn = cn('min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted disabled:opacity-40 disabled:cursor-not-allowed', motion, focusRing);
  return (
    <div className="border-t border-border px-3 sm:px-4 py-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-4">
        <ul className="divide-y divide-border text-sm">
          {lines.length === 0 && <li className="py-2 text-muted-foreground">Inga rader ännu. Tryck Konfigurera för att lägga till.</li>}
          {lines.map(l => (
            <li key={l.key} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span>{l.description}</span>
                <span className="text-muted-foreground"> · {lineQtyText(l)}</span>
                {l.unit_price == null && <span className="ml-2 text-xs font-semibold text-destructive">Pris saknas</span>}
              </span>
              <span className="font-mono tabular-nums whitespace-nowrap">{kr(show(l.amount))}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg bg-muted p-3 space-y-2 text-sm self-start">
          {([['Material', f.summary.material, 'bg-sage'], ['Arbete', f.summary.arbete, 'bg-primary'], ['Övrigt', f.summary.ovrigt, 'bg-gold']] as const).map(([label, v, dot]) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden="true" />{label}</span>
              <span className="font-mono tabular-nums">{kr(show(v))}</span>
            </div>
          ))}
          <div className="flex h-2 overflow-hidden rounded-full bg-background" role="img"
            aria-label={`Material ${f.shares.material} %, arbete ${f.shares.arbete} %, övrigt ${f.shares.ovrigt} %`}>
            <div className="bg-sage" style={{ width: `${f.shares.material}%` }} />
            <div className="bg-primary" style={{ width: `${f.shares.arbete}%` }} />
            <div className="bg-gold" style={{ width: `${f.shares.ovrigt}%` }} />
          </div>
          {opts.rot_enabled && f.totals.rot_uncapped > 0 && (
            <div className="flex justify-between text-primary font-semibold"><span>ROT-avdrag</span><span className="font-mono tabular-nums">−{kr(f.totals.rot_uncapped)}</span></div>
          )}
          {f.per_m2 != null && (
            <div className="flex justify-between text-muted-foreground"><span>Per m² golvyta</span><span className="font-mono tabular-nums">{kr(show(f.per_m2))}/m²</span></div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-[44px] gap-2" onClick={() => actions.onConfigure(row.id)}>
          <Settings2 className="h-4 w-4" aria-hidden="true" /> {readOnly ? 'Visa' : 'Konfigurera'}
        </Button>
        {!readOnly && (
          <>
            {row.trade !== 'fri' && <button type="button" className={btn} onClick={() => actions.onChangeMaterial(row.id)}><Replace className="h-4 w-4" aria-hidden="true" />{row.trade === 'golv' ? 'Byt material' : 'Byt kulör'}</button>}
            <button type="button" className={btn} onClick={() => actions.onOptional(row.id, !row.optional)}>
              {row.optional ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <CirclePlus className="h-4 w-4" aria-hidden="true" />}
              {row.optional ? 'Räkna in i summan' : 'Gör till tillval'}
            </button>
            <button type="button" className={btn} onClick={() => actions.onDuplicate(row.id)}><Copy className="h-4 w-4" aria-hidden="true" />Duplicera</button>
            <button type="button" className={btn} disabled={index === 0} onClick={() => actions.onMove(row.id, 'up')}><ArrowUp className="h-4 w-4" aria-hidden="true" />Flytta upp</button>
            <button type="button" className={btn} disabled={index === count - 1} onClick={() => actions.onMove(row.id, 'down')}><ArrowDown className="h-4 w-4" aria-hidden="true" />Flytta ner</button>
            <button type="button" className={cn(btn, 'text-destructive')} onClick={() => actions.onRemove(row.id)}><Trash2 className="h-4 w-4" aria-hidden="true" />Ta bort</button>
          </>
        )}
      </div>
    </div>
  );
}

export const OverviewRow = forwardRef<HTMLDivElement, {
  data: KalkylData; row: KalkylRow; kontroller: Kontroll[]; expanded: boolean; onToggle: () => void; actions: RowActions; index: number; count: number;
}>(function OverviewRow({ data, row, kontroller, expanded, onToggle, actions, index, count }, ref) {
  const { prices, settings, opts, display, customerMode, items } = useKalkylUi();
  const room = roomOf(data, row);
  const f = rowFigures(data, row.id, opts);
  const total = f ? displayAmount(f.summary.total_ex_vat, opts.vat_mode === 'omvand' ? 'exkl' : display) : 0;
  const warn = rowNeedsAction(kontroller, row.id);
  const mat = row.trade === 'golv' && row.input ? prices[(row.input as GolvInput).material_code] : null;
  const title = room ? room.name : row.title;
  const optional = row.optional === true;
  void items;
  return (
    <div ref={ref} className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-4">
      <button type="button" onClick={onToggle} aria-expanded={expanded}
        className={cn('w-full min-h-[72px] flex items-center gap-3 px-3 sm:px-4 py-2 text-left active:bg-muted/60', motion, focusRing, 'focus-visible:ring-inset focus-visible:ring-offset-0')}>
        <span className="hidden sm:block h-12 w-16 shrink-0 rounded bg-muted/50">
          {room && <RoomPlan dims={room.dims} item={mat} direction={(row.input as GolvInput | null)?.direction ?? 'langs'} settings={settings} width={64} height={48} mini title={`Miniritning ${title}`} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-semibold truncate">{title}</span>
            <span className="min-w-0 max-w-[60%] truncate inline-block h-6 leading-6 rounded-full bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground">{room && row.trade === 'fri' && !isGrenRow(row) ? row.title : rowTypeLabel(row)}</span>
            {optional && <span className="shrink-0 inline-block h-6 leading-6 rounded-full border border-gold bg-gold-soft px-2.5 text-xs font-semibold text-gold-ink">Tillval</span>}
          </span>
          <span className="block text-[13px] text-muted-foreground truncate">{rowSpecText(row, prices)}</span>
        </span>
        <span className="hidden md:block w-44 shrink-0"><RowSwatch row={row} /></span>
        <span className="hidden sm:block w-28 shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">{rowQuantityLabel(row, room, settings)}</span>
        <span className={cn('w-28 shrink-0 text-right font-mono text-[15px] tabular-nums', optional ? 'font-normal text-muted-foreground' : 'font-semibold')}
          aria-label={optional ? `Tillval ${kr(total)}, ingår inte i summan` : undefined}>{optional ? `+ ${kr(total)}` : kr(total)}</span>
        {!customerMode && <StatusDot warn={warn} label={warn ? 'Raden har en kontroll att åtgärda' : 'Inga anmärkningar'} />}
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-[160ms] motion-reduce:transition-none', expanded && 'rotate-180')} aria-hidden="true" />
      </button>
      {expanded && <ExpandedRow data={data} row={row} actions={actions} index={index} count={count} />}
    </div>
  );
});

export function CommonSection({ data, onAddCommon, onAddAdjustment, onRemoveCommon, onRemoveAdjustment }: {
  data: KalkylData; onAddCommon: () => void; onAddAdjustment: () => void; onRemoveCommon: (key: string) => void; onRemoveAdjustment: (id: string) => void;
}) {
  const { display, opts, readOnly } = useKalkylUi();
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const btn = cn('min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold active:bg-muted', motion, focusRing);
  const rm = cn('h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted', motion, focusRing);
  return (
    <section className="rounded-xl border-2 border-dashed border-border px-3 sm:px-4 py-3 space-y-2" aria-label="Gemensamt">
      <h3 className="text-[15px] font-semibold">Gemensamt</h3>
      {(data.common ?? []).length + (data.adjustments ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Etablering, resor och annat som gäller hela jobbet.</p>
      )}
      <ul className="divide-y divide-border">
        {(data.common ?? []).map(l => (
          <li key={l.key} className="flex items-center gap-3 min-h-[48px]">
            <span className="flex-1 min-w-0 text-sm truncate">{l.description}{l.unit_price == null && <span className="ml-2 text-xs font-semibold text-destructive">Pris saknas</span>}</span>
            <span className="font-mono text-sm tabular-nums">{kr(show(l.amount))}</span>
            {!readOnly && <button type="button" className={rm} aria-label={`Ta bort ${l.description}`} onClick={() => onRemoveCommon(l.key)}><X className="h-4 w-4" /></button>}
          </li>
        ))}
        {(data.adjustments ?? []).map(a => (
          <li key={a.id} className="flex items-center gap-3 min-h-[48px]">
            <span className="flex-1 min-w-0 text-sm truncate">{a.label} <span className="text-xs text-muted-foreground">({a.rot_class === 'arbete' ? 'arbete' : a.rot_class === 'material' ? 'material' : 'övrigt'})</span></span>
            <span className={cn('font-mono text-sm tabular-nums', a.amount < 0 && 'text-primary')}>{kr(show(a.amount))}</span>
            {!readOnly && <button type="button" className={rm} aria-label={`Ta bort ${a.label}`} onClick={() => onRemoveAdjustment(a.id)}><X className="h-4 w-4" /></button>}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className={btn} onClick={onAddCommon}><Plus className="h-4 w-4" aria-hidden="true" />Lägg till gemensam rad</button>
          <button type="button" className={btn} onClick={onAddAdjustment}><Percent className="h-4 w-4" aria-hidden="true" />Rabatt eller påslag</button>
        </div>
      )}
    </section>
  );
}

export function OverviewHeader({ count, onGallery, onAdd, readOnly }: { count: number; onGallery: () => void; onAdd: () => void; readOnly: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold">Rum och ytor</h2>
        <p className="text-sm text-muted-foreground"><span className="font-mono tabular-nums">{count}</span> {count === 1 ? 'rad' : 'rader'}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-[44px] gap-2" onClick={onGallery}><LayoutGrid className="h-4 w-4" aria-hidden="true" />Galleri</Button>
        {!readOnly && <Button type="button" className="min-h-[44px] gap-2" onClick={onAdd}><Plus className="h-4 w-4" aria-hidden="true" />Lägg till rum eller yta</Button>}
      </div>
    </div>
  );
}

export function EmptyKalkyl({ onAdd, readOnly }: { onAdd: () => void; readOnly: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
      <h3 className="font-display text-xl font-semibold">Börja med ett rum</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Börja med ett rum. Ange måtten, välj golv eller målning, så räknas mängder och pris fram.</p>
      {!readOnly && <Button type="button" className="mt-5 min-h-[44px] gap-2" onClick={onAdd}><Plus className="h-4 w-4" aria-hidden="true" />Lägg till rum eller yta</Button>}
    </div>
  );
}
