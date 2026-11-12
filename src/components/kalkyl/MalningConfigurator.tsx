import { useEffect, useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  KULOR_PALETTE, MALNING_CODES, displayAmount, floorArea, malningOptions, parseKulor, rowLines, wallArea, wallCoats, lineQtyText, rotClassWords,
  type FriLineInput, type KalkylData, type KalkylOverride, type KalkylRoom, type KalkylRow, type Kontroll, type KontrollFix,
  type Kulor, type MalningInput, type RoomPatch, type ColorSystem,
} from '@/lib/kalkyl';
import { useKalkylUi } from './context';
import { KulorSwatch, UnfoldedWalls, WallElevation } from './drawings';
import { ConfiguratorShell, PriceFooter, RowKontroller } from './ConfiguratorShell';
import { DimField, Segmented, SectionTitle, focusRing, motion } from './ui';
import { OwnLineForm, SmallSheet } from './LineSheets';
import { RoomNameField } from './GolvConfigurator';
import { dec, kr } from './format';

export type Surface = 'vagg' | 'tak' | 'snickerier';
const SURFACE_LABEL: Record<Surface, string> = { vagg: 'Väggar', tak: 'Tak', snickerier: 'Snickerier' };
const SURFACE_KEY = { vagg: 'kulor_vagg', tak: 'kulor_tak', snickerier: 'kulor_snickerier' } as const;
const SURFACE_PAINT = { vagg: MALNING_CODES.vaggfarg, tak: MALNING_CODES.takfarg, snickerier: MALNING_CODES.snickerifarg } as const;

export interface MalningActions {
  onRoom: (patch: RoomPatch) => void;
  onInput: (patch: Partial<MalningInput>) => void;
  onOverride: (key: string, o: KalkylOverride | null) => void;
  onAddOwn: (line: FriLineInput) => void;
  onRemoveOwn: (key: string) => void;
  onFix: (fix: KontrollFix) => void;
}

/** Kulörväljare: kod med parseKulor, vald kulör stort och startpaletten med flikar NCS och RAL. */
export function KulorPicker({ value, onPick, surfaceLabel, gloss, disabled }: { value: Kulor | null | undefined; onPick: (k: Kulor) => void; surfaceLabel: string; gloss?: string | null; disabled?: boolean }) {
  const id = useId();
  const [system, setSystem] = useState<ColorSystem>(value?.system ?? 'NCS');
  const [text, setText] = useState(value?.code ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(value?.code ?? ''); setError(null); if (value?.system) setSystem(value.system); }, [value?.code, value?.system]);
  const commit = () => {
    if (!text.trim() || text.trim() === value?.code) { setError(null); return; }
    const k = parseKulor(text, /^ral/i.test(text.trim()) ? 'RAL' : system === 'RAL' && /^\d{4}$/.test(text.trim()) ? 'RAL' : undefined);
    if (!k) { setError(system === 'RAL' ? 'Okänd kod. Skriv RAL-kod med fyra siffror, t.ex. RAL 9010.' : 'Okänd kod. Skriv NCS som S 0502-Y eller RAL som RAL 9010.'); return; }
    setError(null);
    onPick(k);
  };
  const palette = KULOR_PALETTE.filter(k => k.system === system);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium">Kulörkod</label>
        <input id={id} value={text} disabled={disabled} aria-invalid={!!error} onChange={e => setText(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} placeholder="S 0502-Y eller RAL 9010"
          className={cn('h-11 w-full rounded-lg border bg-background px-3 font-mono text-base uppercase', focusRing, error ? 'border-destructive' : 'border-input')} />
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
        <KulorSwatch kulor={value} size={52} showCode />
        <div className="min-w-0">
          <div className="font-mono text-[15px] font-semibold">{value?.code ?? 'Ingen kulör vald'}</div>
          <div className="text-sm text-muted-foreground">{[value?.name ?? (value ? 'Okänd skärmfärg' : null), gloss, surfaceLabel].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <Segmented label="Kulörsystem" value={system} onChange={setSystem} className="w-full" options={[{ value: 'NCS', label: 'NCS' }, { value: 'RAL', label: 'RAL' }]} />
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={`Kulörer ${system}`}>
        {palette.map(k => {
          const active = k.code === value?.code;
          return (
            <button key={k.code} type="button" role="radio" aria-checked={active} aria-label={`${k.code} ${k.name ?? ''}`} disabled={disabled}
              onClick={() => onPick(k)}
              className={cn('relative rounded-lg border p-1 text-center', motion, focusRing, active ? 'border-primary ring-2 ring-primary' : 'border-border active:bg-muted')}>
              <span className="block h-10 w-full rounded" style={{ backgroundColor: k.hex }} aria-hidden="true" />
              <span className="mt-1 block font-mono text-[10px] leading-tight">{k.code.replace('RAL ', '')}</span>
              {active && <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" /></span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Skärmen visar kulören ungefärligt. Stäm av mot färgkarta före beställning.</p>
    </div>
  );
}

export function MalningConfigurator({ data, row, room, kontroller, actions, surface, onSurface }: {
  data: KalkylData; row: KalkylRow; room: KalkylRoom; kontroller: Kontroll[]; actions: MalningActions; surface: Surface; onSurface: (s: Surface) => void;
}) {
  const { prices, settings, opts, display, readOnly } = useKalkylUi();
  const inp = row.input as MalningInput;
  const [ownOpen, setOwnOpen] = useState(false);
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const walls = wallArea(room.dims, settings);
  const ceiling = floorArea(room.dims);
  const o = malningOptions(row, room, prices, settings);
  const coats = wallCoats(inp);
  const gloss = (s: Surface) => prices[SURFACE_PAINT[s]]?.spec ?? null;
  const own = rowLines(row).filter(l => l.key.startsWith('egen.'));
  const underCode = MALNING_CODES.vagg[inp.underarbete];
  const doors = Math.max(0, Math.floor(room.dims.doors));
  const windows = Math.max(0, Math.floor(room.dims.windows));

  const surfaceBtn = (s: Surface, area: string, enabled: boolean) => {
    const k = inp[SURFACE_KEY[s]];
    const active = s === surface;
    return (
      <button key={s} type="button" aria-pressed={active} onClick={() => onSurface(s)}
        className={cn('w-full min-h-[60px] flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left', motion, focusRing,
          active ? 'border-primary ring-2 ring-primary' : 'border-border active:bg-muted', !enabled && 'opacity-60')}>
        <KulorSwatch kulor={k} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{SURFACE_LABEL[s]} <span className="font-normal text-muted-foreground">· {area}</span></span>
          <span className="block text-xs text-muted-foreground truncate"><span className="font-mono">{k?.code ?? 'Ingen kulör'}</span>{gloss(s) ? ` · ${gloss(s)}` : ''}{!enabled ? ' · ingår inte' : ''}</span>
        </span>
      </button>
    );
  };

  const toggleRow = (flag: 'tak' | 'snickerier', label: string) => (
    <label className="flex items-center justify-between gap-3 min-h-[48px] cursor-pointer">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center gap-3">
        <span className={cn('font-mono text-sm tabular-nums', !o[flag].enabled && 'text-muted-foreground')}>{o[flag].enabled ? '' : '+'}{kr(show(o[flag].amount))}</span>
        <Switch checked={o[flag].enabled} disabled={readOnly} onCheckedChange={v => actions.onInput({ [flag]: v })} aria-label={label} />
      </span>
    </label>
  );

  const left = (
    <>
      <div className="space-y-3">
        <SectionTitle>Rum</SectionTitle>
        <RoomNameField key={room.id} room={room} onRoom={actions.onRoom} disabled={readOnly} />
        <div className="grid grid-cols-1 gap-3">
          <DimField label="Längd" value={room.dims.length} onChange={v => actions.onRoom({ dims: { length: v } })} disabled={readOnly} />
          <DimField label="Bredd" value={room.dims.width} onChange={v => actions.onRoom({ dims: { width: v } })} disabled={readOnly} />
          <DimField label="Takhöjd" value={room.dims.height} onChange={v => actions.onRoom({ dims: { height: v } })} disabled={readOnly} />
          <div className="grid grid-cols-1 gap-3">
            <DimField label="Dörrar" value={room.dims.doors} onChange={v => actions.onRoom({ dims: { doors: v } })} step={1} integer unit="st" max={20} disabled={readOnly} />
            <DimField label="Fönster" value={room.dims.windows} onChange={v => actions.onRoom({ dims: { windows: v } })} step={1} integer unit="st" max={30} disabled={readOnly} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <SectionTitle>Ytor</SectionTitle>
        {surfaceBtn('vagg', `${dec(walls)} m²`, true)}
        {surfaceBtn('tak', `${dec(ceiling)} m²`, !!inp.tak)}
        {surfaceBtn('snickerier', 'foder och socklar', !!inp.snickerier)}
      </div>
      <div className="space-y-2">
        <SectionTitle>Underarbete</SectionTitle>
        <Segmented label="Underarbete" value={inp.underarbete} onChange={v => actions.onInput({ underarbete: v })} disabled={readOnly} className="w-full" size="lg"
          options={[{ value: 'latt', label: 'Lätt' }, { value: 'normal', label: 'Normalt' }, { value: 'omfattande', label: 'Omfattande' }]} />
        <p className="text-sm text-muted-foreground">{prices[underCode]?.spec ?? 'Beskrivning saknas i prislistan.'}</p>
      </div>
      <div className="space-y-1">
        <SectionTitle>Ingår</SectionTitle>
        {toggleRow('tak', 'Måla tak')}
        {toggleRow('snickerier', 'Måla snickerier')}
        <p className="text-sm text-muted-foreground">{coats} strykningar på väggarna{inp.tak ? ', 2 på taket' : ''}{inp.snickerier ? ', 2 på snickerierna' : ''}.</p>
      </div>
    </>
  );

  const center = (
    <>
      <div>
        <h2 className="font-display text-xl font-semibold">Väggvy</h2>
        <p className="text-sm text-muted-foreground">Kulören byts direkt när du väljer</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="h-[280px]">
          <WallElevation dims={room.dims} settings={settings} wall={inp.kulor_vagg} ceiling={inp.tak ? inp.kulor_tak : null} trim={inp.snickerier ? inp.kulor_snickerier : null} width={560} height={280} />
        </div>
        <UnfoldedWalls dims={room.dims} wall={inp.kulor_vagg} width={520} />
      </div>
      <p className="text-sm">Väggyta <span className="font-mono font-semibold tabular-nums">{dec(walls)} m²</span> efter avdrag för {doors} {doors === 1 ? 'dörr' : 'dörrar'} och {windows} fönster</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(['vagg', 'tak', 'snickerier'] as Surface[]).map(s => {
          const k = inp[SURFACE_KEY[s]];
          return (
            <div key={s} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <KulorSwatch kulor={k} size={32} />
              <div className="min-w-0 leading-tight">
                <div className="text-xs text-muted-foreground">{SURFACE_LABEL[s]}</div>
                <div className="text-sm font-semibold truncate">{k?.name ?? (k ? 'Okänd skärmfärg' : 'Ingen kulör')}</div>
                <div className="font-mono text-xs truncate">{k?.code ?? '–'}</div>
              </div>
            </div>
          );
        })}
      </div>
      <RowKontroller kontroller={kontroller} rowId={row.id} onFix={actions.onFix} />
    </>
  );

  const right = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Kulör</h2>
        <span className="inline-flex h-7 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">{SURFACE_LABEL[surface]}</span>
      </div>
      <KulorPicker value={inp[SURFACE_KEY[surface]]} gloss={gloss(surface)} surfaceLabel={SURFACE_LABEL[surface]} disabled={readOnly}
        onPick={k => actions.onInput({ [SURFACE_KEY[surface]]: k })} />
      {(own.length > 0 || !readOnly) && (
        <div className="space-y-2 border-t border-border pt-4">
          <SectionTitle>Egna rader</SectionTitle>
          <ul className="divide-y divide-border">
            {own.map(l => (
              <li key={l.key} className="flex items-center gap-2 min-h-[54px]">
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{l.description}</span><span className="block text-xs text-muted-foreground">{lineQtyText(l)} · {rotClassWords([l])}</span></span>
                <span className="font-mono text-sm tabular-nums">{l.unit_price == null ? 'Pris saknas' : kr(show(l.amount))}</span>
                {!readOnly && <button type="button" aria-label={`Ta bort ${l.description}`} onClick={() => actions.onRemoveOwn(l.key)} className={cn('h-11 w-11 inline-flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted', motion, focusRing)}><X className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <button type="button" onClick={() => setOwnOpen(true)} className={cn('min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Lägg till egen rad
            </button>
          )}
        </div>
      )}
      <SmallSheet open={ownOpen} onOpenChange={setOwnOpen} title="Lägg till egen rad" description="Raden hör till målningen i det här rummet.">
        <OwnLineForm onSubmit={l => { actions.onAddOwn(l); setOwnOpen(false); }} />
      </SmallSheet>
    </>
  );

  return <ConfiguratorShell left={left} center={center} right={right} rightLabel="Kulör" footer={<PriceFooter data={data} row={row} />} />;
}
