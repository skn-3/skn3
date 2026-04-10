export const SELLERS = ['Daniel Malke', 'Gabriel Hanna'] as const;
export const MONTORS = ['GVMO', 'Samy', 'Alex NBD', 'Jerk'] as const;

export type RoleType = 'seller' | 'montor';

export interface UserRole {
  type: RoleType;
  name: string;
}

export const STATUS_LABELS: Record<string, string> = {
  ny: 'Ny',
  vantar_km: 'Väntar KM',
  km_bokad: 'KM bokad',
  km_klar: 'KM klar',
  vantar_godkannande: 'Väntar godkännande',
  godkand: 'Godkänd',
  i_produktion: 'I produktion',
  leverans_klar: 'Leverans klar',
  montage_bokat: 'Montage bokat',
  montage_klart: 'Montage klart',
  fakturerad: 'Fakturerad',
  pausad: 'Pausad',
};

export const SELLER_PIPELINE_COLUMNS = [
  'ny',
  'vantar_km',
  'km_bokad',
  'vantar_godkannande',
  'godkand',
  'leverans_klar',
  'montage_bokat',
  'montage_klart',
  'pausad',
] as const;

export const DEVIATION_TYPES = [
  { value: 'fabriksfel', label: 'Fabriksfel' },
  { value: 'felmatning', label: 'Felmätning' },
  { value: 'extra_material', label: 'Extra material' },
  { value: 'ovrigt', label: 'Övrigt' },
] as const;

export const DEVIATION_RESPONSIBLE = [
  { value: 'fabrik', label: 'Fabrik' },
  { value: 'saljare', label: 'Säljare' },
  { value: 'montor', label: 'Montör' },
  { value: 'okant', label: 'Okänt' },
] as const;

export const VISIT_RESULTS = [
  { value: 'signerat', label: 'Signerat avtal' },
  { value: 'nej', label: 'Nej' },
  { value: 'aterkoppla', label: 'Återkoppla' },
] as const;

export const EMAIL_MAP: Record<string, string> = {
  // Montörer
  'GVMO': 'gvmo.bygg@gmail.com',
  'Samy': 'info@smtmbygg.se',
  'Alex NBD': 'alex@nbdentreprenad.com',
  'Jerk': 'jerk.ryttman@mockfjards.se',
  // Säljare
  'Daniel Malke': 'daniel.malke@mockfjards.se',
  'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
};

export const COORDINATOR_EMAIL = 'mirna.malke@mockfjards.se';
export const COORDINATOR_CC = 'mf@malke.se';
