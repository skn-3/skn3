import { detectGotland } from '@/lib/constants';
import { CONGARD_TEAM } from '@/components/shared/GotlandBadge';

/**
 * Gemensam registrering av ett signerat ärende — används av både "Registrera besök" (Signerat)
 * och "Signerat avtal" från uppföljningslistan. Ändra fält och ärendepost här, på ett ställe.
 */
export interface SignedCaseFieldValues {
  units: string;
  city: string;
  offer_number: string;
  order_value: string;
  media_consent: boolean;
  carry_help_needed: boolean;
  scheduled_delivery: boolean;
  future_job: boolean;
  future_job_description: string;
  future_job_date: string;
}

export interface SignedCaseInput extends SignedCaseFieldValues {
  customer_name: string;
  address: string;
  customer_email: string;
  /** Kompletteras efter KM; kan vara förifyllt från en befintlig order. */
  customer_phone?: string;
}

export const emptySignedCaseFields = (): SignedCaseFieldValues => ({
  units: '',
  city: '',
  offer_number: '',
  order_value: '',
  media_consent: false,
  carry_help_needed: false,
  scheduled_delivery: false,
  future_job: false,
  future_job_description: '',
  future_job_date: '',
});

export function isValidUnits(units: string): boolean {
  if (units === '') return false;
  const n = Number(units);
  return Number.isFinite(n) && n >= 1 && Number.isInteger(n);
}

export function isEmailInvalid(email: string): boolean {
  const t = email.trim();
  return t !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/** Fälten i Signerat-blocket (utöver kundnamn/adress/e-post) är ifyllda och giltiga. */
export function signedCaseFieldsValid(f: SignedCaseFieldValues): boolean {
  return (
    !!f.city.trim() &&
    !!f.offer_number.trim() &&
    isValidUnits(f.units) &&
    (!f.future_job || (!!f.future_job_description.trim() && !!f.future_job_date))
  );
}

/** Gotland hanteras alltid av Congard (KM och montage); annars tilldelas montör efter KM. */
export function gotlandTeamFor(city: string, address: string): string | null {
  return detectGotland(city, address) ? CONGARD_TEAM : null;
}

/** Ärendeposten för ett signerat ärende. TB, telefon, montörer m.m. kompletteras efter KM. */
export function buildSignedCaseRecord(input: SignedCaseInput, sellerName: string) {
  const isGotland = detectGotland(input.city, input.address);
  const team = isGotland ? CONGARD_TEAM : null;
  return {
    customer_name: input.customer_name,
    // Kolumnen är NOT NULL; behåller ev. förifyllt nummer från befintlig order.
    customer_phone: input.customer_phone || '',
    customer_email: input.customer_email.trim() || null,
    address: input.address,
    city: input.city,
    offer_number: input.offer_number.trim() || null,
    order_value: input.order_value !== '' ? Number(input.order_value) : null,
    tb_percent: null,
    extra_hours_sold: 0,
    units: input.units !== '' ? Math.max(0, Math.floor(Number(input.units))) : null,
    team,
    km_team: team,
    is_gotland: isGotland,
    google_drive_link: null,
    notes: null,
    seller: sellerName,
    status: 'vantar_km' as const,
    media_consent: input.media_consent,
    carry_help_needed: input.carry_help_needed,
    scheduled_delivery: input.scheduled_delivery,
  };
}

/**
 * Ska QR-koden visas efter "Signerat avtal" från uppföljningen?
 * hadVisitTree: true = besöket har redan ett besöksträd (kunden fick QR:n vid besöket),
 * false = inget besöksträd, null = uppslaget misslyckades (visa hellre en gång för mycket).
 * Utan claim_url finns ingen QR att visa.
 */
export function shouldShowSigningQr(hadVisitTree: boolean | null, claimUrl: string | null | undefined): boolean {
  return !!claimUrl && hadVisitTree !== true;
}
