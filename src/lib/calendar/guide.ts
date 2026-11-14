// Texter och regler för kalenderguiden (appen och den publika sidan). Ren logik.
import { CONNECTED_DAYS, isConnected, type ConnectionRow } from '@/lib/calendarFeed';

export const GUIDE_POLL_MS = 4000;
export const GUIDE_POLL_MAX_MS = 90_000;
/** Marginal för klockskillnad mellan telefonen och servern. */
export const CLOCK_SLACK_MS = 5000;

export const APPLE_TEXTS = {
  title: 'Få schemat i telefonens kalender',
  intro: 'KM och montage läggs in automatiskt och uppdateras när något bokas om. Du gör det en gång.',
  previewTitle: 'Så här ser det ut i kalendern',
  primary: 'Lägg till i Kalender',
  hint: 'Telefonen frågar om du vill prenumerera. Tryck på Prenumerera.',
  snooze: 'Påminn mig i morgon',
  already: 'Jag har redan lagt till schemat',
  toGoogle: 'Jag har Android',
  foot: 'Du hittar det här igen under Min kalender i menyn.',
} as const;

export const WAIT_TEXTS = {
  waiting: 'Väntar på kalendern...',
  notSeen: 'Vi har inte sett kalendern hämta schemat ännu. Tryckte du på Prenumerera?',
  retry: 'Försök igen',
  alreadyFail: 'Vi ser ingen kalender som hämtar schemat ännu. Lägg till den med knappen ovan.',
} as const;

export const DONE_TEXTS = {
  title: 'Klart. Schemat finns i din kalender.',
  fetchedBy: 'Hämtad av',
  latest: 'Senast',
  upcoming: 'Bokningar framåt',
  teamTip: 'Är ni flera i teamet? Öppna Min kalender i menyn på nästa telefon och gör samma sak.',
  show: 'Visa mitt schema',
} as const;

export function doneText(name: string): string {
  return `Kalendern heter SmartKlimat N3prenad – ${name}. Nya bokningar och ändringar kommer in av sig själva.`;
}

export const GOOGLE_TEXTS = {
  title: 'Lägg till schemat i Google Kalender',
  intro: 'Google Kalender kan inte lägga till ett schema inne i appen. Det tar två minuter på en dator, sedan finns det i telefonen.',
  sendButton: 'Skicka länken',
  step2: 'Öppna mejlet på en dator',
  step2Text: 'Tryck på Lägg till i Google Kalender och sedan på Lägg till.',
  step3: 'Bekräftelsen kommer här',
  step3Text: 'Det syns här när Google har hämtat schemat. Första gången kan det dröja någon timme.',
  note: 'Google hämtar ändringar ungefär en gång per dygn. Appen och mejlen visar alltid det senaste.',
  mobile: 'Gör det i mobilen',
  snooze: 'Påminn mig i morgon',
  toApple: 'Jag har iPhone',
  noEmailTeam: 'Teamet saknar mejladress. Be kontoret lägga in en.',
  noEmailPerson: 'Din mejladress saknas. Be kontoret lägga in en.',
  localSkip: 'Mejl skickas inte i testmiljön.',
  sendFailed: 'Mejlet kunde inte skickas. Försök igen.',
} as const;

/** Steg 1: "teamets mejl" för montörer, "din mejl" för säljare och koordinator. */
export function googleStep1(team: boolean): string {
  return `Skicka länken till ${team ? 'teamets' : 'din'} mejl`;
}

export function sentTo(masked: string): string {
  return `Skickat till ${masked}`;
}

export const MOBILE_TEXTS = {
  step1: 'Kopiera länken',
  step2: 'Öppna Google Kalender i webbläsaren',
  step3: 'Välj Datorversion i webbläsarens meny, klistra in länken och tryck på Lägg till kalender.',
} as const;

export const DESKTOP_TEXTS = {
  title: 'Lägg till schemat i din kalender',
  google: 'Lägg till i Google Kalender',
  apple: 'Lägg till i Apple Kalender',
  copy: 'Kopiera länken',
  outlook: 'Outlook: Lägg till kalender, Prenumerera från webben, klistra in länken.',
  qr: 'Skanna med telefonen',
} as const;

export interface PreviewRow { title: string; sub: string }

export const EXAMPLE_ROWS: readonly PreviewRow[] = [
  { title: 'KM – Ekbacken 7, Lidingö', sub: 'Adress, kund och telefon följer med' },
  { title: 'Montage – Lönnstigen 5, Sollentuna', sub: 'Länk tillbaka till ärendet i appen' },
];

/** Användarens två nästa bokningar om de finns, annars exempelraderna. */
export function previewRows(next: readonly PreviewRow[]): PreviewRow[] {
  return next.length ? next.slice(0, 2) : [...EXAMPLE_ROWS];
}

const CLIENT_NAMES: Record<string, string> = { apple: 'Apple Kalender', google: 'Google Kalender', outlook: 'Outlook' };

export function clientLabel(client: string | null | undefined): string {
  return (client && CLIENT_NAMES[client]) || 'Annan kalender';
}

/** "nyss", "för 5 min sedan", "för 2 tim sedan", "för 3 dagar sedan". */
export function relativeAgo(iso: string | null | undefined, now: Date): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return 'nyss';
  const m = Math.floor(s / 60);
  if (m < 60) return `för ${m} min sedan`;
  const h = Math.floor(m / 60);
  if (h < 24) return `för ${h} tim sedan`;
  const d = Math.floor(h / 24);
  return `för ${d} ${d === 1 ? 'dag' : 'dagar'} sedan`;
}

/** En kalenderklient har hämtat schemat efter trycket (med marginal för klockskillnad). */
export function fetchedSince(row: ConnectionRow | null | undefined, sinceMs: number): boolean {
  if (!row?.last_fetched_at || !row.last_client || row.last_client === 'browser') return false;
  const t = Date.parse(row.last_fetched_at);
  return Number.isFinite(t) && t > sinceMs - CLOCK_SLACK_MS;
}

/** "Jag har redan lagt till schemat" godkänns bara om en kalenderklient hämtat de senaste 10 dagarna. */
export function alreadyAddedOk(row: ConnectionRow | null | undefined, now: Date): boolean {
  return isConnected(row, now, CONNECTED_DAYS);
}

/** Google-läget blir klart när servern har sett Google hämta. */
export function googleConnected(row: ConnectionRow | null | undefined, now: Date): boolean {
  return row?.last_client === 'google' && isConnected(row, now);
}
