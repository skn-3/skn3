// Kalenderflödet (calendar-ics) som ren modul: urval per roll, händelser, ICS-text,
// igenkänning av kalenderklienter och regeln för "kopplad". Ingen Deno-import; appen
// återexporterar modulen (src/lib/calendarFeed.ts) och vitest testar den.
// Inga belopp får förekomma i något flöde.

export const APP_BASE_URL = 'https://smartklimatentreprenad.com';
export const TZID = 'Europe/Stockholm';
export const FEED_PAST_DAYS = 60;
/** Kopplad = senaste hämtningen från en kalenderklient är högst så här många dagar gammal. */
export const CONNECTED_DAYS = 10;
/** Utan hämtning så här länge tas enhetens klarmarkering bort. */
export const STALE_DAYS = 14;
export const GOOGLE_ADD_BY_URL = 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl';

export type FeedRole = 'montor' | 'seller' | 'coordinator';
export type FeedKind = 'km' | 'montage' | 'leverans' | 'hamtning';
export type CalendarClient = 'apple' | 'google' | 'outlook' | 'other' | 'browser';

export interface FeedViewer { name: string; role: FeedRole }

/** De fält flödet läser. Inga ekonomifält. */
export interface FeedCase {
  id: string;
  status: string;
  address?: string | null;
  city?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  units?: number | null;
  seller?: string | null;
  team?: string | null;
  km_team?: string | null;
  km_date?: string | null;
  km_time?: string | null;
  montage_date?: string | null;
  montage_time?: string | null;
  montage_days?: number | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  delivery_week?: number | null;
  delivery_year?: number | null;
  waste_pickup_date?: string | null;
  montor_notes?: string | null;
}

/** Kolumnerna calendar-ics hämtar (montage_days läggs till av funktionen om kolumnen finns). */
export const FEED_CASE_FIELDS = 'id,status,address,city,customer_name,customer_phone,units,seller,team,km_team,km_date,km_time,montage_date,montage_time,delivery_date,delivery_time,delivery_week,delivery_year,waste_pickup_date,montor_notes';

export interface FeedEvent {
  uid: string;
  caseId: string;
  kind: FeedKind;
  /** Startdag (ISO). */
  date: string;
  /** HH:MM eller null (heldag). */
  time: string | null;
  durationHours: number;
  /** Antal heldagar (1, eller 7 för leveransvecka). */
  allDayLength: number;
  summary: string;
  location: string;
  description: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Datum (UTC-aritmetik på kalenderdatum, så att tidszon aldrig flyttar en dag)

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isFeedDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = ISO_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function utc(iso: string): Date {
  const m = ISO_RE.exec(iso)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function isoOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  return isoOf(new Date(utc(iso).getTime() + n * DAY_MS));
}

function isWeekendIso(iso: string): boolean {
  const d = utc(iso).getUTCDay();
  return d === 0 || d === 6;
}

/**
 * Montagedagarna. Samma regel som montageDates i src/lib/schedule/dates.ts (test jämför):
 * startdagen är dag 1 (även en helgdag), därefter nästkommande vardagar; 1–30 dagar.
 */
export function feedMontageDates(start: string, days: number | null | undefined): string[] {
  const n = typeof days === 'number' && Number.isFinite(days) && days >= 1 ? Math.min(30, Math.floor(days)) : 1;
  const out = [start];
  let cur = start;
  while (out.length < n) {
    cur = addDays(cur, 1);
    if (!isWeekendIso(cur)) out.push(cur);
  }
  return out;
}

/** Måndagen i ISO-vecka week år year. */
export function isoWeekMonday(year: number, week: number): string {
  const jan4 = isoOf(new Date(Date.UTC(year, 0, 4)));
  const dow = (utc(jan4).getUTCDay() + 6) % 7;
  return addDays(jan4, -dow + (week - 1) * 7);
}

function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** Dagens datum i Stockholm (ISO). */
export function stockholmToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZID, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Urval och händelser

export function caseLink(caseId: string): string {
  return `${APP_BASE_URL}/?case=${encodeURIComponent(caseId)}`;
}

export function feedPlace(c: Pick<FeedCase, 'address' | 'city'>): string {
  const address = (c.address ?? '').trim();
  const city = (c.city ?? '').trim();
  if (!city || address.toLowerCase().includes(city.toLowerCase())) return address;
  return address ? `${address}, ${city}` : city;
}

const kmTeamOf = (c: FeedCase) => c.km_team || c.team || null;

function describe(c: FeedCase, viewer: FeedViewer, extra: string | null): string {
  const lines: string[] = [];
  if (c.customer_name) lines.push(`Kund: ${c.customer_name}`);
  if (c.customer_phone) lines.push(`Telefon: ${c.customer_phone}`);
  if (typeof c.units === 'number' && c.units > 0) lines.push(`Enheter: ${c.units}`);
  if (c.seller) lines.push(`Säljare: ${c.seller}`);
  if (viewer.role === 'montor' && c.montor_notes && c.montor_notes.trim()) lines.push(`Till montör: ${c.montor_notes.trim()}`);
  if (extra) lines.push(extra);
  lines.push(`Öppna i appen: ${caseLink(c.id)}`);
  return lines.join('\n');
}

/** Vilka typer rollen får, och om ärendet hör till tittaren. */
function includes(c: FeedCase, viewer: FeedViewer, kind: FeedKind): boolean {
  if (viewer.role === 'montor') {
    if (kind === 'km') return kmTeamOf(c) === viewer.name;
    if (kind === 'montage') return c.team === viewer.name;
    return false;
  }
  if (viewer.role === 'seller') return c.seller === viewer.name && kind !== 'hamtning';
  return true;
}

/** Händelserna i en användares flöde, från 60 dagar bakåt och framåt utan gräns. Pausade tas inte med. */
export function feedEvents(cases: readonly FeedCase[], viewer: FeedViewer, today: string): FeedEvent[] {
  const cutoff = addDays(today, -FEED_PAST_DAYS);
  const office = viewer.role !== 'montor';
  const out: FeedEvent[] = [];
  for (const c of cases) {
    if (!c || c.status === 'pausad') continue;
    const place = feedPlace(c);
    const url = caseLink(c.id);
    const teamSuffix = (team: string | null | undefined) => (office && team ? ` · ${team}` : '');
    const push = (e: Omit<FeedEvent, 'caseId' | 'location' | 'url'>, lastDay: string) => {
      if (lastDay < cutoff) return;
      out.push({ ...e, caseId: c.id, location: place, url });
    };

    if (includes(c, viewer, 'km') && isFeedDate(c.km_date)) {
      push({
        uid: `${c.id}-km@smartklimat`, kind: 'km', date: c.km_date, time: hhmm(c.km_time), durationHours: 2, allDayLength: 1,
        summary: `KM – ${place}${teamSuffix(kmTeamOf(c))}`, description: describe(c, viewer, null),
      }, c.km_date);
    }
    if (includes(c, viewer, 'montage') && isFeedDate(c.montage_date)) {
      const days = feedMontageDates(c.montage_date, c.montage_days);
      days.forEach((d, i) => {
        const n = i + 1;
        push({
          uid: n === 1 ? `${c.id}-montage@smartklimat` : `${c.id}-montage-d${n}@smartklimat`,
          kind: 'montage', date: d, time: hhmm(c.montage_time), durationHours: 8, allDayLength: 1,
          summary: `Montage – ${place}${days.length > 1 ? ` (dag ${n} av ${days.length})` : ''}${teamSuffix(c.team)}`,
          description: describe(c, viewer, null),
        }, d);
      });
    }
    if (includes(c, viewer, 'leverans')) {
      if (isFeedDate(c.delivery_date)) {
        push({
          uid: `${c.id}-leverans@smartklimat`, kind: 'leverans', date: c.delivery_date, time: hhmm(c.delivery_time), durationHours: 1, allDayLength: 1,
          summary: `Leverans – ${place}${teamSuffix(c.team)}`, description: describe(c, viewer, null),
        }, c.delivery_date);
      } else if (c.delivery_week && c.delivery_year) {
        const monday = isoWeekMonday(c.delivery_year, c.delivery_week);
        push({
          uid: `${c.id}-leverans-w@smartklimat`, kind: 'leverans', date: monday, time: null, durationHours: 0, allDayLength: 7,
          summary: `Leverans v${c.delivery_week} – ${place}${teamSuffix(c.team)}`, description: describe(c, viewer, 'Ungefärlig leveransvecka'),
        }, addDays(monday, 6));
      }
    }
    if (includes(c, viewer, 'hamtning') && isFeedDate(c.waste_pickup_date)) {
      push({
        uid: `${c.id}-hamtning@smartklimat`, kind: 'hamtning', date: c.waste_pickup_date, time: null, durationHours: 0, allDayLength: 1,
        summary: `Hämtning – ${place}${teamSuffix(c.team)}`, description: describe(c, viewer, null),
      }, c.waste_pickup_date);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.uid.localeCompare(b.uid));
}

/** Händelser från och med i dag (för förhandsvisning och antal bokningar framåt). */
export function upcomingFeedEvents(events: readonly FeedEvent[], today: string): FeedEvent[] {
  return events.filter((e) => e.date >= today);
}

// ---------------------------------------------------------------------------
// ICS

export function calendarName(name: string): string {
  return `SmartKlimat N3prenad – ${name}`;
}

export function escapeIcsText(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Radbrytning vid 75 oktetter (inklusive inledande mellanslag på fortsättningsrader), UTF-8-säker. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
      limit = 74;
    }
    cur += ch;
    bytes += n;
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');

function localStamp(date: string, time: string, plusHours = 0): string {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(utc(date).getTime() + ((hh + plusHours) * 60 + mm) * 60_000);
  return `${isoOf(d).replace(/-/g, '')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export const VTIMEZONE_STOCKHOLM = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  `X-LIC-LOCATION:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function eventLines(e: FeedEvent, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (e.time) {
    lines.push(`DTSTART;TZID=${TZID}:${localStamp(e.date, e.time)}`);
    lines.push(`DTEND;TZID=${TZID}:${localStamp(e.date, e.time, e.durationHours)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(e.date, e.allDayLength))}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
  lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
  lines.push(`URL:${e.url}`);
  lines.push('END:VEVENT');
  return lines;
}

/** Hela ICS-texten med CRLF och radbrytning. */
export function buildIcs(p: { name: string; events: readonly FeedEvent[]; now: Date }): string {
  const stamp = utcStamp(p.now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SmartKlimat//N3prenad//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName(p.name))}`,
    `X-WR-TIMEZONE:${TZID}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE_STOCKHOLM,
    ...p.events.flatMap((e) => eventLines(e, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Kalenderklienter och koppling

/** Vem som hämtar flödet, utläst ur User-Agent. 'browser' räknas inte som kalender. */
export function calendarClient(userAgent: string | null | undefined): CalendarClient {
  const ua = (userAgent ?? '').trim();
  if (/Google-Calendar-Importer/i.test(ua)) return 'google';
  if (/dataaccessd|CalendarAgent/i.test(ua) || /^(iOS|macOS)\//.test(ua)) return 'apple';
  if (/Microsoft Office|Outlook/i.test(ua)) return 'outlook';
  if (/^Mozilla\//.test(ua) && /(Chrome|CriOS|Safari|Firefox|FxiOS|Edg|OPR)\//.test(ua)) return 'browser';
  return 'other';
}

export function isCalendarClient(c: CalendarClient): boolean {
  return c !== 'browser';
}

export interface ConnectionRow {
  last_fetched_at?: string | null;
  last_client?: string | null;
}

/** Kopplad: senaste hämtningen från en kalenderklient är högst 10 dagar gammal. */
export function isConnected(row: ConnectionRow | null | undefined, now: Date, days = CONNECTED_DAYS): boolean {
  if (!row?.last_fetched_at || !row.last_client || row.last_client === 'browser') return false;
  const t = new Date(row.last_fetched_at).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= days * DAY_MS;
}

/** Svaret på ?info=1 för den publika guidesidan. Inga andra uppgifter. */
export function feedInfo(name: string, row: ConnectionRow | null | undefined, now: Date) {
  return {
    name,
    connected: isConnected(row, now),
    last_client: row?.last_client ?? null,
    last_fetched_at: row?.last_fetched_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Länkar

export function feedHttpsUrl(supabaseBase: string, token: string): string {
  return `${supabaseBase.replace(/\/+$/, '')}/functions/v1/calendar-ics?token=${encodeURIComponent(token)}`;
}

export function webcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https?:\/\//, 'webcal://');
}

export function googleAddUrl(webcal: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
}

export function guidePageUrl(token: string): string {
  return `${APP_BASE_URL}/kalender/${encodeURIComponent(token)}`;
}
