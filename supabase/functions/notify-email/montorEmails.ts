// Fasta, serverbyggda mejlmallar för flöden som montörer utlöser. Klienten skickar bara
// { template, case_id[, deviation_id] }; mottagare, ämne och innehåll byggs här.
// Innehållet får bara ha adress, kund, team, vad som hänt, montörens text och länken –
// aldrig ekonomi (TB, ordervärde, A-order- eller utbetalningsbelopp, kostnader).
import { escapeHtml } from './wastePickupEmail.ts';
import { COORDINATOR_TO, SELLER_EMAILS, TEAM_EMAILS } from '../_shared/mailRecipients.ts';

export const MONTOR_TEMPLATES = [
  'montage_klart',
  'montage_delrapport',
  'kontrollmatning_inskickad',
  'km_klar',
  'avvikelse_rapporterad',
  'km_bokad',
  'montage_bokat',
] as const;
export type MontorTemplate = typeof MONTOR_TEMPLATES[number];

export const FRESH_EVENT_MS = 15 * 60 * 1000;

export function isMontorTemplate(t: unknown): t is MontorTemplate {
  return typeof t === 'string' && (MONTOR_TEMPLATES as readonly string[]).includes(t);
}

/** Enda kolumnerna som läses från cases_montor – inga ekonomifält. */
export const MAIL_CASE_FIELDS = 'id,address,customer_name,customer_phone,team,seller,km_date,montage_date,montage_time,montage_partial_note,extra_hours_requested';
export const MAIL_EVENT_FIELDS = 'id,event_type,description,created_by,created_at,deviation_id';
export const MAIL_DEVIATION_FIELDS = 'id,case_id,type,priority,description,created_by,image_urls';

export interface MailCase {
  id: string;
  address: string | null;
  customer_name: string | null;
  customer_phone?: string | null;
  team?: string | null;
  seller?: string | null;
  km_date?: string | null;
  montage_date?: string | null;
  montage_time?: string | null;
  montage_partial_note?: string | null;
  extra_hours_requested?: number | null;
}
export interface MailEvent {
  id: string;
  event_type: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  deviation_id?: string | null;
}
export interface MailDeviation {
  id: string;
  case_id?: string;
  type: string | null;
  priority: string | null;
  description: string | null;
  created_by: string | null;
  image_urls?: string[] | null;
}

const IMAGE_FAIL_RE = /kunde inte laddas upp/i;

/** Avgör om en händelse är den som får utlösa mallen. */
export function matchesEvent(template: MontorTemplate, e: MailEvent, deviationId?: string | null): boolean {
  const d = e.description ?? '';
  switch (template) {
    case 'montage_klart': return e.event_type === 'status_change' && /^Montage klart/.test(d);
    case 'montage_delrapport': return e.event_type === 'montage_delrapport';
    case 'kontrollmatning_inskickad': return e.event_type === 'kontrollmatning';
    case 'km_klar': return e.event_type === 'km_report' || e.event_type === 'hours_request';
    case 'km_bokad': return e.event_type === 'status_change' && /^KM bokad/.test(d);
    case 'montage_bokat': return e.event_type === 'montage_booked';
    case 'avvikelse_rapporterad':
      return !!deviationId && e.deviation_id === deviationId
        && (e.event_type === 'deviation' || (e.event_type === 'note' && IMAGE_FAIL_RE.test(d)));
  }
}

/** Senaste matchande händelse som anroparen själv skapat inom 15 minuter. */
export function findFreshEvent(
  template: MontorTemplate, events: MailEvent[], callerName: string, now: number, deviationId?: string | null, imagesOnly = false,
): MailEvent | null {
  const fresh = events
    .filter((e) => e.created_by === callerName)
    .filter((e) => { const t = new Date(e.created_at).getTime(); return t && now - t <= FRESH_EVENT_MS && t <= now + 60_000; })
    .filter((e) => matchesEvent(template, e, deviationId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  // Avvikelse: ny rapport kräver händelsen 'deviation'; bildfel på en redan rapporterad
  // avvikelse (imagesOnly) kräver den färska bildfelsraden.
  if (template === 'avvikelse_rapporterad') return fresh.find((e) => e.event_type === (imagesOnly ? 'note' : 'deviation')) ?? null;
  return fresh[0] ?? null;
}

/** Mottagare per mall. null = ingen känd adress, mejlet hoppas över. */
export function recipientsFor(template: MontorTemplate, c: MailCase): string[] | null {
  if (template === 'km_klar') { const s = c.seller ? SELLER_EMAILS[c.seller] : undefined; return s ? [s] : null; }
  if (template === 'km_bokad' || template === 'montage_bokat') { const t = c.team ? TEAM_EMAILS[c.team] : undefined; return t ? [t] : null; }
  return [COORDINATOR_TO];
}

const DEVIATION_LABELS: Record<string, string> = {
  reklamation: 'Reklamation', felmatning: 'Felmätning', fabriksfel: 'Fabriksfel', extra_material: 'Extra material', ovrigt: 'Övrigt',
};
const PRIORITY_LABELS: Record<string, string> = { hog: 'Hög', medium: 'Medium', lag: 'Låg' };

const oneLine = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

export interface BuiltMail { subject: string; heading: string; body: string }

export interface BuildInput {
  template: MontorTemplate;
  c: MailCase;
  event: MailEvent;
  /** Övriga färska händelser för samma avvikelse (för bildfel). */
  events?: MailEvent[];
  deviation?: MailDeviation | null;
  baseUrl: string;
}

function render(intro: string, rows: Array<[string, unknown]>, link: string): string {
  const table = rows
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim())
    .map(([l, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b7280;width:160px;vertical-align:top;">${escapeHtml(l)}</td><td style="padding:10px 0;border-bottom:1px solid #eee;color:#1a1a1a;vertical-align:top;white-space:pre-wrap;">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<p style="margin:0 0 12px 0;">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${table}</table>
<p style="margin:20px 0 0 0;"><a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:12px 28px;background-color:#0B3D2E;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px;">Öppna ärendet</a></p>`;
}

export function buildMontorEmail(input: BuildInput): BuiltMail {
  const { template, c, event, deviation } = input;
  const address = oneLine(c.address) || 'okänd adress';
  const link = `${input.baseUrl}/?case=${encodeURIComponent(c.id)}`;
  const who = event.created_by;
  const desc = (event.description ?? '').trim();
  const base: Array<[string, unknown]> = [['Adress', address], ['Kund', c.customer_name]];
  let subject: string; let heading: string; let intro: string; let rows: Array<[string, unknown]>;

  switch (template) {
    case 'montage_klart': {
      const comment = desc.replace(/^Montage klart\.?\s*/, '');
      subject = `MONTAGE KLART — ${address}`; heading = 'Montage klart';
      intro = 'Montören har klarmarkerat montaget. Ring kunden och stäm av signeringen.';
      rows = [...base, ['Team', c.team || who], ['Montör', who], ['Kommentar', comment]];
      break;
    }
    case 'montage_delrapport':
      subject = `MONTAGE DELRAPPORTERAT — ${address}`; heading = 'Montage delrapporterat';
      intro = 'Montören har delrapporterat montaget. Allt är klart utom det som står nedan.';
      rows = [...base, ['Team', c.team || who], ['Montör', who], ['Allt är klart utom', c.montage_partial_note || desc.replace(/^Montage delrapporterat\.\s*Allt är klart utom:\s*/, '')]];
      break;
    case 'kontrollmatning_inskickad':
      subject = `KONTROLLMÄTNING INSKICKAD — ${address}`; heading = 'Kontrollmätning inskickad';
      intro = 'Logga in i N3prenad för att granska ändringarna och uppdatera Mockfjärds kundportal.';
      rows = [...base, ['Montör', who], ['Vad som hänt', desc]];
      break;
    case 'km_klar': {
      const hours = event.event_type === 'hours_request' ? Number(c.extra_hours_requested ?? 0) : 0;
      subject = `KM KLAR — ${address}`; heading = hours > 0 ? 'Kontrollmätning klar – extra timmar begärda' : 'Kontrollmätning klar';
      intro = hours > 0 ? 'Montören har rapporterat KM klar och begär extra timmar som behöver granskas.' : 'Montören har rapporterat KM klar.';
      rows = [...base, ['Montör', who], ['Extra timmar begärda', hours > 0 ? `${hours} st` : null], ['Rapport', desc]];
      break;
    }
    case 'km_bokad':
      subject = `KONTROLLMÄTNING TILLDELAD — ${address}`; heading = 'Du har blivit tilldelad en kontrollmätning';
      intro = 'Öppna appen för detaljer.';
      rows = [...base, ['Telefon', c.customer_phone || 'Ej angivet'], ['KM-datum', c.km_date || 'Ej angivet'], ['Säljare', c.seller || 'Ej angivet']];
      break;
    case 'montage_bokat': {
      const when = c.montage_date ? `${c.montage_date}${c.montage_time ? ' ' + String(c.montage_time).slice(0, 5) : ''}` : 'Ej angivet';
      subject = `MONTAGE TILLDELAT — ${address}`; heading = 'Du har blivit tilldelad ett montage';
      intro = 'Öppna appen för detaljer.';
      rows = [...base, ['Telefon', c.customer_phone || 'Ej angivet'], ['Montagedatum', when], ['Montör', c.team]];
      break;
    }
    case 'avvikelse_rapporterad': {
      const isReklam = deviation?.type === 'reklamation';
      const isNew = event.event_type === 'deviation';
      const others = (input.events ?? []).filter((e) => matchesEvent(template, e, deviation?.id));
      const imagesFailed = event.event_type === 'note' || others.some((e) => e.event_type === 'note');
      const imageCount = deviation?.image_urls?.length ?? 0;
      subject = `${!isNew ? 'BILDFEL' : isReklam ? 'NY REKLAMATION' : 'NY AVVIKELSE'} — ${address}`;
      heading = !isNew ? 'Bilder kunde inte laddas upp' : isReklam ? 'Ny reklamation' : 'Ny avvikelse';
      intro = 'Vänligen granska ärendet.';
      rows = [
        ...base,
        ['Rapporterad av', deviation?.created_by || who],
        ['Typ', DEVIATION_LABELS[deviation?.type ?? ''] ?? deviation?.type],
        ['Prioritet', isReklam ? PRIORITY_LABELS[deviation?.priority ?? ''] ?? deviation?.priority : null],
        ['Beskrivning', deviation?.description],
        ['Bilder', imagesFailed ? 'Bilderna kunde INTE laddas upp — be montören skicka dem på annat sätt' : imageCount > 0 ? `${imageCount} bild(er) bifogade` : null],
      ];
      break;
    }
  }
  return { subject, heading, body: render(intro, rows, link) };
}
