// Mejlet "Lägg till schemat i din kalender" (calendar-connect send_guide). Ren modul med test.
import { googleAddUrl, guidePageUrl } from './calendarFeed.ts';

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const GUIDE_HEADING = 'Lägg till schemat i din kalender';
export const GUIDE_SUBJECT = 'Lägg till schemat i din kalender – SmartKlimat N3prenad';

export interface GuideMailInput {
  /** Kalenderns ägare (team eller person). */
  name: string;
  /** true för montörer och team: texten talar om teamets schema. */
  team: boolean;
  webcal: string;
  token: string;
}

function button(href: string, text: string, primary: boolean): string {
  const style = primary
    ? 'display:inline-block;padding:12px 28px;background-color:#0B3D2E;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px;'
    : 'display:inline-block;padding:11px 27px;background-color:#ffffff;color:#0B3D2E;font-weight:bold;text-decoration:none;border-radius:6px;border:1px solid #0B3D2E;';
  return `<a href="${esc(href)}" target="_blank" style="${style}">${esc(text)}</a>`;
}

export function calendarGuideEmail(input: GuideMailInput): { subject: string; heading: string; body: string } {
  const whose = input.team ? `${input.name}s schema` : 'ditt schema';
  const body = `<p style="margin:0 0 16px 0;">Med länken nedan hamnar ${esc(whose)} i SmartKlimat N3prenad, med KM och montage, i kalendern och uppdateras av sig självt när något bokas om.</p>
<p style="margin:0 0 12px 0;">${button(googleAddUrl(input.webcal), 'Lägg till i Google Kalender', true)}</p>
<p style="margin:0 0 16px 0;">${button(guidePageUrl(input.token), 'Öppna guiden', false)}</p>
<p style="margin:0;color:#6b7280;">Har du iPhone? Öppna guiden på telefonen.</p>`;
  return { subject: GUIDE_SUBJECT, heading: GUIDE_HEADING, body };
}

/** g***@gmail.com. Tom eller ogiltig adress ger tom sträng. */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? '').trim();
  const at = e.indexOf('@');
  if (at < 1 || at === e.length - 1) return '';
  return `${e[0]}***${e.slice(at)}`;
}
