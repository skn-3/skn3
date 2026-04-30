export const HOUR_RATE = 469;

export const SELLERS = ['Daniel Malke', 'Gabriel Hanna'] as const;
export const MONTORS = ['GVMO', 'Samy', 'Alex NBD', 'Jerk'] as const;

export const MONTOR_PHONES: Record<string, string> = {
  'GVMO': '0707654751',
  'Samy': '0733930666',
  'Alex NBD': '0707808026',
  'Jerk': '0705799711',
};

// TODO: Byt tillbaka till joakim@byggplatar.se efter test
export const SHEET_METAL_RECIPIENT = 'johannes@malke.se';
export const SHEET_METAL_CC = 'mf@malke.se';

export type RoleType = 'seller' | 'montor';

export interface UserRole {
  type: RoleType;
  name: string;
  isAdmin?: boolean;
}

export const PIN_CODES: Record<string, string> = {
  'Daniel Malke': '1234',
  'Gabriel Hanna': '5678',
  'GVMO': '1111',
  'Samy': '2222',
  'Alex NBD': '3333',
  'Jerk': '4444',
};

export const ADMIN_USERS = ['Daniel Malke'];

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
  'km_klar',
  'vantar_godkannande',
  'godkand',
  'leverans_klar',
  'montage_bokat',
  'montage_klart',
  'fakturerad',
  'pausad',
] as const;

export const DEVIATION_TYPES = [
  { value: 'reklamation', label: 'Reklamation' },
  { value: 'felmatning', label: 'Felmätning' },
  { value: 'fabriksfel', label: 'Fabriksfel' },
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
