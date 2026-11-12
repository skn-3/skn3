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

/** Benämningen för en fri rad eller grenrad. Sparas när fältet lämnas. */
export function RowTitleField({ row, onTitle }: { row: KalkylRow; onTitle: (title: string) => void }) {
  const { readOnly } = useKalkylUi();
  const [title, setTitle] = useState(row.title);
  return (
    <div className="space-y-1">
      <label htmlFor="fri-title-edit" className="text-xs font-medium text-muted-foreground">Benämning</label>
      <Input id="fri-title-edit" className="h-11 text-base" value={title} disabled={readOnly} onChange={e => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== row.title && onTitle(title)} />
    </div>
  );
}

/**
 * Raderna i en fri rad: tryck för att ändra, kryss för att ta bort. `shown` är de gällande raderna (rowLines) för visning;
 * formuläret får alltid den sparade raden så att ROT-klassen inte skrivs över av ROT-reglaget.
 */
export function FriLineList({ lines, shown, empty, onEdit, onRemove }: {
  lines: KalkylLine[]; shown?: KalkylLine[]; empty?: string; onEdit: (line: KalkylLine) => void; onRemove: (key: string) => void;
}) {
  const { opts, display, readOnly, customerMode } = useKalkylUi();
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {lines.length === 0 && empty && <li className="p-4 text-sm text-muted-foreground">{empty}</li>}
      {lines.map(saved => {
        const l = shown?.find(x => x.key === saved.key) ?? saved;
        return (
          <li key={l.key} className="flex items-center gap-2 px-2">
            <button type="button" disabled={readOnly} onClick={() => onEdit(saved)}
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
            {!readOnly && <button type="button" aria-label={`Ta bort ${l.description}`} onClick={() => onRemove(l.key)}
              className={cn('h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg text-muted-foreground active:bg-muted', motion, focusRing)}><X className="h-4 w-4" /></button>}
          </li>
        );
      })}
    </ul>
  );
}

/** Formuläret för att ändra en rad (mängd, à-pris, ROT-klass) eller lägga till en egen rad. */
export function OwnLineSheet({ state, onOpenChange, onAdd, onUpdate }: {
  state: { edit?: KalkylLine } | null; onOpenChange: (open: boolean) => void;
  onAdd: (line: FriLineInput) => void; onUpdate: (key: string, patch: Partial<FriLineInput>) => void;
}) {
  return (
    <SmallSheet open={!!state} onOpenChange={onOpenChange} title={state?.edit ? 'Ändra rad' : 'Lägg till egen rad'}>
      <OwnLineForm key={state?.edit?.key ?? 'ny'} initial={state?.edit ?? undefined} submitLabel={state?.edit ? 'Spara' : 'Lägg till'}
        onSubmit={l => { if (state?.edit) onUpdate(state.edit.key, l); else onAdd(l); onOpenChange(false); }} />
    </SmallSheet>
  );
}

/** Högerkolumnen: "Lägg till egen rad" och "Lägg till från prislistan". */
export function AddLinePanel({ onOwn, onAdd }: { onOwn: () => void; onAdd: (item: PriceItem) => void }) {
  const { items, readOnly } = useKalkylUi();
  const [pick, setPick] = useState(false);
  const btn = cn('min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold active:bg-muted', motion, focusRing);
  return (
    <>
      <h2 className="font-display text-lg font-semibold">Lägg till</h2>
      {!readOnly ? (
        <div className="space-y-2">
          <button type="button" className={btn} onClick={onOwn}><Plus className="h-4 w-4" aria-hidden="true" />Lägg till egen rad</button>
          <button type="button" className={btn} onClick={() => setPick(true)}><ListPlus className="h-4 w-4" aria-hidden="true" />Lägg till från prislistan</button>
        </div>
      ) : <p className="text-sm text-muted-foreground">Offerten är skrivskyddad.</p>}
      <SmallSheet open={pick} onOpenChange={setPick} title="Lägg till från prislistan" description="Priset hämtas från prislistan. Mängden kan ändras efteråt.">
        <PriceItemPicker items={items} onPick={i => { onAdd(i); setPick(false); }} />
      </SmallSheet>
    </>
  );
}

export function FriConfigurator({ data, row, room, kontroller, actions }: { data: KalkylData; row: KalkylRow; room: KalkylRoom | null; kontroller: Kontroll[]; actions: FriActions }) {
  const [own, setOwn] = useState<{ edit?: KalkylLine } | null>(null);

  const left = (
    <div className="space-y-3">
      <SectionTitle>Rad</SectionTitle>
      <RowTitleField row={row} onTitle={actions.onTitle} />
      <p className="text-sm text-muted-foreground">{room ? `Rum: ${room.name}` : 'Gäller inte ett visst rum.'}</p>
      <p className="text-sm text-muted-foreground">Egna rader utan gren. Skriv rader själv eller hämta dem från prislistan.</p>
    </div>
  );

  const center = (
    <>
      <div>
        <h2 className="font-display text-xl font-semibold">Rader</h2>
        <p className="text-sm text-muted-foreground">Tryck på en rad för att ändra den</p>
      </div>
      <FriLineList lines={row.lines} empty="Inga rader ännu. Lägg till en egen rad eller hämta från prislistan." onEdit={l => setOwn({ edit: l })} onRemove={actions.onRemove} />
      <RowKontroller kontroller={kontroller} rowId={row.id} onFix={actions.onFix} />
    </>
  );

  const right = (
    <>
      <AddLinePanel onOwn={() => setOwn({})} onAdd={actions.onAdd} />
      <OwnLineSheet state={own} onOpenChange={v => !v && setOwn(null)} onAdd={actions.onAdd} onUpdate={actions.onUpdate} />
    </>
  );

  return <ConfiguratorShell row={row} left={left} center={center} right={right} rightLabel="Lägg till" footer={<PriceFooter data={data} row={row} />} />;
}
