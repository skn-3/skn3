// Varningstexter från bokningstjänsten. Egen modul utan Supabase så att ren logik
// (t.ex. bookingOutcome) kan läsa dem.
export const EVENT_WARNING = 'Händelsen kunde inte sparas i historiken, men bokningen är sparad.';
export const COORDINATOR_MAIL_WARNING = 'Status uppdaterad men mailet kunde inte skickas';
export const SMS_NO_PHONE_WARNING = 'Kundens telefonnummer saknas eller är ogiltigt — inget SMS skickades';
export const SMS_FAILED_WARNING = 'SMS till kunden kunde inte skickas, men bokningen är sparad.';
export const teamMailWarning = (team: string) => `Mejlet till ${team} kunde inte skickas, men bokningen är sparad.`;

/** Varningar som visas som information snarare än varning. */
export const INFO_WARNINGS: readonly string[] = [SMS_NO_PHONE_WARNING];
