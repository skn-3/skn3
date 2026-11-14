// Gemensam avsändning via Resend-gatewayen med projektets vanliga avsändare och kopia.
// Spärren mot riktiga utskick ligger här: på en lokal utkastbackend skickas ingenting,
// vad som skulle ha skickats loggas och resultatet blir { skipped: 'local_backend' }.
import { isLocalBackend, LOCAL_BACKEND_SKIP } from './localBackend.ts';
import { MAIL_CC } from './mailRecipients.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';
export const MAIL_FROM = 'SmartKlimat N3prenad <n3prenad@smartklimat.org>';

export interface MailInput { to: string[]; cc?: string[]; subject: string; html: string }
export type MailResult =
  | { ok: true; skipped?: undefined; to: string[]; data: unknown }
  | { ok: true; skipped: typeof LOCAL_BACKEND_SKIP; to: string[] }
  | { ok: false; status: number; data: unknown };

export async function sendMail(input: MailInput): Promise<MailResult> {
  const cc = Array.from(new Set([...(input.cc ?? []), MAIL_CC].filter(Boolean)));
  if (isLocalBackend()) {
    console.log('[local_backend] mejl skickades inte:', JSON.stringify({ to: input.to, cc, subject: input.subject, html_length: input.html.length }));
    return { ok: true, skipped: LOCAL_BACKEND_SKIP, to: input.to };
  }
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': RESEND_API_KEY,
    },
    body: JSON.stringify({ from: MAIL_FROM, to: input.to, subject: input.subject, html: input.html, cc }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('Resend API error:', JSON.stringify(data));
    return { ok: false, status: response.status, data };
  }
  return { ok: true, to: input.to, data };
}
