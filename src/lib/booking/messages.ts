// Varningstexter från bokningstjänsten. Egen modul utan Supabase så att ren logik
// (t.ex. bookingOutcome) kan läsa dem.
export const EVENT_WARNING = 'Händelsen kunde inte sparas i historiken, men bokningen är sparad.';
export const COORDINATOR_MAIL_WARNING = 'Status uppdaterad men mailet kunde inte skickas';
export const SMS_NO_PHONE_WARNING = 'Kundens telefonnummer saknas eller är ogiltigt — inget SMS skickades';
export const SMS_FAILED_WARNING = 'SMS till kunden kunde inte skickas, men bokningen är sparad.';
export const teamMailWarning = (team: string) => `Mejlet till ${team} kunde inte skickas, men bokningen är sparad.`;

/** Utkastets lokala backend skickar aldrig mejl eller SMS (svarar { skipped: 'local_backend' }). */
export const LOCAL_BACKEND_WARNING = 'Mejl och SMS skickas inte i testmiljön.';

/** Varningar som visas som information snarare än varning. */
export const INFO_WARNINGS: readonly string[] = [SMS_NO_PHONE_WARNING, LOCAL_BACKEND_WARNING];

/** Svaret från notify-email, send-customer-sms eller calendar-connect när spärren i testmiljön gällde. */
export function isLocalSkip(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { skipped?: unknown }).skipped === 'local_backend';
}
