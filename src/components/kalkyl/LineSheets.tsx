// Små sheets: gemensam rad, rabatt eller påslag, egen rad och ändrad mängd/à-pris.
import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { parseSvNumber, type FriLineInput, type KalkylLine, type KalkylOverride, type PriceItem, type RotClass } from '@/lib/kalkyl';
import { PriceSwatch } from '@/components/offers/priceList/PriceSwatch';
import { Segmented, focusRing, motion } from './ui';
import { kr2, dec } from './format';
import { useKalkylUi } from './context';

const ROT_OPTIONS: { value: RotClass; label: string }[] = [
  { value: 'arbete', label: 'Arbete' }, { value: 'material', label: 'Material' }, { value: 'ovrigt', label: 'Övrigt' },
];

function SmallSheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-md')}>
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-5 space-y-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

const num = (s: string) => { const n = parseSvNumber(s); return n == null || n === 'invalid' ? null : n; };

function NumberInput({ id, label, value, onChange, error, unit }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string | null; unit?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <Input id={id} inputMode="decimal" className="h-11 text-base font-mono tabular-nums pr-12" value={value} aria-invalid={!!error} onChange={e => onChange(e.target.value)} />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

/** Egen rad: benämning, mängd, enhet, à-pris ex moms och ROT-klass. */
export function OwnLineForm({ initial, onSubmit, submitLabel = 'Lägg till' }: { initial?: Partial<FriLineInput>; onSubmit: (l: FriLineInput) => void; submitLabel?: string }) {
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [qty, setQty] = useState(initial?.qty != null ? dec(initial.qty, 2) : '1');
  const [unit, setUnit] = useState(initial?.unit ?? 'st');
  const [price, setPrice] = useState(initial?.unit_price != null ? dec(initial.unit_price, 2) : '');
  const [rot, setRot] = useState<RotClass>(initial?.rot_class ?? 'arbete');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = () => {
    const e: Record<string, string> = {};
    if (!desc.trim()) e.desc = 'Skriv vad raden gäller.';
    const q = num(qty);
    if (q == null || q < 0) e.qty = 'Skriv en mängd, t.ex. 2 eller 1,5.';
    const p = price.trim() ? num(price) : null;
    if (price.trim() && p == null) e.price = 'Skriv ett pris i kronor, t.ex. 1 250.';
    setErrors(e);
    if (Object.keys(e).length) return;
    onSubmit({ description: desc.trim(), qty: q ?? 0, unit: unit.trim() || 'st', unit_price: p, rot_class: rot });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="own-desc" className="text-sm font-medium">Benämning</label>
        <Input id="own-desc" className="h-11 text-base" value={desc} aria-invalid={!!errors.desc} onChange={e => setDesc(e.target.value)} />
        {errors.desc && <p className="text-xs text-destructive" role="alert">{errors.desc}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput id="own-qty" label="Mängd" value={qty} onChange={setQty} error={errors.qty} />
        <div className="space-y-1.5">
          <label htmlFor="own-unit" className="text-sm font-medium">Enhet</label>
          <Input id="own-unit" className="h-11 text-base" value={unit} onChange={e => setUnit(e.target.value)} />
        </div>
      </div>
      <NumberInput id="own-price" label="À-pris exkl. moms" value={price} onChange={setPrice} error={errors.price} unit="kr" />
      {!price.trim() && <p className="text-xs text-muted-foreground">Utan pris får raden 0 kr och flaggas i kontrollen.</p>}
      <div className="space-y-1.5">
        <div className="text-sm font-medium" id="own-rot">ROT-klass</div>
        <Segmented label="ROT-klass" value={rot} onChange={setRot} options={ROT_OPTIONS} className="w-full" size="lg" />
      </div>
      <Button type="button" className="w-full min-h-[48px]" onClick={submit}>{submitLabel}</Button>
    </div>
  );
}

/** Lista med prisrader att välja (gemensamma rader eller "Lägg till från prislistan"). */
export function PriceItemPicker({ items, onPick }: { items: PriceItem[]; onPick: (item: PriceItem) => void }) {
  const { customerMode } = useKalkylUi();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(i => i.status !== 'arkiverad' && (!s || `${i.name} ${i.spec ?? ''} ${i.code}`.toLowerCase().includes(s)));
  }, [items, q]);
  return (
    <div className="space-y-2">
      <label htmlFor="pick-search" className="text-sm font-medium">Sök i prislistan</label>
      <Input id="pick-search" className="h-11 text-base" value={q} onChange={e => setQ(e.target.value)} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {list.length === 0 && <li className="p-3 text-sm text-muted-foreground">Inga prisrader matchar.</li>}
        {list.map(i => (
          <li key={i.code}>
            <button type="button" onClick={() => onPick(i)} className={cn('w-full min-h-[56px] flex items-center gap-3 px-3 py-2 text-left active:bg-muted', motion, focusRing)}>
              <PriceSwatch item={i} className="h-9 w-9" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{i.name}</span>
                <span className="block text-xs text-muted-foreground truncate">{[i.spec, !customerMode ? i.code : null].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="font-mono text-sm tabular-nums whitespace-nowrap">{i.price_ex_vat == null ? 'Pris saknas' : `${kr2(i.price_ex_vat)}/${i.unit}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CommonLineSheet({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; onAdd: (v: PriceItem | FriLineInput) => void }) {
  const { items } = useKalkylUi();
  const [mode, setMode] = useState<'lista' | 'egen'>('lista');
  useEffect(() => { if (open) setMode('lista'); }, [open]);
  const common = items.filter(i => i.trade === 'gemensamt');
  return (
    <SmallSheet open={open} onOpenChange={onOpenChange} title="Lägg till gemensam rad" description="Gäller hela jobbet, inte ett visst rum.">
      <Segmented label="Typ av rad" value={mode} onChange={setMode} options={[{ value: 'lista', label: 'Från prislistan' }, { value: 'egen', label: 'Egen rad' }]} className="w-full" size="lg" />
      {mode === 'lista' ? <PriceItemPicker items={common} onPick={onAdd} /> : <OwnLineForm onSubmit={onAdd} initial={{ rot_class: 'ovrigt', unit: 'fast' }} />}
    </SmallSheet>
  );
}

export function AdjustmentSheet({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (v: boolean) => void; onAdd: (a: { label: string; amount: number; rot_class: RotClass }) => void }) {
  const [label, setLabel] = useState('Rabatt');
  const [kind, setKind] = useState<'rabatt' | 'paslag'>('rabatt');
  const [amount, setAmount] = useState('');
  const [rot, setRot] = useState<RotClass>('arbete');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setLabel('Rabatt'); setKind('rabatt'); setAmount(''); setRot('arbete'); setError(null); } }, [open]);
  const submit = () => {
    const n = num(amount);
    if (n == null || n <= 0) { setError('Skriv ett belopp större än 0, t.ex. 1 500.'); return; }
    onAdd({ label: label.trim() || (kind === 'rabatt' ? 'Rabatt' : 'Påslag'), amount: kind === 'rabatt' ? -Math.abs(n) : Math.abs(n), rot_class: rot });
  };
  return (
    <SmallSheet open={open} onOpenChange={onOpenChange} title="Rabatt eller påslag" description="Beloppet anges exklusive moms.">
      <Segmented label="Rabatt eller påslag" value={kind} onChange={v => { setKind(v); setLabel(v === 'rabatt' ? 'Rabatt' : 'Påslag'); }}
        options={[{ value: 'rabatt', label: 'Rabatt' }, { value: 'paslag', label: 'Påslag' }]} className="w-full" size="lg" />
      <div className="space-y-1.5">
        <label htmlFor="adj-label" className="text-sm font-medium">Benämning</label>
        <Input id="adj-label" className="h-11 text-base" value={label} onChange={e => setLabel(e.target.value)} />
      </div>
      <NumberInput id="adj-amount" label="Belopp exkl. moms" value={amount} onChange={v => { setAmount(v); setError(null); }} error={error} unit="kr" />
      <div className="space-y-1.5">
        <div className="text-sm font-medium">ROT-klass</div>
        <Segmented label="ROT-klass" value={rot} onChange={setRot} options={ROT_OPTIONS} className="w-full" size="lg" />
        <p className="text-xs text-muted-foreground">En rabatt på arbete minskar också ROT-underlaget.</p>
      </div>
      <Button type="button" className="w-full min-h-[48px]" onClick={submit}>Lägg till</Button>
    </SmallSheet>
  );
}

/** Ändra mängd och à-pris för beräknade rader, med "Återställ till beräknat". */
export function OverrideSheet({ open, onOpenChange, title, lines, base, onSet }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; lines: KalkylLine[]; base: KalkylLine[];
  onSet: (key: string, o: KalkylOverride | null) => void;
}) {
  const [form, setForm] = useState<Record<string, { qty: string; price: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setForm(Object.fromEntries(lines.map(l => [l.key, { qty: dec(l.qty, 2), price: l.unit_price == null ? '' : dec(l.unit_price, 2) }])));
    setErrors({});
  }, [open, lines]);
  const save = () => {
    const errs: Record<string, string> = {};
    for (const l of lines) {
      const f = form[l.key]; if (!f) continue;
      const q = num(f.qty); const p = f.price.trim() ? num(f.price) : null;
      if (q == null || q < 0) { errs[l.key] = 'Skriv en mängd, t.ex. 12 eller 12,5.'; continue; }
      if (f.price.trim() && p == null) { errs[l.key] = 'Skriv ett à-pris i kronor.'; continue; }
      const b = base.find(x => x.key === l.key) ?? l;
      const o: KalkylOverride = {};
      if (q !== b.qty) o.qty = q;
      if (p != null && p !== b.unit_price) o.unit_price = p;
      onSet(l.key, Object.keys(o).length ? o : null);
    }
    setErrors(errs);
    if (!Object.keys(errs).length) onOpenChange(false);
  };
  return (
    <SmallSheet open={open} onOpenChange={onOpenChange} title={title} description="Ändra mängd eller à-pris exkl. moms. Ändrade rader markeras.">
      {lines.map(l => {
        const b = base.find(x => x.key === l.key) ?? l;
        return (
          <div key={l.key} className="space-y-3 border-b border-border pb-4 last:border-0">
            <div className="text-sm font-semibold">{l.description}</div>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput id={`ov-q-${l.key}`} label={`Mängd (${l.unit})`} value={form[l.key]?.qty ?? ''} onChange={v => setForm(f => ({ ...f, [l.key]: { ...f[l.key], qty: v } }))} />
              <NumberInput id={`ov-p-${l.key}`} label="À-pris exkl. moms" value={form[l.key]?.price ?? ''} unit="kr" onChange={v => setForm(f => ({ ...f, [l.key]: { ...f[l.key], price: v } }))} />
            </div>
            <p className="text-xs text-muted-foreground">Beräknat: <span className="font-mono">{dec(b.qty, 2)} {b.unit}</span> à <span className="font-mono">{b.unit_price == null ? 'pris saknas' : kr2(b.unit_price)}</span></p>
            {errors[l.key] && <p className="text-xs text-destructive" role="alert">{errors[l.key]}</p>}
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => { onSet(l.key, null); setForm(f => ({ ...f, [l.key]: { qty: dec(b.qty, 2), price: b.unit_price == null ? '' : dec(b.unit_price, 2) } })); }}>
              Återställ till beräknat
            </Button>
          </div>
        );
      })}
      <Button type="button" className="w-full min-h-[48px]" onClick={save}>Spara ändringen</Button>
    </SmallSheet>
  );
}

export { SmallSheet };
