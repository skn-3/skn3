import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { parseSvNumber, validateKalkylSettings, type KalkylSettings } from '@/lib/kalkyl';
import { saveKalkylSettings } from './api';

const FIELDS: { key: keyof KalkylSettings; label: string; suffix: string }[] = [
  { key: 'margin_target_pct', label: 'Marginalmål (TB)', suffix: '%' },
  { key: 'price_max_age_days', label: 'Max prisålder', suffix: 'dagar' },
  { key: 'door_width_m', label: 'Dörr, bredd', suffix: 'm' },
  { key: 'door_height_m', label: 'Dörr, höjd', suffix: 'm' },
  { key: 'window_width_m', label: 'Fönster, bredd', suffix: 'm' },
  { key: 'window_height_m', label: 'Fönster, höjd', suffix: 'm' },
];

const toStrings = (s: KalkylSettings) => Object.fromEntries(FIELDS.map(f => [f.key, String(s[f.key]).replace('.', ',')])) as Record<keyof KalkylSettings, string>;

export function KalkylSettingsCard({ settings, currentUser, onSaved }: { settings: KalkylSettings; currentUser: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => toStrings(settings));
  const [errors, setErrors] = useState<Partial<Record<keyof KalkylSettings, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValues(toStrings(settings)); }, [settings]);

  async function save() {
    const next = { ...settings };
    const errs: Partial<Record<keyof KalkylSettings, string>> = {};
    for (const f of FIELDS) {
      const v = parseSvNumber(values[f.key]);
      if (typeof v !== 'number') errs[f.key] = 'Ange ett tal';
      else next[f.key] = v;
    }
    Object.assign(errs, Object.fromEntries(Object.entries(validateKalkylSettings(next)).filter(([k]) => !errs[k as keyof KalkylSettings])));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await saveKalkylSettings(next, currentUser);
      toast.success('Inställningarna är sparade');
      onSaved();
    } catch (e) {
      toast.error('Kunde inte spara', { description: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger className="flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-sm font-semibold">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">Inställningar för kalkylen</span>
        <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
          Mål {settings.margin_target_pct} % · max {settings.price_max_age_days} dagar
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-border px-4 py-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {FIELDS.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`ks-${f.key}`} className="text-xs font-semibold text-muted-foreground">{f.label}</Label>
              <div className="relative">
                <Input id={`ks-${f.key}`} inputMode="decimal" className="h-11 pr-14" value={values[f.key]}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.suffix}</span>
              </div>
              {errors[f.key] && <p className="text-xs font-medium text-destructive">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Dörr- och fönstermåtten dras av från vägg- och sockelytor i kalkylen.</p>
        <Button className="h-11" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} Spara inställningar
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
