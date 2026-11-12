import { useMemo, useState } from 'react';
import { ArrowLeft, Heart, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KULOR_PALETTE, SELECTABLE_SLOTS, SLOT_LABEL, displayAmount, isSelectableSlot, isStale, slotProducts, type Kulor, type PriceItem, type PriceLevel, type SelectableSlot } from '@/lib/kalkyl';
import { PriceSwatch } from '@/components/offers/priceList/PriceSwatch';
import { useKalkylUi } from './context';
import { focusRing, motion } from './ui';
import { kr } from './format';

type Category = 'golv' | SelectableSlot | 'ncs' | 'ral' | 'tillbehor';
const CAT_LABEL: Record<Category, string> = { golv: 'Golv', ...SLOT_LABEL, ncs: 'Kulörer NCS', ral: 'Kulörer RAL', tillbehor: 'Övriga tillbehör' };
const CAT_ORDER: Category[] = ['golv', ...SELECTABLE_SLOTS, 'ncs', 'ral', 'tillbehor'];
const LEVEL: Record<PriceLevel, string> = { bas: 'Bas', standard: 'Standard', premium: 'Premium' };

export type GalleryTarget =
  | { kind: 'golv'; rowId: string; label: string; current: string | null }
  | { kind: 'kulor'; rowId: string; label: string; current: string | null }
  | { kind: 'slot'; rowId: string; slot: SelectableSlot; label: string; current: string | null };

export function Gallery({ target, favorites, onToggleFavorite, onBack, onUseGolv, onUseKulor, onUseSlot }: {
  target: GalleryTarget | null; favorites: string[]; onToggleFavorite: (code: string) => void; onBack: () => void;
  onUseGolv: (rowId: string, code: string) => void; onUseKulor: (rowId: string, k: Kulor) => void;
  onUseSlot: (rowId: string, slot: SelectableSlot, code: string) => void;
}) {
  const { items, opts, display, customerMode, readOnly, settings, today } = useKalkylUi();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<PriceLevel | 'alla'>('alla');
  const [onlyFav, setOnlyFav] = useState(false);
  const [picked, setPicked] = useState<string | null>(target?.current ?? null);
  const show = (v: number) => displayAmount(v, opts.vat_mode === 'omvand' ? 'exkl' : display);
  const s = q.trim().toLowerCase();
  const match = (text: string) => !s || text.toLowerCase().includes(s);
  const active = items.filter(i => i.status !== 'arkiverad');

  const keep = (i: PriceItem) => (level === 'alla' || i.level === level) && match(`${i.name} ${i.spec ?? ''} ${i.color_code ?? ''}`) && (!onlyFav || favorites.includes(i.code));
  const golv = active.filter(i => i.slot === 'golv.golvtyp' && keep(i));
  // Produkter i valgrupperna (underlag, sockel, tröskel, färger) i samma ordning som resolveSlotCode.
  const bySlot = Object.fromEntries(SELECTABLE_SLOTS.map(sl => [sl, slotProducts(sl, active).filter(keep)])) as Record<SelectableSlot, PriceItem[]>;
  const tillbehor = active.filter(i => i.kind === 'tillbehor' && !isSelectableSlot(i.slot) && match(`${i.name} ${i.spec ?? ''}`) && (!onlyFav || favorites.includes(i.code)));
  const ncs = onlyFav ? [] : KULOR_PALETTE.filter(k => k.system === 'NCS' && match(`${k.code} ${k.name ?? ''}`));
  const ral = onlyFav ? [] : KULOR_PALETTE.filter(k => k.system === 'RAL' && match(`${k.code} ${k.name ?? ''}`));
  const allowed: Category[] = target?.kind === 'golv' ? ['golv'] : target?.kind === 'kulor' ? ['ncs', 'ral'] : target?.kind === 'slot' ? [target.slot] : CAT_ORDER;
  const count = (c: Category) => (c === 'golv' ? golv.length : c === 'ncs' ? ncs.length : c === 'ral' ? ral.length : c === 'tillbehor' ? tillbehor.length : bySlot[c].length);
  const countKey = CAT_ORDER.map(count).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cats = useMemo(() => allowed.filter(c => count(c) > 0), [countKey, target?.kind, target?.kind === 'slot' ? target.slot : null]);
  const [catState, setCat] = useState<Category | null>(null);
  const cat = catState && cats.includes(catState) ? catState : cats[0] ?? null;

  const pickedItem = (target?.kind === 'golv' || target?.kind === 'slot') && picked ? items.find(i => i.code === picked) : null;
  const pickedKulor = target?.kind === 'kulor' && picked ? KULOR_PALETTE.find(k => k.code === picked) : null;
  const favCount = favorites.length;
  const chip = (on: boolean) => cn('min-h-[44px] rounded-full border px-4 text-sm font-semibold', motion, focusRing, on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background active:bg-muted');

  const heart = (code: string, name: string) => (
    <button type="button" onClick={e => { e.stopPropagation(); onToggleFavorite(code); }} aria-pressed={favorites.includes(code)}
      aria-label={favorites.includes(code) ? `Ta bort ${name} från favoriter` : `Spara ${name} som favorit`} disabled={readOnly}
      className={cn('absolute right-1 top-1 h-11 w-11 inline-flex items-center justify-center rounded-full bg-background/90', motion, focusRing)}>
      <Heart className={cn('h-5 w-5', favorites.includes(code) ? 'fill-destructive text-destructive' : 'text-muted-foreground')} aria-hidden="true" />
    </button>
  );

  const productTile = (i: PriceItem, selectable: boolean) => {
    const sel = selectable && picked === i.code;
    const stale = i.price_date ? isStale({ price_date: i.price_date }, today, settings.price_max_age_days) : false;
    const Tag = selectable ? 'button' : 'div';
    return (
      <li key={i.code} className="relative">
        <Tag {...(Tag === 'button' ? { type: 'button' as const, onClick: () => setPicked(i.code), 'aria-pressed': sel } : {})}
          className={cn('block w-full rounded-xl border bg-card p-2 text-left', motion, Tag === 'button' && focusRing, sel ? 'border-primary ring-2 ring-primary' : 'border-border')}>
          <div className="relative">
            <PriceSwatch item={i} className="h-[132px] w-full" />
            {i.level && <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold">{LEVEL[i.level]}</span>}
            {sel && <span className="absolute bottom-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /></span>}
          </div>
          <div className="mt-2 text-sm font-semibold leading-tight">{i.name}</div>
          <div className="text-xs text-muted-foreground truncate">{[i.spec, i.color_code].filter(Boolean).join(' · ')}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-sm tabular-nums">{i.price_ex_vat == null ? 'Pris saknas' : `${kr(show(i.price_ex_vat))}/${i.unit}`}</span>
            {!customerMode && i.price_date && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className={cn('h-1.5 w-1.5 rounded-full', stale ? 'bg-gold' : 'bg-success')} aria-hidden="true" />{i.price_date}</span>
            )}
          </div>
        </Tag>
        {heart(i.code, i.name)}
      </li>
    );
  };

  const kulorTile = (k: Kulor) => {
    const sel = target?.kind === 'kulor' && picked === k.code;
    const Tag = target?.kind === 'kulor' ? 'button' : 'div';
    return (
      <li key={k.code}>
        <Tag {...(Tag === 'button' ? { type: 'button' as const, onClick: () => setPicked(k.code), 'aria-pressed': sel } : {})}
          className={cn('block w-full rounded-lg border bg-card p-1.5 text-left', motion, Tag === 'button' && focusRing, sel ? 'border-primary ring-2 ring-primary' : 'border-border')}>
          <span className="block h-14 w-full rounded" style={{ backgroundColor: k.hex }} aria-hidden="true" />
          <span className="mt-1 block font-mono text-[11px] leading-tight">{k.code}</span>
          <span className="block text-[11px] text-muted-foreground truncate">{k.name}</span>
        </Tag>
      </li>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="shrink-0 h-16 flex items-center gap-2 border-b border-border bg-card px-2 sm:px-4">
        <button type="button" onClick={onBack} aria-label="Tillbaka från galleriet" className={cn('h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg active:bg-muted', motion, focusRing)}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display text-xl font-semibold">Galleri</h2>
        <div className="relative ml-auto w-full max-w-xs">
          <label htmlFor="gallery-search" className="sr-only">Sök i galleriet</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input id="gallery-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Sök material eller kulör"
            className={cn('h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base', focusRing)} />
        </div>
        <button type="button" onClick={() => setOnlyFav(v => !v)} aria-pressed={onlyFav} className={cn(chip(onlyFav), 'inline-flex items-center gap-2 shrink-0')}>
          <Heart className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Favoriter</span> <span className="font-mono tabular-nums">{favCount}</span>
        </button>
      </div>
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border px-3 sm:px-4 py-2">
        {(['alla', 'bas', 'standard', 'premium'] as const).map(l => (
          <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={chip(level === l)}>{l === 'alla' ? 'Alla' : LEVEL[l]}</button>
        ))}
        {target && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Vald till {target.label}: <strong>{pickedItem ? `${pickedItem.name}${pickedItem.price_ex_vat != null ? `, ${kr(show(pickedItem.price_ex_vat))}/${pickedItem.unit}` : ''}` : pickedKulor ? `${pickedKulor.code} ${pickedKulor.name ?? ''}` : 'inget valt'}</strong>
            </span>
            <button type="button" disabled={!picked || readOnly}
              onClick={() => {
                if (target.kind === 'golv' && picked) onUseGolv(target.rowId, picked);
                if (target.kind === 'kulor' && pickedKulor) onUseKulor(target.rowId, pickedKulor);
                if (target.kind === 'slot' && pickedItem) onUseSlot(target.rowId, target.slot, pickedItem.code);
              }}
              className={cn('min-h-[44px] rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50', motion, focusRing)}>
              Använd i raden
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 flex">
        <nav aria-label="Kategorier" className="hidden md:block w-52 shrink-0 border-r border-border bg-card p-3 space-y-1 overflow-y-auto">
          {cats.map(c => (
            <button key={c} type="button" aria-current={c === cat} onClick={() => setCat(c)}
              className={cn('w-full min-h-[44px] rounded-lg px-3 text-left text-sm font-semibold', motion, focusRing, c === cat ? 'bg-primary text-primary-foreground' : 'active:bg-muted')}>
              {CAT_LABEL[c]}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="md:hidden mb-3 flex flex-wrap gap-2">
            {cats.map(c => <button key={c} type="button" aria-pressed={c === cat} onClick={() => setCat(c)} className={chip(c === cat)}>{CAT_LABEL[c]}</button>)}
          </div>
          {!cat && <p className="text-sm text-muted-foreground">{onlyFav ? 'Inga favoriter ännu. Tryck på hjärtat för att spara en.' : 'Inget matchar sökningen.'}</p>}
          {cat === 'golv' && <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{golv.map(i => productTile(i, target?.kind === 'golv'))}</ul>}
          {cat && isSelectableSlot(cat) && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{bySlot[cat].map(i => productTile(i, target?.kind === 'slot' && target.slot === cat))}</ul>
          )}
          {(cat === 'ncs' || cat === 'ral') && (
            <>
              <ul className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">{(cat === 'ncs' ? ncs : ral).map(kulorTile)}</ul>
              <p className="mt-3 text-xs text-muted-foreground">Skärmen visar kulören ungefärligt. Stäm av mot färgkarta före beställning.</p>
            </>
          )}
          {cat === 'tillbehor' && (
            <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {tillbehor.map(i => (
                <li key={i.code} className="relative rounded-xl border border-border bg-card p-2">
                  <PriceSwatch item={i} className="h-24 w-full" />
                  <div className="mt-2 text-sm font-semibold leading-tight">{i.name}</div>
                  <div className="font-mono text-xs tabular-nums">{i.price_ex_vat == null ? 'Pris saknas' : `${kr(show(i.price_ex_vat))}/${i.unit}`}</div>
                  {heart(i.code, i.name)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
