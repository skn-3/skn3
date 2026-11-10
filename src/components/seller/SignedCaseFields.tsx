import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { isValidUnits, type SignedCaseFieldValues } from '@/lib/signedCase';

interface SignedCaseFieldsProps {
  values: SignedCaseFieldValues;
  onChange: (key: keyof SignedCaseFieldValues, value: string | boolean) => void;
  offerNumberTouched: boolean;
  onOfferNumberTouched: () => void;
  /** Visas direkt under "Antal enheter" (t.ex. besökets klimat-QR). */
  afterUnits?: ReactNode;
}

/**
 * Fältblocket för ett signerat ärende. Delas av VisitForm (Signerat) och SignedCaseDialog
 * så att formulären inte glider isär.
 */
export function SignedCaseFields({ values, onChange, offerNumberTouched, onOfferNumberTouched, afterUnits }: SignedCaseFieldsProps) {
  const unitsValid = isValidUnits(values.units);
  const offerNumberMissing = offerNumberTouched && !values.offer_number.trim();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="signed-units">Antal enheter *</Label>
          <Input
            id="signed-units"
            type="number"
            min={1}
            step={1}
            placeholder="Minst 1"
            value={values.units}
            onChange={(e) => onChange('units', e.target.value)}
          />
          {values.units !== '' && !unitsValid && (
            <p className="text-xs text-destructive">Antal enheter måste vara minst 1.</p>
          )}
        </div>
      </div>

      {afterUnits}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="signed-city">Ort *</Label>
          <Input id="signed-city" value={values.city} onChange={(e) => onChange('city', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signed-offer-number">Affärsförslagsnummer (Mockfjärds) *</Label>
          <Input
            id="signed-offer-number"
            value={values.offer_number}
            onChange={(e) => {
              onOfferNumberTouched();
              onChange('offer_number', e.target.value);
            }}
            onBlur={onOfferNumberTouched}
            aria-invalid={offerNumberMissing}
          />
          {offerNumberMissing && (
            <p className="text-xs text-destructive">Affärsförslagsnumret måste fyllas i.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signed-order-value">
            Ordervärde (kr){' '}
            <span className="text-muted-foreground text-xs ml-1">ex moms</span>
          </Label>
          <Input
            id="signed-order-value"
            type="number"
            inputMode="decimal"
            value={values.order_value}
            onChange={(e) => onChange('order_value', e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Telefon, TB, montörer m.m. kompletteras efter kontrollmätningen.
      </p>

      <div className="space-y-2 rounded-lg border bg-card/60 p-3">
        <h3 className="text-sm font-semibold text-foreground">Att tänka på vid montage</h3>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.media_consent}
            onCheckedChange={(c) => onChange('media_consent', c === true)}
          />
          Foto/film överenskommet med kund
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={values.carry_help_needed}
            onCheckedChange={(c) => onChange('carry_help_needed', c === true)}
          />
          Behövs bärhjälp?
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <Checkbox
              checked={values.scheduled_delivery}
              onCheckedChange={(c) => onChange('scheduled_delivery', c === true)}
            />
            Tidsstyrd leverans (tidslossning)
          </span>
          {values.scheduled_delivery && (
            <span className="text-xs text-muted-foreground pl-6">
              Tiden anges senare, veckan innan leverans
            </span>
          )}
        </label>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={values.future_job}
            onCheckedChange={(c) => onChange('future_job', c === true)}
          />
          Kund vill utföra ett annat jobb
        </label>
        {values.future_job && (
          <div className="space-y-2 pl-6">
            <div className="space-y-1.5">
              <Label>Vad vill kunden utföra? *</Label>
              <Textarea
                rows={2}
                value={values.future_job_description}
                onChange={(e) => onChange('future_job_description', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>När ska kunden kontaktas? *</Label>
              <Input
                type="date"
                value={values.future_job_date}
                onChange={(e) => onChange('future_job_date', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
