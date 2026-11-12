import { useId, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { rotRoom } from '@/lib/offerCalc';
import type { KalkylData, OfferMeta } from '@/lib/kalkyl';
import { Segmented } from './ui';
import { kr } from './format';

type Premises = KalkylData['premises'];

function Field({ label, children, error, hint }: { label: string; children: (id: string) => ReactNode; error?: string | null; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children(id)}
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const intOrNull = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const numOr = (v: string, d: number) => { const n = Number(v.replace(',', '.')); return v.trim() === '' || !Number.isFinite(n) ? d : n; };
const input = 'h-11 text-base';

export function OfferDetailsSheet({ open, onOpenChange, meta, onMeta, premises, onPremises, nameError, readOnly, onFillDescription, isNew }: {
  open: boolean; onOpenChange: (v: boolean) => void; meta: OfferMeta; onMeta: (patch: Partial<OfferMeta>) => void;
  premises: Premises; onPremises: (patch: Partial<Premises>) => void; nameError: boolean; readOnly: boolean; onFillDescription: () => void; isNew: boolean;
}) {
  const isMobile = useIsMobile();
  const privat = meta.customer_type === 'privat';
  const rotPossible = privat && meta.vat_mode === 'vanlig';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('overflow-y-auto', isMobile ? 'max-h-[92dvh]' : 'w-full sm:max-w-xl')}>
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{isNew ? 'Ny offert' : 'Kund och offert'}</SheetTitle>
          <SheetDescription>{isNew ? 'Börja med kundens namn. Resten kan du fylla i senare.' : 'Uppgifterna sparas med kalkylen.'}</SheetDescription>
        </SheetHeader>
        <fieldset disabled={readOnly} className="mt-5 space-y-6">
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Kund</h3>
            <Segmented label="Kundtyp" value={meta.customer_type} onChange={v => onMeta({ customer_type: v })} className="w-full" size="lg"
              options={[{ value: 'privat', label: 'Privatperson' }, { value: 'foretag', label: 'Företag eller BRF' }]} />
            <Field label="Namn" error={nameError ? 'Ange kundens namn för att kunna spara.' : null}>
              {id => <Input id={id} className={input} value={meta.customer_name} onChange={e => onMeta({ customer_name: e.target.value })} aria-invalid={nameError} autoComplete="off" />}
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="E-post">{id => <Input id={id} type="email" className={input} value={meta.customer_email} onChange={e => onMeta({ customer_email: e.target.value })} autoComplete="off" />}</Field>
              <Field label="Telefon">{id => <Input id={id} type="tel" className={input} value={meta.customer_phone} onChange={e => onMeta({ customer_phone: e.target.value })} autoComplete="off" />}</Field>
            </div>
            <Field label="Adress">{id => <Input id={id} className={input} value={meta.customer_address} onChange={e => onMeta({ customer_address: e.target.value })} autoComplete="off" />}</Field>
            {privat && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Personnummer">{id => <Input id={id} className={input} value={meta.customer_personnummer} onChange={e => onMeta({ customer_personnummer: e.target.value })} placeholder="ÅÅÅÅMMDD-XXXX" />}</Field>
                <Field label="Fastighetsbeteckning">{id => <Input id={id} className={input} value={meta.fastighetsbeteckning} onChange={e => onMeta({ fastighetsbeteckning: e.target.value })} />}</Field>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Hus</h3>
            <Field label="Hustyp">
              {id => (
                <select id={id} className={cn(input, 'w-full rounded-md border border-input bg-background px-3')} value={premises.house_type ?? ''}
                  onChange={e => onPremises({ house_type: (e.target.value || null) as Premises['house_type'] })}>
                  <option value="">Ej angivet</option>
                  <option value="villa">Villa</option>
                  <option value="radhus">Radhus</option>
                  <option value="bostadsratt">Bostadsrätt</option>
                  <option value="fritidshus">Fritidshus</option>
                  <option value="annat">Annat</option>
                </select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Antal plan">{id => <Input id={id} inputMode="numeric" className={input} value={premises.floors ?? ''} onChange={e => onPremises({ floors: intOrNull(e.target.value) })} />}</Field>
              <Field label="Byggår" hint="Används för ROT-kontrollen.">{id => <Input id={id} inputMode="numeric" className={input} value={premises.build_year ?? ''} onChange={e => onPremises({ build_year: intOrNull(e.target.value) })} />}</Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Moms och ROT</h3>
            <Segmented label="Momsläge" value={meta.vat_mode} onChange={v => onMeta({ vat_mode: v })} className="w-full" size="lg"
              options={[{ value: 'vanlig', label: 'Vanlig moms 25 %' }, { value: 'omvand', label: 'Omvänd byggmoms' }]} />
            {rotPossible ? (
              <>
                <label className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
                  <span className="text-sm font-medium">ROT-avdrag på arbetet</span>
                  <Switch checked={meta.rot_enabled} onCheckedChange={v => onMeta({ rot_enabled: v })} />
                </label>
                {meta.rot_enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Procent">{id => <Input id={id} inputMode="decimal" className={input} value={meta.rot_percent} onChange={e => onMeta({ rot_percent: numOr(e.target.value, 30) })} />}</Field>
                    <Field label="Personer med ROT">
                      {id => (
                        <select id={id} className={cn(input, 'w-full rounded-md border border-input bg-background px-3')} value={meta.rot_persons} onChange={e => onMeta({ rot_persons: Number(e.target.value) })}>
                          {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'personer'}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label="Redan utnyttjat i år">{id => <Input id={id} inputMode="numeric" className={input} value={meta.rot_used} onChange={e => onMeta({ rot_used: Math.max(0, numOr(e.target.value, 0)) })} />}</Field>
                    <p className="sm:col-span-3 text-xs text-muted-foreground">Avdragsutrymme {kr(rotRoom(meta))}. Avdraget i offerten blir aldrig större än så.</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{privat ? 'ROT gäller inte vid omvänd byggmoms.' : 'ROT gäller bara privatpersoner.'}</p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Offert</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giltig t.o.m.">{id => <Input id={id} type="date" className={input} value={meta.valid_until} onChange={e => onMeta({ valid_until: e.target.value })} />}</Field>
              <Field label="Handpenning i procent">{id => <Input id={id} inputMode="numeric" className={input} value={meta.handpenning_percent} onChange={e => onMeta({ handpenning_percent: Math.min(100, Math.max(0, numOr(e.target.value, 25))) })} />}</Field>
            </div>
            <Field label="Titel" hint="Lämnas den tom byggs den från kalkylen vid varje sparning.">
              {id => <Input id={id} className={input} value={meta.title} onChange={e => onMeta({ title: e.target.value })} />}
            </Field>
            <Field label="Beskrivning" hint="Lämnas den tom byggs den från kalkylen vid varje sparning.">
              {id => <Textarea id={id} rows={5} className="text-base" value={meta.description} onChange={e => onMeta({ description: e.target.value })} />}
            </Field>
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={onFillDescription}>Fyll i beskrivning från kalkylen</Button>
          </section>
        </fieldset>
        <div className="sticky -bottom-6 -mx-6 -mb-6 mt-6 border-t border-border bg-background px-6 pt-3 pb-6">
          <Button type="button" className="w-full min-h-[44px]" onClick={() => onOpenChange(false)}>Klar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
