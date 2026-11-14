import { describe, it, expect } from 'vitest';
import {
  buildMontorEmail, findFreshEvent, recipientsFor, MONTOR_TEMPLATES, MAIL_CASE_FIELDS,
  type MailCase, type MailEvent, type MontorTemplate,
} from '../../../supabase/functions/notify-email/montorEmails';
import { COORDINATOR_TO, teamEmailResolver } from '../../../supabase/functions/_shared/mailRecipients';

const NOW = Date.parse('2026-11-09T10:00:00Z');
const c: MailCase & Record<string, unknown> = {
  id: '11111111-1111-1111-1111-111111111111',
  address: 'Storgatan 1, Gävle', customer_name: 'Anna <b>Svensson</b>', customer_phone: '070-1',
  team: 'Alex NBD', seller: 'Daniel Malke', km_date: '2026-11-10', montage_date: '2026-11-12', montage_time: '07:30:00',
  montage_partial_note: 'Lister saknas', extra_hours_requested: 3,
  // Ekonomifält som aldrig får hamna i mejlet även om de skulle följa med.
  order_value: 123456, tb: 98765, a_order_total: 55555, payout_amount: 44444,
};
const ev = (event_type: string, description: string, minsAgo = 1, extra: Partial<MailEvent> = {}): MailEvent => ({
  id: `${event_type}-${minsAgo}`, event_type, description, created_by: 'Alex NBD',
  created_at: new Date(NOW - minsAgo * 60000).toISOString(), deviation_id: null, ...extra,
});
const eventFor: Record<MontorTemplate, MailEvent> = {
  montage_klart: ev('status_change', 'Montage klart. Allt <ok>'),
  montage_delrapport: ev('montage_delrapport', 'Montage delrapporterat. Allt är klart utom: Lister saknas'),
  kontrollmatning_inskickad: ev('kontrollmatning', 'Kontrollmätning inskickad: 4 littera (1 med ändringar)'),
  km_klar: ev('hours_request', 'KM klar. Extra timmar begärda: 3'),
  avvikelse_rapporterad: ev('deviation', 'Reklamation skapad: läcker', 1, { deviation_id: 'dev' }),
  km_bokad: ev('status_change', 'KM bokad: 2026-11-10'),
  montage_bokat: ev('montage_booked', 'Montage bokat 2026-11-12'),
};
const build = (t: MontorTemplate) => buildMontorEmail({
  template: t, c, event: eventFor[t], baseUrl: 'https://n3prenad.smartklimat.org',
  deviation: t === 'avvikelse_rapporterad' ? { id: 'dev', type: 'reklamation', priority: 'hog', description: 'Läcker', created_by: 'Alex NBD', image_urls: ['a'] } : null,
});

describe('Montörsmejl — ämnesrader', () => {
  it.each([
    ['montage_klart', 'MONTAGE KLART — Storgatan 1, Gävle'],
    ['montage_delrapport', 'MONTAGE DELRAPPORTERAT — Storgatan 1, Gävle'],
    ['kontrollmatning_inskickad', 'KONTROLLMÄTNING INSKICKAD — Storgatan 1, Gävle'],
    ['km_klar', 'KM KLAR — Storgatan 1, Gävle'],
    ['avvikelse_rapporterad', 'NY REKLAMATION — Storgatan 1, Gävle'],
    ['km_bokad', 'KONTROLLMÄTNING TILLDELAD — Storgatan 1, Gävle'],
    ['montage_bokat', 'MONTAGE TILLDELAT — Storgatan 1, Gävle'],
  ] as const)('%s', (t, subject) => {
    expect(build(t).subject).toBe(subject);
  });
});

describe('Montörsmejl — innehåll', () => {
  it.each(MONTOR_TEMPLATES)('%s innehåller inga ekonomibelopp och escapar text', (t) => {
    const { body } = build(t);
    for (const amount of ['123456', '98765', '55555', '44444']) expect(body).not.toContain(amount);
    expect(body).not.toMatch(/ordervärde|TB|utbetalning|kr\b/i);
    expect(body).not.toContain('<b>Svensson</b>');
    expect(body).toContain('Anna &lt;b&gt;Svensson&lt;/b&gt;');
    expect(body).toContain('https://n3prenad.smartklimat.org/?case=11111111-1111-1111-1111-111111111111');
  });
  it('läser inga ekonomikolumner från ärendet', () => {
    expect(MAIL_CASE_FIELDS).not.toMatch(/value|price|amount|tb|margin|payout|cost/i);
  });
  it('bildfel på en redan rapporterad avvikelse får eget ämne', () => {
    const note = ev('note', 'Bilderna till avvikelsen kunde inte laddas upp (2 st): x', 1, { deviation_id: 'dev' });
    const mail = buildMontorEmail({ template: 'avvikelse_rapporterad', c, event: note, events: [note], baseUrl: 'https://x', deviation: { id: 'dev', type: 'felmatning', priority: 'medium', description: 'Fel', created_by: 'Alex NBD' } });
    expect(mail.subject).toBe('BILDFEL — Storgatan 1, Gävle');
    expect(mail.body).toContain('kunde INTE laddas upp');
  });
});

describe('Montörsmejl — färsk händelse krävs', () => {
  it('kräver rätt typ, anroparen och högst 15 minuter', () => {
    const events = [ev('status_change', 'Montage klart.', 20), ev('status_change', 'Montage klart.', 2, { created_by: 'Annan' }), ev('note', 'Montage klart.', 1)];
    expect(findFreshEvent('montage_klart', events, 'Alex NBD', NOW)).toBeNull();
    expect(findFreshEvent('montage_klart', [...events, ev('status_change', 'Montage klart.', 14)], 'Alex NBD', NOW)?.id).toBe('status_change-14');
  });
  it('avvikelse måste gälla den angivna avvikelsen', () => {
    const e = ev('deviation', 'x', 1, { deviation_id: 'dev' });
    expect(findFreshEvent('avvikelse_rapporterad', [e], 'Alex NBD', NOW, 'other')).toBeNull();
    expect(findFreshEvent('avvikelse_rapporterad', [e], 'Alex NBD', NOW, 'dev')).not.toBeNull();
    expect(findFreshEvent('avvikelse_rapporterad', [e], 'Alex NBD', NOW, 'dev', true)).toBeNull();
  });
});

describe('Montörsmejl — mottagare', () => {
  it('koordinatorn för rapporter till kontoret', () => {
    for (const t of ['montage_klart', 'montage_delrapport', 'kontrollmatning_inskickad', 'avvikelse_rapporterad'] as const) {
      expect(recipientsFor(t, c)).toEqual([COORDINATOR_TO]);
    }
    expect(COORDINATOR_TO).toBe('mirna.malke@mockfjards.se');
  });
  it('säljaren för KM klar och teamet för egen bokning; okänd hoppas över', () => {
    expect(recipientsFor('km_klar', c)).toEqual(['daniel.malke@mockfjards.se']);
    expect(recipientsFor('montage_bokat', c)).toEqual(['alex@nbdentreprenad.com']);
    expect(recipientsFor('km_klar', { ...c, seller: 'Okänd' })).toBeNull();
    expect(recipientsFor('km_bokad', { ...c, team: null })).toBeNull();
  });
  it('teamets adress från montor_teams.email med den statiska listan som reserv', () => {
    const resolver = teamEmailResolver([{ name: 'Alex NBD', email: 'ny@alex.se' }, { name: 'Samy', email: '' }]);
    expect(recipientsFor('montage_bokat', c, resolver)).toEqual(['ny@alex.se']);
    expect(recipientsFor('montage_bokat', { ...c, team: 'Samy' }, resolver)).toEqual(['info@smtmbygg.se']);
    expect(recipientsFor('montage_bokat', { ...c, team: 'Tomek' }, resolver)).toBeNull();
  });
  it('km_bokad går till km_team med team som reserv', () => {
    const resolver = teamEmailResolver([{ name: 'GVMO', email: 'gvmo@example.com' }]);
    expect(recipientsFor('km_bokad', { ...c, km_team: 'GVMO' }, resolver)).toEqual(['gvmo@example.com']);
    expect(recipientsFor('km_bokad', { ...c, km_team: null }, resolver)).toEqual(['alex@nbdentreprenad.com']);
    expect(recipientsFor('montage_bokat', { ...c, km_team: 'GVMO' }, resolver)).toEqual(['alex@nbdentreprenad.com']);
  });
});
