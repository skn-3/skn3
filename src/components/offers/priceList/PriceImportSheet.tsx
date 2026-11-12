import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/chip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  applyPriceEdit, diffPriceImport, importRowPatch, parsePriceImport, IMPORT_FIELD_LABEL, IMPORT_HEADERS,
  type ImportDiffRow, type PriceItem,
} from '@/lib/kalkyl';
import { insertPriceItems, updatePriceItem } from './api';

const STATUS_META: Record<ImportDiffRow['status'], { label: string; tone: 'success' | 'info' | 'neutral' | 'danger' }> = {
  ny: { label: 'Ny', tone: 'success' },
  andrad: { label: 'Ändrad', tone: 'info' },
  oforandrad: { label: 'Oförändrad', tone: 'neutral' },
  fel: { label: 'Fel', tone: 'danger' },
};

const show = (v: unknown) => (v == null || v === '' ? 'tomt' : typeof v === 'number' ? v.toLocaleString('sv-SE') : String(v));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: PriceItem[];
  currentUser: string;
  onImported: () => void;
}

export function PriceImportSheet({ open, onOpenChange, existing, currentUser, onImported }: Props) {
  const isMobile = useIsMobile();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setText(''); }, [open]);

  const parsed = useMemo(() => (text.trim() ? parsePriceImport(text) : null), [text]);
  const diff = useMemo(() => (parsed && !parsed.errors.length ? diffPriceImport(parsed.rows, existing) : []), [parsed, existing]);
  const toImport = diff.filter(d => d.status === 'ny' || d.status === 'andrad');
  const counts = useMemo(() => {
    const c = { ny: 0, andrad: 0, oforandrad: 0, fel: 0 };
    for (const d of diff) c[d.status] += 1;
    return c;
  }, [diff]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try { setText(await file.text()); }
    catch { toast.error('Filen kunde inte läsas'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  /** Importerar nya och ändrade rader som utkast. Importen godkänner aldrig något. */
  async function runImport() {
    if (!toImport.length) return;
    setBusy(true);
    const now = new Date();
    try {
      const fresh = toImport.filter(d => d.status === 'ny').map(d => {
        const base = { status: 'utkast', approved_by: null, approved_at: null, meta: {}, waste_pct: 0, sort_order: 0 } as unknown as PriceItem;
        return applyPriceEdit(base, { ...importRowPatch(d.row), status: 'utkast' }, currentUser, now, false);
      });
      await insertPriceItems(fresh);
      for (const d of toImport.filter(x => x.status === 'andrad')) {
        const { code: _code, ...patch } = importRowPatch(d.row, d.existing);
        const next = applyPriceEdit(d.existing!, { ...patch, status: 'utkast' }, currentUser, now, false);
        await updatePriceItem(d.existing!.id, next);
      }
      toast.success(`${toImport.length} rader importerade som utkast`);
      onImported();
      onOpenChange(false);
    } catch (e) {
      toast.error('Importen avbröts', { description: e instanceof Error ? e.message : String(e) });
      onImported();
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-2xl')}>
        <SheetHeader className="text-left">
          <SheetTitle>Importera prisark</SheetTitle>
          <SheetDescription>
            Klistra in från kalkylark eller ladda upp en CSV-fil (semikolon eller tabb, decimalkomma). Alla importerade rader blir utkast och måste godkännas.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-24">
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            <Button type="button" variant="outline" className="h-11" onClick={() => fileRef.current?.click()}>
              <FileUp /> Ladda upp CSV
            </Button>
          </div>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={IMPORT_HEADERS.join(';')}
            className="min-h-[160px] font-mono text-xs"
            aria-label="Inklistrat prisark"
          />
          <p className="text-xs text-muted-foreground">
            Rubriker: <span className="font-mono">{IMPORT_HEADERS.join(', ')}</span>. Kod, gren, typ, rot, namn och enhet krävs. Ett tomt pris betyder att priset saknas. Arbetskod anger golvmaterialets läggningsrad; en tom cell ändrar inte en befintlig rad.
          </p>

          {parsed?.errors.length ? (
            <div className="rounded-md border border-destructive/40 bg-destructive-soft p-3 text-sm text-destructive">
              {parsed.errors.map(e => <div key={e}>{e}</div>)}
            </div>
          ) : null}

          {diff.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Chip tone="success">{counts.ny} nya</Chip>
                <Chip tone="info">{counts.andrad} ändrade</Chip>
                <Chip tone="neutral">{counts.oforandrad} oförändrade</Chip>
                {counts.fel > 0 && <Chip tone="danger">{counts.fel} med fel</Chip>}
              </div>
              <ul className="divide-y divide-border rounded-md border border-border">
                {diff.map(d => (
                  <li key={`${d.row.line}-${d.row.code}`} className="space-y-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={STATUS_META[d.status].tone}>{STATUS_META[d.status].label}</Chip>
                      <span className="text-sm font-medium">{d.row.values.name || '(utan namn)'}</span>
                      <span className="font-mono text-xs text-muted-foreground">{d.row.code || '–'} · rad {d.row.line}</span>
                    </div>
                    {d.status === 'fel' && <div className="text-xs text-destructive">{d.row.errors.join(' · ')}</div>}
                    {d.status === 'andrad' && (
                      <ul className="text-xs text-muted-foreground">
                        {d.changes.map(c => (
                          <li key={c.field}><span className="font-mono">{IMPORT_FIELD_LABEL[c.field]}</span>: {show(c.old)} → <span className="text-foreground">{show(c.new)}</span></li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-3">
          <Button className="h-11 w-full" onClick={runImport} disabled={busy || toImport.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Importera {toImport.length} rader som utkast
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
