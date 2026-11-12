// Grenrad: mängdlista med grenens prisrader, mått som förslag på mängd och ROT-reglaget.
// All räkning sker i src/lib/kalkyl/gren.ts; komponenten visar och skickar vidare.
import { useMemo, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  displayAmount, effectiveRotClass, grenItems, grenLineSplit, grenListGroups, measureMismatch, rotClassWords, rowLines, rowRotOff,
  GREN_ROT_RULES, GREN_SEARCH_LIMIT, TRADE_LABEL,
  type GrenMeasure, type GrenRow, type KalkylData, type KalkylLine, type KalkylRoom, type Kontroll, type MeasureUnit, type PriceItem,
} from '@/lib/kalkyl';
import { PriceSwatch } from '@/components/offers/priceList/PriceSwatch';
import { useKalkylUi } from './context';
import { ConfiguratorShell, PriceFooter, RowKontroller } from './ConfiguratorShell';
import { DimField, OptionalNumberField, SectionTitle, focusRing, motion } from './ui';
import { AddLinePanel, FriLineList, OwnLineSheet, RowTitleField, type FriActions } from './FriConfigurator';
import { LEVEL_LABEL, useUnitPriceText } from './ProductSheet';
import { dec, kr, kr2 } from './format';

export interface GrenActions extends FriActions {
  onQty: (item: PriceItem, qty: number) => void;
  onAddItem: (item: PriceItem) => void;
  onMeasure: (patch: GrenMeasure) => void;
  onApplyMeasure: (unit: MeasureUnit) => void;
  onRotOff: (off: boolean) => void;
}

const hasPicture = (i: PriceItem) => !!(i.image_path || i.swatch || i.color_hex);

function ListItem({ row, item, line, shown, onQty, onAdd, onEdit }: {
  row: GrenRow; item: PriceItem; line: KalkylLine | undefined; shown: KalkylLine | undefined;
  onQty: (qty: number) => void; onAdd: () => void; onEdit: (line: KalkylLine) => void;
}) {
  const { opts, display, readOnly, customerMode } = useKalkylUi();
  const unitPrice = useUnitPriceText();
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const manual = !!line?.manual;
  const priceText = line && manual
    ? (line.unit_price == null ? 'Pris saknas' : `${kr2(show(line.unit_price))}/${line.unit}`)
    : unitPrice(item);
  const missing = line ? line.unit_price == null : item.price_ex_vat == null;
  const rot = rotClassWords([{ rot_class: shown?.rot_class ?? effectiveRotClass(row, item.rot_class) }]);
  const nameEl = (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-semibold">{item.name}</span>
      {item.level && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{LEVEL_LABEL[item.level]}</span>}
      {manual && !customerMode && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">Ändrad</span>}
      {line && !readOnly && <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
    </span>
  );
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {hasPicture(item) && <PriceSwatch item={item} className="h-12 w-12" />}
        <div className="min-w-0 flex-1 leading-tight">
          {line && !readOnly ? (
            <button type="button" onClick={() => onEdit(line)} aria-label={`Ändra ${item.name}`}
              className={cn('-mx-1 min-h-[44px] rounded-md px-1 text-left underline-offset-4 active:bg-muted', motion, focusRing)}>{nameEl}</button>
          ) : nameEl}
          {item.spec && <div className="text-xs text-muted-foreground">{item.spec}</div>}
          <div className="mt-0.5 text-xs">
            <span className={cn('font-mono tabular-nums', missing && 'font-semibold text-warning-ink')}>{priceText}</span>
            <span className="text-muted-foreground"> · {rot}</span>
          </div>
        </div>
        {line && <span className="shrink-0 font-mono text-sm tabular-nums">{missing ? '' : kr(show(shown?.amount ?? line.amount))}</span>}
      </div>
      {!readOnly && (line ? (
        <div className="flex items-end gap-2 sm:w-[240px]">
          <div className="flex-1"><DimField label="Mängd" value={line.qty} onChange={onQty} step={1} max={99999} unit={line.unit} /></div>
          <button type="button" aria-label={`Ta bort ${item.name}`} onClick={() => onQty(0)}
            className={cn('h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground active:bg-muted', motion, focusRing)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={onAdd} aria-label={`Lägg till ${item.name}`}
          className={cn('min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold active:bg-muted', motion, focusRing)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Lägg till
        </button>
      ))}
      {readOnly && line && <span className="text-sm text-muted-foreground">{dec(line.qty, 2)} {line.unit}</span>}
    </li>
  );
}

export function GrenConfigurator({ data, row, room, kontroller, actions }: { data: KalkylData; row: GrenRow; room: KalkylRoom | null; kontroller: Kontroll[]; actions: GrenActions }) {
  const { items, prices, readOnly } = useKalkylUi();
  const [own, setOwn] = useState<{ edit?: KalkylLine } | null>(null);
  const [query, setQuery] = useState('');
  const label = TRADE_LABEL[row.gren];
  const all = useMemo(() => grenItems(items, row.gren), [items, row.gren]);
  const groups = useMemo(() => grenListGroups(items, row.gren, query), [items, row.gren, query]);
  const split = grenLineSplit(row, prices);
  const shown = rowLines(row);
  const lineOf = (code: string) => split.list.find(l => l.code === code);
  const shownOf = (l?: KalkylLine) => (l ? shown.find(x => x.key === l.key) : undefined);
  const area = row.measure?.area ?? null;
  const length = row.measure?.length ?? null;
  const areaOff = measureMismatch(row, 'm²', prices).length > 0;
  const lengthOff = measureMismatch(row, 'm', prices).length > 0;
  const rule = GREN_ROT_RULES[row.gren];
  const rotOn = !rowRotOff(row);
  const btn = cn('min-h-[44px] w-full rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing);

  const left = (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionTitle>Rad</SectionTitle>
        <RowTitleField row={row} onTitle={actions.onTitle} />
        <p className="text-sm text-muted-foreground">{room ? `Rum: ${room.name}` : 'Gäller inte ett visst rum.'}</p>
      </div>
      <div className="space-y-3">
        <SectionTitle>Mått</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <OptionalNumberField label="Yta" unit="m²" value={area} disabled={readOnly} onChange={v => actions.onMeasure({ area: v })} />
          <OptionalNumberField label="Längd" unit="m" value={length} disabled={readOnly} onChange={v => actions.onMeasure({ length: v })} />
        </div>
        <p className="text-xs text-muted-foreground">Används som förslag på mängd när du lägger till rader per m² eller per meter.</p>
        {!readOnly && areaOff && area != null && <button type="button" className={btn} onClick={() => actions.onApplyMeasure('m²')}>Sätt m²-rader till {dec(area, 2)} m²</button>}
        {!readOnly && lengthOff && length != null && <button type="button" className={btn} onClick={() => actions.onApplyMeasure('m')}>Sätt meterrader till {dec(length, 2)} m</button>}
      </div>
      <div className="space-y-2">
        <SectionTitle>ROT</SectionTitle>
        <label htmlFor="gren-rot" className="flex min-h-[44px] items-center justify-between gap-3 text-sm font-medium">
          ROT på arbetet i den här raden
          <Switch id="gren-rot" checked={rotOn} disabled={readOnly} onCheckedChange={v => actions.onRotOff(!v)} />
        </label>
        <p className="text-xs text-muted-foreground">{rule.text}</p>
        <p className="text-[11px] text-muted-foreground">Källa: {rule.source}</p>
      </div>
    </div>
  );

  const center = (
    <>
      <div>
        <h2 className="font-display text-xl font-semibold">Mängdlista</h2>
        <p className="text-sm text-muted-foreground">{label}. Priser från prislistan.</p>
      </div>
      {all.length > GREN_SEARCH_LIMIT && (
        <div className="space-y-1">
          <label htmlFor="gren-search" className="text-xs font-medium text-muted-foreground">Sök i listan</label>
          <Input id="gren-search" className="h-11 text-base" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}
      {all.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Prislistan har inga rader för {label}. Importera prisarket under Offerter, Prislista.
        </p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Inga prisrader matchar.</p>
      ) : groups.map(g => (
        <section key={g.kind} className="space-y-1.5" aria-label={g.label}>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {g.items.map(item => {
              const line = lineOf(item.code);
              return (
                <ListItem key={item.code} row={row} item={item} line={line} shown={shownOf(line)}
                  onQty={q => actions.onQty(item, q)} onAdd={() => actions.onAddItem(item)} onEdit={l => setOwn({ edit: l })} />
              );
            })}
          </ul>
        </section>
      ))}
      {split.other.length > 0 && (
        <section className="space-y-1.5" aria-label="Övriga rader">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Övriga rader</h3>
          <FriLineList lines={split.other} shown={shown} onEdit={l => setOwn({ edit: l })} onRemove={actions.onRemove} />
        </section>
      )}
      <RowKontroller kontroller={kontroller} rowId={row.id} onFix={actions.onFix} />
    </>
  );

  const right = (
    <>
      <AddLinePanel onOwn={() => setOwn({})} onAdd={actions.onAdd} />
      <OwnLineSheet state={own} onOpenChange={v => !v && setOwn(null)} onAdd={actions.onAdd} onUpdate={actions.onUpdate} />
    </>
  );

  return <ConfiguratorShell row={row} left={left} center={center} right={right} rightLabel="Lägg till" centerLabel="Mängdlista" footer={<PriceFooter data={data} row={row} />} />;
}
