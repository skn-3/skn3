import { useState } from 'react';
import { Plus, ListPlus, Pencil, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  displayAmount, lineQtyText, rotClassWords,
  type FriLineInput, type KalkylData, type KalkylLine, type KalkylRoom, type KalkylRow, type Kontroll, type PriceItem, type KontrollFix,
} from '@/lib/kalkyl';
import { useKalkylUi } from './context';
import { ConfiguratorShell, PriceFooter, RowKontroller } from './ConfiguratorShell';
import { SectionTitle, focusRing, motion } from './ui';
import { OwnLineForm, PriceItemPicker, SmallSheet } from './LineSheets';
import { kr } from './format';

export interface FriActions {
  onTitle: (title: string) => void;
  onAdd: (line: FriLineInput | PriceItem) => void;
  onUpdate: (key: string, patch: Partial<FriLineInput>) => void;
  onRemove: (key: string) => void;
  onFix: (fix: KontrollFix) => void;
}

export function FriConfigurator({ data, row, room, kontroller, actions }: { data: KalkylData; row: KalkylRow; room: KalkylRoom | null; kontroller: Kontroll[]; actions: FriActions }) {
  const { items, opts, display, readOnly, customerMode } = useKalkylUi();
  const [title, setTitle] = useState(row.title);
  const [own, setOwn] = useState<{ edit?: KalkylLine } | null>(null);
  const [pick, setPick] = useState(false);
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const btn = cn('min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing);

  const left = (
    <div className="space-y-3">
      <SectionTitle>Rad</SectionTitle>
      <div className="space-y-1">
        <label htmlFor="fri-title-edit" className="text-xs font-medium text-muted-foreground">Benämning</label>
        <Input id="fri-title-edit" className="h-11 text-base" value={title} disabled={readOnly} onChange={e => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== row.title && actions.onTitle(title)} />
      </div>
      <p className="text-sm text-muted-foreground">{room ? `Rum: ${room.name}` : 'Gäller inte ett visst rum.'}</p>
      <p className="text-sm text-muted-foreground">För tak, fasad, badrum, kök och annat som inte har ett recept än. Skriv rader själv eller hämta dem från prislistan.</p>
    </div>
  );

  const center = (
    <>
      <div>
        <h2 className="font-display text-xl font-semibold">Rader</h2>
        <p className="text-sm text-muted-foreground">Tryck på en rad för att ändra den</p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {row.lines.length === 0 && <li className="p-4 text-sm text-muted-foreground">Inga rader ännu. Lägg till en egen rad eller hämta från prislistan.</li>}
        {row.lines.map(l => (
          <li key={l.key} className="flex items-center gap-2 px-2">
            <button type="button" disabled={readOnly} onClick={() => setOwn({ edit: l })}
              className={cn('min-h-[56px] flex-1 min-w-0 flex items-center gap-3 rounded-lg px-2 text-left active:bg-muted', motion, focusRing, 'disabled:cursor-default')}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{l.description}</span>
                  {l.manual && !customerMode && <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">Ändrad</span>}
                </span>
                <span className="block text-xs text-muted-foreground truncate">{lineQtyText(l)} à {l.unit_price == null ? 'pris saknas' : kr(show(l.unit_price))} · {rotClassWords([l])}</span>
              </span>
              <span className="font-mono text-sm tabular-nums whitespace-nowrap">{l.unit_price == null ? 'Pris saknas' : kr(show(l.amount))}</span>
              {!readOnly && <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            </button>
            {!readOnly && <button type="button" aria-label={`Ta bort ${l.description}`} onClick={() => actions.onRemove(l.key)}
              className={cn('h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted', motion, focusRing)}><X className="h-4 w-4" /></button>}
          </li>
        ))}
      </ul>
      <RowKontroller kontroller={kontroller} rowId={row.id} onFix={actions.onFix} />
    </>
  );

  const right = (
    <>
      <h2 className="font-display text-lg font-semibold">Lägg till</h2>
      {!readOnly ? (
        <div className="space-y-2">
          <button type="button" className={btn} onClick={() => setOwn({})}><Plus className="h-4 w-4" aria-hidden="true" />Lägg till egen rad</button>
          <button type="button" className={btn} onClick={() => setPick(true)}><ListPlus className="h-4 w-4" aria-hidden="true" />Lägg till från prislistan</button>
        </div>
      ) : <p className="text-sm text-muted-foreground">Offerten är skrivskyddad.</p>}
      <SmallSheet open={!!own} onOpenChange={v => !v && setOwn(null)} title={own?.edit ? 'Ändra rad' : 'Lägg till egen rad'}>
        <OwnLineForm key={own?.edit?.key ?? 'ny'} initial={own?.edit ?? undefined} submitLabel={own?.edit ? 'Spara' : 'Lägg till'}
          onSubmit={l => { if (own?.edit) actions.onUpdate(own.edit.key, l); else actions.onAdd(l); setOwn(null); }} />
      </SmallSheet>
      <SmallSheet open={pick} onOpenChange={setPick} title="Lägg till från prislistan" description="Priset hämtas från prislistan. Mängden kan ändras efteråt.">
        <PriceItemPicker items={items} onPick={i => { actions.onAdd(i); setPick(false); }} />
      </SmallSheet>
    </>
  );

  return <ConfiguratorShell left={left} center={center} right={right} rightLabel="Lägg till" footer={<PriceFooter data={data} row={row} />} />;
}
