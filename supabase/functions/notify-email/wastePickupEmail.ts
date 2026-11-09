// Ren mejlmall för "Skräp redo att hämtas". Bara adress, kund, team, montörens
// notering, tidigast datum och länk – aldrig ekonomi eller interna fält.
export const WASTE_PICKUP_TO = 'mirna.malke@mockfjards.se';

export interface WastePickupCase {
  id: string;
  address: string | null;
  customer_name: string | null;
  team: string | null;
  waste_pickup_requested_by: string | null;
  waste_pickup_note: string | null;
  waste_pickup_earliest: string | null;
  waste_pickup_requested_at: string | null;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export function wastePickupEmail(c: WastePickupCase, baseUrl: string): { subject: string; heading: string; body: string } {
  const address = (c.address ?? '').trim() || 'okänd adress';
  const link = `${baseUrl}/?case=${encodeURIComponent(c.id)}`;
  const rows: Array<[string, string | null]> = [
    ['Adress', address],
    ['Kund', c.customer_name],
    ['Team', c.team || c.waste_pickup_requested_by],
    ['Montörens notering', c.waste_pickup_note],
    ['Tidigast hämtning', c.waste_pickup_earliest],
  ];
  const table = rows
    .filter(([, v]) => v && String(v).trim())
    .map(([l, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#6b7280;width:160px;vertical-align:top;">${escapeHtml(l)}</td><td style="padding:10px 0;border-bottom:1px solid #eee;color:#1a1a1a;vertical-align:top;">${escapeHtml(v)}</td></tr>`)
    .join('');
  const body = `<p style="margin:0 0 12px 0;">Skräpet är redo att hämtas. Boka Ragn-Sells och markera hämtningen som bokad i appen.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${table}</table>
<p style="margin:20px 0 0 0;"><a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:12px 28px;background-color:#0B3D2E;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px;">Öppna ärendet</a></p>`;
  return { subject: `Skräp redo att hämtas: ${address}`, heading: 'Skräp redo att hämtas', body };
}
