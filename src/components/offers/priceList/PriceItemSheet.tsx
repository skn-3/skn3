import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2, Archive, Check, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/chip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  applyPriceEdit, parseKulor, parseSvNumber, normalizePriceCode, inclVat, itemTbPct,
  PRICE_TRADES, PRICE_KINDS, ROT_CLASSES, PRICE_UNITS, PRICE_LEVELS, TRADE_LABEL, KIND_LABEL, STATUS_LABEL,
  type PriceItem, type PricePatch, type Swatch,
} from '@/lib/kalkyl';
import { fetchPriceLog, insertPriceItems, priceLogKey, updatePriceItem, uploadCatalogImage, type PriceLogRow } from './api';
import { PriceSwatch } from './PriceSwatch';

type Form = Record<
  'code' | 'trade' | 'kind' | 'rot_class' | 'slot' | 'name' | 'spec' | 'unit' | 'price_ex_vat' | 'cost_ex_vat' | 'hours_per_unit' |
  'level' | 'pack_size' | 'pack_label' | 'waste_pct' | 'coverage' | 'color_system' | 'color_code' | 'color_hex' |
  'swatch_color' | 'swatch_line' | 'swatch_pattern' | 'swatch_step' | 'image_path' | 'article_no' | 'supplier' | 'source' |
  'price_date' | 'meta' | 'sort_order',
  string
>;

const num = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));
const todayIso = () => new Date().toISOString().slice(0, 10);
const kr = (n: number | null) => (n == null ? '–' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr');

function toForm(item: PriceItem | null): Form {
  return {
    code: item?.code ?? '', trade: item?.trade ?? 'golv', kind: item?.kind ?? 'material', rot_class: item?.rot_class ?? 'material',
    slot: item?.slot ?? '', name: item?.name ?? '', spec: item?.spec ?? '', unit: item?.unit ?? 'm²',
    price_ex_vat: num(item?.price_ex_vat), cost_ex_vat: num(item?.cost_ex_vat), hours_per_unit: num(item?.hours_per_unit),
    level: item?.level ?? '', pack_size: num(item?.pack_size), pack_label: item?.pack_label ?? '', waste_pct: num(item?.waste_pct ?? 0),
    coverage: num(item?.coverage), color_system: item?.color_system ?? '', color_code: item?.color_code ?? '', color_hex: item?.color_hex ?? '',
    swatch_color: item?.swatch?.color ?? '', swatch_line: item?.swatch?.line ?? '', swatch_pattern: item?.swatch?.pattern ?? '',
    swatch_step: item?.swatch?.step != null ? String(item.swatch.step) : '', image_path: item?.image_path ?? '',
    article_no: item?.article_no ?? '', supplier: item?.supplier ?? '', source: item?.source ?? '',
    price_date: item?.price_date ?? (item ? '' : todayIso()), meta: JSON.stringify(item?.meta ?? {}, null, 0), sort_order: String(item?.sort_order ?? 0),
  };
}

/** Formulär → ändring. Tomma prisfält blir NULL (saknas), aldrig 0. */
function toPatch(f: Form): { patch: PricePatch; errors: Partial<Record<keyof Form, string>> } {
  const errors: Partial<Record<keyof Form, string>> = {};
  const n = (key: keyof Form, opts: { required?: boolean } = {}) => {
    const v = parseSvNumber(f[key]);
    if (v === 'invalid' || (v != null && v < 0)) { errors[key] = 'Ange ett tal'; return null; }
    if (v == null && opts.required) { errors[key] = 'Obligatoriskt'; return null; }
    return v;
  };
  const t = (v: string) => (v.trim() === '' ? null : v.trim());
  const code = normalizePriceCode(f.code);
  if (!code) errors.code = 'Ange en kod';
  if (!f.name.trim()) errors.name = 'Ange ett namn';
  let meta: Record<string, unknown> = {};
  try { meta = f.meta.trim() ? JSON.parse(f.meta) : {}; if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error(); }
  catch { errors.meta = 'Ogiltig JSON'; }
  let color_code = t(f.color_code);
  let color_hex = t(f.color_hex);
  const color_system = f.color_system === 'NCS' || f.color_system === 'RAL' ? f.color_system : null;
  if (color_code) {
    const k = parseKulor(color_code, color_system ?? undefined);
    if (!k) errors.color_code = color_system ? `Ogiltig ${color_system}-kod` : 'Välj kulörsystem eller skriv RAL före koden';
    else { color_code = k.code; if (!color_hex && k.hex) color_hex = k.hex; }
  }
  const swatch: Swatch | null = f.swatch_color.trim()
    ? { color: f.swatch_color.trim(), ...(t(f.swatch_line) ? { line: f.swatch_line.trim() } : {}), ...(t(f.swatch_pattern) ? { pattern: f.swatch_pattern } : {}), ...(Number(f.swatch_step) > 0 ? { step: Number(f.swatch_step) } : {}) }
    : null;
  const date = t(f.price_date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.price_date = 'ÅÅÅÅ-MM-DD';
  const patch: PricePatch = {
    code, trade: f.trade as PriceItem['trade'], kind: f.kind as PriceItem['kind'], rot_class: f.rot_class as PriceItem['rot_class'],
    slot: t(f.slot), name: f.name.trim(), spec: t(f.spec), unit: f.unit,
    price_ex_vat: n('price_ex_vat'), cost_ex_vat: n('cost_ex_vat'), hours_per_unit: n('hours_per_unit'),
    level: (t(f.level) as PriceItem['level']) ?? null, pack_size: n('pack_size'), pack_label: t(f.pack_label),
    waste_pct: n('waste_pct') ?? 0, coverage: n('coverage'),
    color_system: color_system ?? (color_code?.startsWith('RAL') ? 'RAL' : color_code ? 'NCS' : null),
    color_code, color_hex, swatch, image_path: t(f.image_path),
    article_no: t(f.article_no), supplier: t(f.supplier), source: t(f.source), price_date: date,
    meta, sort_order: Math.round(Number(f.sort_order) || 0),
  };
  return { patch, errors };
}

const FIELD_LABEL: Record<string, string> = { price_ex_vat: 'Kundpris', cost_ex_vat: 'Kostnad', status: 'Status' };
function logText(r: PriceLogRow) {
  const fmt = (v: string | null) => (r.field === 'status' ? (STATUS_LABEL as Record<string, string>)[v ?? ''] ?? (v ?? '–') : v == null ? 'tomt' : Number(v).toLocaleString('sv-SE', { minimumFractionDigits: 2 }));
  return `${FIELD_LABEL[r.field] ?? r.field}: ${fmt(r.old_value)} → ${fmt(r.new_value)}`;
}

function Field({ label, error, children, className, hint }: { label: string; error?: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function Select({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel: string }) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)}
      className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PriceItem | null;
  existingCodes: Set<string>;
  currentUser: string;
  onSaved: () => void;
}

export function PriceItemSheet({ open, onOpenChange, item, existingCodes, currentUser, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState<Form>(() => toForm(item));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState<null | 'draft' | 'approve' | 'archive' | 'image'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = !item;

  useEffect(() => { if (open) { setForm(toForm(item)); setErrors({}); } }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: log = [] } = useQuery({
    queryKey: item ? priceLogKey(item.id) : ['price_log', 'none'],
    queryFn: () => fetchPriceLog(item!.id),
    enabled: open && !!item,
  });

  const set = (key: keyof Form) => (v: string) => setForm(prev => {
    const next = { ...prev, [key]: v };
    // Nytt kundpris får dagens prisdatum om datumet inte redan ändrats.
    if (key === 'price_ex_vat' && prev.price_date === (item?.price_date ?? prev.price_date)) next.price_date = todayIso();
    return next;
  });
  const input = (key: keyof Form, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input value={form[key]} onChange={e => set(key)(e.target.value)} className="h-11" aria-label={props['aria-label']} {...props} />
  );

  const preview = useMemo(() => {
    const p = parseSvNumber(form.price_ex_vat); const c = parseSvNumber(form.cost_ex_vat);
    const price = typeof p === 'number' ? p : null; const cost = typeof c === 'number' ? c : null;
    return { incl: inclVat(price), tb: itemTbPct({ price_ex_vat: price, cost_ex_vat: cost }) };
  }, [form.price_ex_vat, form.cost_ex_vat]);

  async function save(mode: 'draft' | 'approve' | 'archive') {
    const { patch, errors: errs } = toPatch(form);
    if (isNew && patch.code && existingCodes.has(patch.code)) errs.code = 'Koden finns redan';
    if (mode === 'approve' && patch.price_ex_vat == null && !errs.price_ex_vat) errs.price_ex_vat = 'Ett pris måste finnas för att godkännas';
    setErrors(errs);
    if (Object.keys(errs).length) { toast.error('Kontrollera de markerade fälten'); return; }
    setBusy(mode);
    try {
      const now = new Date();
      if (isNew) {
        const draft = { status: 'utkast', approved_by: null, approved_at: null, meta: {}, waste_pct: 0, sort_order: 0 } as unknown as PriceItem;
        const next = applyPriceEdit(draft, { ...patch, status: 'utkast' }, currentUser, now, mode === 'approve');
        await insertPriceItems([next]);
      } else {
        const statusPatch: PricePatch = mode === 'archive' ? { status: 'arkiverad' } : mode === 'draft' ? { status: 'utkast' } : {};
        const { code: _code, ...rest } = patch; // koden är stabil när raden finns
        const base = mode === 'archive' ? statusPatch : { ...rest, ...statusPatch };
        const next = applyPriceEdit(item!, base, currentUser, now, mode === 'approve');
        await updatePriceItem(item!.id, next);
      }
      toast.success(mode === 'approve' ? 'Sparad och godkänd' : mode === 'archive' ? 'Raden är arkiverad' : 'Sparad som utkast');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error('Kunde inte spara', { description: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setBusy('image');
    try {
      const path = await uploadCatalogImage(file, normalizePriceCode(form.code) || item?.code || 'ny');
      setForm(prev => ({ ...prev, image_path: path }));
      toast.success('Bilden är uppladdad. Spara för att behålla den.');
    } catch (e) {
      toast.error('Bilden kunde inte laddas upp', { description: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  }

  const opt = <T extends string>(values: readonly T[], labels?: Record<string, string>) => values.map(v => ({ value: v, label: labels?.[v] ?? v }));
  const swatchPreview = toPatch(form).patch;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-xl')}>
        <SheetHeader className="text-left">
          <SheetTitle>{isNew ? 'Ny prisrad' : item!.name}</SheetTitle>
          <SheetDescription>
            {isNew ? 'Priser anges exklusive moms. Ett tomt pris betyder att priset saknas.' : (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{item!.code}</span>
                <Chip tone={item!.status === 'godkand' ? 'success' : item!.status === 'arkiverad' ? 'neutral' : 'warning'}>{STATUS_LABEL[item!.status]}</Chip>
                {item!.approved_by && item!.status === 'godkand' && <span className="text-xs">Godkänd av {item!.approved_by}</span>}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6 pb-28">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Grund</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Kod" error={errors.code} hint={isNew ? 'Stabil nyckel i gemener, t.ex. golv.mat.ekparkett-3stav' : 'Koden kan inte ändras'} className="sm:col-span-2">
                {input('code', { readOnly: !isNew, className: cn('h-11 font-mono', !isNew && 'bg-muted'), 'aria-label': 'Kod' })}
              </Field>
              <Field label="Namn (kundtext)" error={errors.name} className="sm:col-span-2">{input('name', { 'aria-label': 'Namn' })}</Field>
              <Field label="Spec" className="sm:col-span-2">{input('spec', { 'aria-label': 'Spec', placeholder: 't.ex. 14 mm, mattlack' })}</Field>
              <Field label="Gren"><Select ariaLabel="Gren" value={form.trade} onChange={set('trade')} options={opt(PRICE_TRADES, TRADE_LABEL)} /></Field>
              <Field label="Typ"><Select ariaLabel="Typ" value={form.kind} onChange={set('kind')} options={opt(PRICE_KINDS, KIND_LABEL)} /></Field>
              <Field label="ROT-klass" hint="Bara arbete ger ROT"><Select ariaLabel="ROT-klass" value={form.rot_class} onChange={set('rot_class')} options={opt(ROT_CLASSES, { arbete: 'Arbete', material: 'Material', ovrigt: 'Övrigt' })} /></Field>
              <Field label="Enhet"><Select ariaLabel="Enhet" value={form.unit} onChange={set('unit')} options={opt(PRICE_UNITS)} /></Field>
              <Field label="Valgrupp">{input('slot', { 'aria-label': 'Valgrupp', placeholder: 't.ex. golv.golvtyp', className: 'h-11 font-mono' })}</Field>
              <Field label="Nivå"><Select ariaLabel="Nivå" value={form.level} onChange={set('level')} options={[{ value: '', label: 'Ingen' }, ...opt(PRICE_LEVELS, { bas: 'Bas', standard: 'Standard', premium: 'Premium' })]} /></Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Pris och kostnad (exklusive moms)</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Kundpris per enhet" error={errors.price_ex_vat} hint={preview.incl != null ? `${kr(preview.incl)} inkl. moms` : 'Tomt = pris saknas'}>
                {input('price_ex_vat', { inputMode: 'decimal', 'aria-label': 'Kundpris per enhet' })}
              </Field>
              <Field label="Kostnad per enhet" error={errors.cost_ex_vat} hint={preview.tb != null ? `TB ${preview.tb.toLocaleString('sv-SE')} %` : 'Inköp eller UE, internt'}>
                {input('cost_ex_vat', { inputMode: 'decimal', 'aria-label': 'Kostnad per enhet' })}
              </Field>
              <Field label="Timmar per enhet" error={errors.hours_per_unit}>{input('hours_per_unit', { inputMode: 'decimal', 'aria-label': 'Timmar per enhet' })}</Field>
              <Field label="Prisdatum" error={errors.price_date}>{input('price_date', { type: 'date', 'aria-label': 'Prisdatum' })}</Field>
              <Field label="Leverantör">{input('supplier', { 'aria-label': 'Leverantör' })}</Field>
              <Field label="Artikelnummer">{input('article_no', { 'aria-label': 'Artikelnummer' })}</Field>
              <Field label="Källa" className="sm:col-span-2">{input('source', { 'aria-label': 'Källa' })}</Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Mängd och förpackning</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Förpackning" error={errors.pack_size} hint="I radens enhet">{input('pack_size', { inputMode: 'decimal', 'aria-label': 'Förpackning' })}</Field>
              <Field label="Förpackningsnamn">{input('pack_label', { 'aria-label': 'Förpackningsnamn', placeholder: 'paket, längd, rulle' })}</Field>
              <Field label="Spill %" error={errors.waste_pct}>{input('waste_pct', { inputMode: 'decimal', 'aria-label': 'Spill i procent' })}</Field>
              <Field label="Åtgång (m² per liter)" error={errors.coverage}>{input('coverage', { inputMode: 'decimal', 'aria-label': 'Åtgång' })}</Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Bild, kulör och provbit</h3>
            <div className="flex items-center gap-3">
              <PriceSwatch item={{ ...swatchPreview, name: form.name, image_path: form.image_path || null } as PriceItem} className="h-16 w-16" />
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => onImage(e.target.files?.[0])} />
                <Button type="button" variant="outline" className="h-11" onClick={() => fileRef.current?.click()} disabled={busy === 'image'}>
                  {busy === 'image' ? <Loader2 className="animate-spin" /> : <ImagePlus />} {form.image_path ? 'Byt bild' : 'Ladda upp bild'}
                </Button>
                {form.image_path && (
                  <Button type="button" variant="ghost" className="h-11" onClick={() => setForm(p => ({ ...p, image_path: '' }))}>
                    <Trash2 /> Ta bort bild
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kulörsystem"><Select ariaLabel="Kulörsystem" value={form.color_system} onChange={set('color_system')} options={[{ value: '', label: 'Inget' }, { value: 'NCS', label: 'NCS' }, { value: 'RAL', label: 'RAL' }]} /></Field>
              <Field label="Kulörkod" error={errors.color_code}>{input('color_code', { 'aria-label': 'Kulörkod', placeholder: 'S 0502-Y eller RAL 9010' })}</Field>
              <Field label="Kulör hex">{input('color_hex', { 'aria-label': 'Kulör hex', placeholder: '#F3F0E6', className: 'h-11 font-mono' })}</Field>
              <Field label="Provbit färg">{input('swatch_color', { 'aria-label': 'Provbit färg', placeholder: '#C9A877', className: 'h-11 font-mono' })}</Field>
              <Field label="Provbit mönster"><Select ariaLabel="Provbit mönster" value={form.swatch_pattern} onChange={set('swatch_pattern')} options={[{ value: '', label: 'Slät' }, { value: 'plank', label: 'Plank' }, { value: 'fiskben', label: 'Fiskben' }]} /></Field>
              <Field label="Provbit linje">{input('swatch_line', { 'aria-label': 'Provbit linje', placeholder: 'rgba(90,62,28,0.34)', className: 'h-11 font-mono' })}</Field>
              <Field label="Provbit steg (px)">{input('swatch_step', { inputMode: 'numeric', 'aria-label': 'Provbit steg' })}</Field>
              <Field label="Sorteringsordning">{input('sort_order', { inputMode: 'numeric', 'aria-label': 'Sorteringsordning' })}</Field>
            </div>
            <Field label="Receptkopplingar (JSON)" error={errors.meta} hint='t.ex. {"lay_code":"golv.arb.lagg-klick"}'>
              <Textarea value={form.meta} onChange={e => set('meta')(e.target.value)} className="min-h-[72px] font-mono text-xs" aria-label="Receptkopplingar" />
            </Field>
          </section>

          {!isNew && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Historik</h3>
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga ändringar av pris, kostnad eller status ännu.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {log.map(r => (
                    <li key={r.id} className="px-3 py-2 text-sm">
                      <div>{logText(r)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.changed_at).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}{r.changed_by ? ` · ${r.changed_by}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 flex flex-wrap gap-2 border-t border-border bg-background px-6 py-3">
          <Button className="h-11 flex-1" variant="outline" onClick={() => save('draft')} disabled={!!busy}>
            {busy === 'draft' ? <Loader2 className="animate-spin" /> : <Save />} Spara som utkast
          </Button>
          <Button className="h-11 flex-1" onClick={() => save('approve')} disabled={!!busy}>
            {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />} Spara och godkänn
          </Button>
          {!isNew && item!.status !== 'arkiverad' && (
            <Button className="h-11" variant="ghost" onClick={() => save('archive')} disabled={!!busy}>
              {busy === 'archive' ? <Loader2 className="animate-spin" /> : <Archive />} Arkivera
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
