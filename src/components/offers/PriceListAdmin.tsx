import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, CheckSquare, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useRole } from '@/hooks/useRole';
import {
  canApprovePrices,
  applyPriceEdit, groupPriceItems, inclVat, itemTbPct, needsReview, priceAgeLabel, priceListSummary, reviewReasons, isStale,
  DEFAULT_KALKYL_SETTINGS, KIND_LABEL, PRICE_KINDS, PRICE_TRADES, STATUS_LABEL, TRADE_LABEL,
  type PriceItem, type PriceKind, type PriceStatus, type PriceTrade,
} from '@/lib/kalkyl';
import { fetchKalkylSettings, fetchPriceItems, KALKYL_SETTINGS_KEY, PRICE_ITEMS_KEY, updatePriceItem } from './priceList/api';
import { PriceSwatch } from './priceList/PriceSwatch';
import { PriceItemSheet } from './priceList/PriceItemSheet';
import { PriceImportSheet } from './priceList/PriceImportSheet';
import { KalkylSettingsCard } from './priceList/KalkylSettingsCard';

const kr2 = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kr0 = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 0 });
const statusTone = (s: PriceStatus): 'success' | 'neutral' | 'warning' => (s === 'godkand' ? 'success' : s === 'arkiverad' ? 'neutral' : 'warning');

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function FilterRow<T extends string>({ label, value, options, onChange }: { label: string; value: T | 'alla'; options: { value: NoInfer<T>; label: string }[]; onChange: (v: T | 'alla') => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <FilterChip active={value === 'alla'} onClick={() => onChange('alla')}>Alla</FilterChip>
      {options.map(o => (
        <FilterChip key={o.value} active={value === o.value} onClick={() => onChange(value === o.value ? 'alla' : o.value)}>{o.label}</FilterChip>
      ))}
    </div>
  );
}

export function PriceListAdmin({ currentUser }: { currentUser: string }) {
  const qc = useQueryClient();
  const { role } = useRole();
  const canApprove = canApprovePrices(role);
  const today = useMemo(() => new Date(), []);
  const { data: items = [], isLoading, error } = useQuery({ queryKey: PRICE_ITEMS_KEY, queryFn: fetchPriceItems });
  const { data: settings = DEFAULT_KALKYL_SETTINGS } = useQuery({ queryKey: KALKYL_SETTINGS_KEY, queryFn: fetchKalkylSettings });

  const [trade, setTrade] = useState<PriceTrade | 'alla'>('alla');
  const [kind, setKind] = useState<PriceKind | 'alla'>('alla');
  const [status, setStatus] = useState<PriceStatus | 'alla'>('alla');
  const [onlyReview, setOnlyReview] = useState(false);
  const [editing, setEditing] = useState<PriceItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  const maxAge = settings.price_max_age_days;
  const summary = useMemo(() => priceListSummary(items, today, maxAge), [items, today, maxAge]);
  const presentTrades = useMemo(() => PRICE_TRADES.filter(t => items.some(i => i.trade === t)), [items]);
  const filtered = useMemo(() => items.filter(i =>
    (trade === 'alla' || i.trade === trade) &&
    (kind === 'alla' || i.kind === kind) &&
    (status === 'alla' ? i.status !== 'arkiverad' : i.status === status) &&
    (!onlyReview || needsReview(i, today, maxAge))), [items, trade, kind, status, onlyReview, today, maxAge]);
  const groups = useMemo(() => groupPriceItems(filtered), [filtered]);
  const existingCodes = useMemo(() => new Set(items.map(i => i.code)), [items]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: PRICE_ITEMS_KEY });
    qc.invalidateQueries({ queryKey: ['price_log'] });
  };

  const openEditor = (item: PriceItem | null) => { setEditing(item); setEditorOpen(true); };
  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };

  async function approveSelected() {
    const chosen = items.filter(i => selected.has(i.id));
    const ok = chosen.filter(i => i.price_ex_vat != null && i.status !== 'godkand');
    const skipped = chosen.filter(i => i.price_ex_vat == null).length;
    if (!ok.length) { toast.info(skipped ? 'De valda raderna saknar pris och kan inte godkännas' : 'De valda raderna är redan godkända'); return; }
    setApproving(true);
    const now = new Date();
    let done = 0;
    try {
      for (const it of ok) {
        const next = applyPriceEdit(it, {}, currentUser, now, true);
        await updatePriceItem(it.id, { status: next.status, approved_by: next.approved_by, approved_at: next.approved_at, updated_by: next.updated_by });
        done += 1;
      }
      toast.success(`${done} rader godkända${skipped ? ` · ${skipped} saknar pris och godkändes inte` : ''}`);
      stopSelecting();
    } catch (e) {
      toast.error(`Godkännandet avbröts efter ${done} rader`, { description: e instanceof Error ? e.message : String(e) });
    } finally { setApproving(false); refresh(); }
  }

  return (
    <div className="space-y-4 px-3 pb-28 md:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Prislista</h2>
          <p className="text-sm text-muted-foreground">Priser exklusive moms. Bara godkända priser kan skickas i en offert.</p>
          {!canApprove && <p className="text-sm text-muted-foreground">Bara administratör kan godkänna priser.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canApprove && !selecting && (
            <Button variant="outline" className="h-11" onClick={() => setSelecting(true)} disabled={!items.length}>
              <CheckSquare /> Markera
            </Button>
          )}
          <Button variant="outline" className="h-11" onClick={() => setImportOpen(true)}><Upload /> Importera</Button>
          <Button className="h-11" onClick={() => openEditor(null)}><Plus /> Ny rad</Button>
        </div>
      </div>

      <div className="space-y-2">
        <FilterRow<PriceTrade> label="Gren" value={trade} onChange={setTrade} options={presentTrades.map(t => ({ value: t, label: TRADE_LABEL[t] }))} />
        <FilterRow<PriceKind> label="Typ" value={kind} onChange={setKind} options={PRICE_KINDS.map(k => ({ value: k, label: KIND_LABEL[k] }))} />
        <FilterRow<PriceStatus> label="Status" value={status} onChange={setStatus} options={(['utkast', 'godkand', 'arkiverad'] as PriceStatus[]).map(s => ({ value: s, label: STATUS_LABEL[s] }))} />
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-3 rounded-full border border-border px-4 text-sm font-medium">
          <Switch checked={onlyReview} onCheckedChange={setOnlyReview} aria-label="Behöver kontroll" />
          Behöver kontroll
        </label>
      </div>

      <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
        {summary.total} rader · {summary.utkast} utkast · {summary.godkand} godkända · {summary.saknar_pris} saknar pris
        {summary.gamla > 0 ? ` · ${summary.gamla} äldre än ${maxAge} dagar` : ''}
        {summary.arkiverad > 0 ? ` · ${summary.arkiverad} arkiverade` : ''}
      </p>

      <KalkylSettingsCard settings={settings} currentUser={currentUser} onSaved={() => qc.invalidateQueries({ queryKey: KALKYL_SETTINGS_KEY })} />

      {isLoading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laddar prislistan</div>}
      {error && <p className="text-sm text-destructive">Prislistan kunde inte laddas.</p>}
      {!isLoading && !error && groups.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Inga rader matchar filtret.</p>
      )}

      {groups.map(g => (
        <section key={`${g.trade}-${g.kind}`} className="space-y-2">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            {TRADE_LABEL[g.trade]} <span className="font-normal text-muted-foreground">· {KIND_LABEL[g.kind]}</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">{g.items.length}</span>
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {g.items.map(it => {
              const incl = inclVat(it.price_ex_vat);
              const tb = itemTbPct(it);
              const age = priceAgeLabel(it, today);
              const stale = isStale(it, today, maxAge);
              const reasons = reviewReasons(it, today, maxAge);
              const isSel = selected.has(it.id);
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => (selecting ? toggle(it.id) : openEditor(it))}
                    aria-pressed={selecting ? isSel : undefined}
                    className={cn('flex w-full min-h-[64px] items-start gap-3 px-3 py-3 text-left transition-colors active:bg-muted', isSel && 'bg-secondary')}
                  >
                    {selecting && <Checkbox checked={isSel} className="mt-3.5 h-5 w-5" tabIndex={-1} aria-hidden="true" />}
                    <PriceSwatch item={it} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{it.name}</span>
                        {it.spec && <span className="text-sm text-muted-foreground">{it.spec}</span>}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{it.code}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {it.pack_size != null && <span>{String(it.pack_size).replace('.', ',')} {it.unit} per {it.pack_label ?? 'förp.'}</span>}
                        {Number(it.waste_pct) > 0 && <span>spill {String(it.waste_pct).replace('.', ',')} %</span>}
                        {it.coverage != null && <span>{String(it.coverage).replace('.', ',')} m²/l</span>}
                        {(it.supplier || it.article_no) && <span>{[it.supplier, it.article_no].filter(Boolean).join(' · ')}</span>}
                        {age && <span className={cn(stale && 'font-semibold text-warning-ink')}>{it.price_date} ({age})</span>}
                      </div>
                    </div>
                    <div className="shrink-0 space-y-1 text-right">
                      {it.price_ex_vat != null ? (
                        <>
                          <div className="font-mono text-sm font-semibold">{kr2(Number(it.price_ex_vat))} kr<span className="font-sans text-xs font-normal text-muted-foreground">/{it.unit}</span></div>
                          <div className="text-xs text-muted-foreground">{kr0(incl ?? 0)} kr inkl. moms</div>
                        </>
                      ) : (
                        <Chip tone="danger">Pris saknas</Chip>
                      )}
                      {it.cost_ex_vat != null && (
                        <div className="text-xs text-muted-foreground">kostnad {kr2(Number(it.cost_ex_vat))}{tb != null ? ` · TB ${tb.toLocaleString('sv-SE')} %` : ''}</div>
                      )}
                      <div className="flex justify-end gap-1">
                        <Chip tone={statusTone(it.status)}>{STATUS_LABEL[it.status]}</Chip>
                        {reasons.includes('gammalt') && <Chip tone="warning">Gammalt</Chip>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {canApprove && selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 py-3 backdrop-blur md:px-4" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <span className="flex-1 text-sm font-medium">{selected.size} valda</span>
            <Button variant="ghost" className="h-11" onClick={stopSelecting}><X /> Avbryt</Button>
            <Button className="h-11" onClick={approveSelected} disabled={!selected.size || approving}>
              {approving ? <Loader2 className="animate-spin" /> : <Check />} Godkänn valda
            </Button>
          </div>
        </div>
      )}

      <PriceItemSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        item={editing}
        existingCodes={existingCodes}
        currentUser={currentUser}
        canApprove={canApprove}
        onSaved={refresh}
        items={items}
      />
      <PriceImportSheet open={importOpen} onOpenChange={setImportOpen} existing={items} currentUser={currentUser} onImported={refresh} />
    </div>
  );
}
