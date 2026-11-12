import { useMemo, useState } from 'react';
import { Check, LayoutGrid, Plus, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  GOLV_CODES, displayAmount, floorArea, golvOptions, perimeter, rowLines, sockelLength, lineQtyText, rotClassWords,
  type FriLineInput, type GolvFlag, type GolvInput, type KalkylData, type KalkylLine, type KalkylOverride, type KalkylRoom,
  type KalkylRow, type Kontroll, type KontrollFix, type PriceItem, type RoomPatch,
} from '@/lib/kalkyl';
import { PriceSwatch } from '@/components/offers/priceList/PriceSwatch';
import { useKalkylUi } from './context';
import { RoomPlan } from './drawings';
import { ConfiguratorShell, PriceFooter, RowKontroller } from './ConfiguratorShell';
import { DimField, Segmented, SectionTitle, focusRing, motion } from './ui';
import { OverrideSheet, OwnLineForm, SmallSheet } from './LineSheets';
import { dec, kr } from './format';

const LEVEL: Record<string, string> = { bas: 'Bas', standard: 'Standard', premium: 'Premium' };

export interface GolvActions {
  onRoom: (patch: RoomPatch) => void;
  onInput: (patch: Partial<GolvInput>) => void;
  onOverride: (key: string, o: KalkylOverride | null) => void;
  onAddOwn: (line: FriLineInput) => void;
  onRemoveOwn: (key: string) => void;
  onGallery: () => void;
  onFix: (fix: KontrollFix) => void;
}

export function RoomNameField({ room, onRoom, disabled }: { room: KalkylRoom; onRoom: (p: RoomPatch) => void; disabled?: boolean }) {
  const [name, setName] = useState(room.name);
  return (
    <div className="space-y-1">
      <label htmlFor={`room-${room.id}`} className="text-xs font-medium text-muted-foreground">Namn</label>
      <Input id={`room-${room.id}`} className="h-11 text-base" value={name} disabled={disabled}
        onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== room.name && onRoom({ name })}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}

function LineRow({ title, detail, amount, swatch, manual, onTap, toggle, enabled = true, disabledPrice, children }: {
  title: string; detail: string; amount: string; swatch?: React.ReactNode; manual?: boolean; onTap?: () => void;
  toggle?: React.ReactNode; enabled?: boolean; disabledPrice?: boolean; children?: React.ReactNode;
}) {
  const { customerMode } = useKalkylUi();
  const body = (
    <>
      {swatch}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('text-sm font-semibold truncate', !enabled && 'text-muted-foreground')}>{title}</span>
          {manual && !customerMode && <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">Ändrad</span>}
        </span>
        <span className="block text-xs text-muted-foreground truncate">{detail}</span>
      </span>
      <span className={cn('font-mono text-sm tabular-nums whitespace-nowrap', disabledPrice && 'text-muted-foreground')}>{amount}</span>
    </>
  );
  return (
    <li className="flex items-center gap-2 min-h-[54px] py-1">
      {toggle}
      {onTap ? (
        <button type="button" onClick={onTap} className={cn('min-h-[48px] flex-1 min-w-0 flex items-center gap-3 rounded-lg px-1 text-left active:bg-muted', motion, focusRing)}>{body}</button>
      ) : <div className="flex-1 min-w-0 flex items-center gap-3 px-1">{body}</div>}
      {children}
    </li>
  );
}

export function GolvConfigurator({ data, row, room, kontroller, actions }: { data: KalkylData; row: KalkylRow; room: KalkylRoom; kontroller: Kontroll[]; actions: GolvActions }) {
  const { prices, items, settings, opts, display, readOnly } = useKalkylUi();
  const inp = row.input as GolvInput;
  const [override, setOverride] = useState<{ title: string; keys: string[] } | null>(null);
  const [ownOpen, setOwnOpen] = useState(false);
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const types = useMemo(() => items.filter(i => i.slot === 'golv.golvtyp' && i.status !== 'arkiverad'), [items]);
  const mat = prices[inp.material_code];
  const lines = rowLines(row);
  const options = golvOptions(row, room, prices, settings);
  const matLine = lines.find(l => l.key === 'golv.material');
  const area = floorArea(room.dims);
  const own = lines.filter(l => l.key.startsWith('egen.'));
  const fixed = lines.filter(l => l.key === 'golv.material' || l.key === 'golv.laggning');
  const overrideLines: KalkylLine[] = override ? lines.filter(l => override.keys.includes(l.key)) : [];

  const left = (
    <>
      <div className="space-y-3">
        <SectionTitle>Rum</SectionTitle>
        <RoomNameField key={room.id} room={room} onRoom={actions.onRoom} disabled={readOnly} />
        <DimField label="Längd" value={room.dims.length} onChange={v => actions.onRoom({ dims: { length: v } })} disabled={readOnly} />
        <DimField label="Bredd" value={room.dims.width} onChange={v => actions.onRoom({ dims: { width: v } })} disabled={readOnly} />
        <DimField label="Dörröppningar" value={room.dims.doors} onChange={v => actions.onRoom({ dims: { doors: v } })} step={1} integer unit="st" max={20} disabled={readOnly} />
        <p className="text-sm text-muted-foreground">Golvyta <span className="font-mono tabular-nums text-foreground">{dec(area)} m²</span>, omkrets <span className="font-mono tabular-nums text-foreground">{dec(perimeter(room.dims))} m</span></p>
      </div>
      <div className="space-y-3">
        <SectionTitle>Golvtyp</SectionTitle>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Golvtyp">
          {types.map(t => {
            const active = t.code === inp.material_code;
            return (
              <button key={t.code} type="button" role="radio" aria-checked={active} disabled={readOnly}
                onClick={() => actions.onInput({ material_code: t.code })}
                className={cn('relative rounded-lg border bg-background p-1.5 text-left', motion, focusRing, active ? 'border-primary ring-2 ring-primary' : 'border-border active:bg-muted', 'disabled:cursor-default')}>
                <div className="relative">
                  <PriceSwatch item={t} className="h-[50px] w-full" />
                  {t.level && <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold">{LEVEL[t.level]}</span>}
                  {active && <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /></span>}
                </div>
                <div className="mt-1.5 text-[13px] font-semibold leading-tight">{t.name}</div>
                <div className="text-xs text-muted-foreground leading-tight truncate">{t.spec}</div>
                <div className="mt-0.5 font-mono text-xs tabular-nums">{t.price_ex_vat == null ? 'Pris saknas' : `${kr(show(t.price_ex_vat))}/m²`}</div>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={actions.onGallery} className={cn('min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold active:bg-muted', motion, focusRing)}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Fler i galleriet
        </button>
      </div>
      <div className="space-y-2">
        <SectionTitle>Läggriktning</SectionTitle>
        <Segmented label="Läggriktning" value={inp.direction} onChange={v => actions.onInput({ direction: v })} disabled={readOnly} className="w-full" size="lg"
          options={[{ value: 'langs', label: 'Längs' }, { value: 'tvars', label: 'Tvärs' }]} />
      </div>
    </>
  );

  const packs = matLine?.detail?.split(' (')[0];
  const center = (
    <>
      <div>
        <h2 className="font-display text-xl font-semibold">Planritning</h2>
        <p className="text-sm text-muted-foreground">Ritas efter måtten och uppdateras direkt</p>
      </div>
      <div className="h-[260px] md:h-[336px] rounded-xl border border-border bg-card p-2">
        <RoomPlan dims={room.dims} item={mat} direction={inp.direction} settings={settings} width={560} height={320} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ['Golvyta', `${dec(area)} m²`],
          ['Sockel', `${dec(sockelLength(room.dims, settings))} m`],
          ['Spill', `${dec(mat?.waste_pct ?? 0)} %`],
          ...(packs ? [['Åtgång', packs]] : []),
        ].map(([k, v]) => (
          <span key={k} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs">
            <span className="text-muted-foreground">{k}</span><span className="font-mono font-semibold tabular-nums">{v}</span>
          </span>
        ))}
      </div>
      <RowKontroller kontroller={kontroller} rowId={row.id} onFix={actions.onFix} />
    </>
  );

  const sockelItem: PriceItem | undefined = prices[GOLV_CODES.sockel];
  const right = (
    <>
      <h2 className="font-display text-lg font-semibold">Tillbehör och tillägg</h2>
      <ul className="divide-y divide-border">
        {fixed.map(l => (
          <LineRow key={l.key} title={l.description} detail={`${lineQtyText(l)} · ${rotClassWords([l])}`} amount={l.unit_price == null ? 'Pris saknas' : kr(show(l.amount))}
            manual={l.manual} onTap={readOnly ? undefined : () => setOverride({ title: l.description, keys: [l.key] })} />
        ))}
        {options.map(o => (
          <LineRow key={o.flag} title={o.label} detail={o.detail || 'Ingen mängd'} enabled={o.enabled} disabledPrice={!o.enabled}
            amount={o.lines.some(l => l.unit_price == null) ? 'Pris saknas' : `${o.enabled ? '' : '+'}${kr(show(o.amount))}`}
            manual={o.enabled && o.manual}
            swatch={o.flag === 'sockel' && sockelItem ? (
              <span className="flex items-center gap-1.5 shrink-0"><PriceSwatch item={sockelItem} className="h-7 w-7 rounded" />
                {sockelItem.color_code && <span className="font-mono text-[11px] text-muted-foreground">{sockelItem.color_code}</span>}</span>
            ) : undefined}
            onTap={o.enabled && !readOnly ? () => setOverride({ title: o.label, keys: o.lines.map(l => l.key) }) : undefined}
            toggle={(
              <label className="flex h-12 w-12 shrink-0 items-center justify-center cursor-pointer">
                <Switch checked={o.enabled} disabled={readOnly} onCheckedChange={v => actions.onInput({ [o.flag]: v } as Partial<Record<GolvFlag, boolean>>)} aria-label={o.label} />
              </label>
            )} />
        ))}
        {own.map(l => (
          <LineRow key={l.key} title={l.description} detail={`${lineQtyText(l)} · ${rotClassWords([l])}`} amount={l.unit_price == null ? 'Pris saknas' : kr(show(l.amount))}>
            {!readOnly && <button type="button" aria-label={`Ta bort ${l.description}`} onClick={() => actions.onRemoveOwn(l.key)}
              className={cn('h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted', motion, focusRing)}><X className="h-4 w-4" /></button>}
          </LineRow>
        ))}
      </ul>
      {!readOnly && (
        <button type="button" onClick={() => setOwnOpen(true)} className={cn('min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Lägg till egen rad
        </button>
      )}
      <OverrideSheet open={!!override} onOpenChange={v => !v && setOverride(null)} title={override?.title ?? ''} lines={overrideLines}
        base={row.lines.filter(l => override?.keys.includes(l.key))} onSet={actions.onOverride} />
      <SmallSheet open={ownOpen} onOpenChange={setOwnOpen} title="Lägg till egen rad" description="Raden hör till golvet i det här rummet.">
        <OwnLineForm onSubmit={l => { actions.onAddOwn(l); setOwnOpen(false); }} />
      </SmallSheet>
    </>
  );

  return <ConfiguratorShell left={left} center={center} right={right} footer={<PriceFooter data={data} row={row} />} />;
}
