import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  update: vi.fn(), event: vi.fn(), notify: vi.fn(), assign: vi.fn(), tpl: vi.fn(), log: vi.fn(), invoke: vi.fn(), teamEmail: vi.fn(),
}));
vi.mock('@/lib/supabaseClient', () => ({ updateCase: m.update, createCaseEvent: m.event, sendNotificationEmail: m.notify, sendMontorAssignmentEmailResult: m.assign }));
vi.mock('@/lib/montorEmail', () => ({ sendMontorEmail: m.tpl, MAIL_WARNING: 'MAIL_WARNING' }));
vi.mock('@/lib/activityLog', () => ({ logActivity: m.log }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock('../teamEmail', () => ({ resolveTeamEmail: m.teamEmail }));

import {
  bookKm, bookMontage, rescheduleMontage, rescheduleKm, changeBookingTeam, unbookKm, unbookMontage, montageDaysPatch,
  EVENT_WARNING, COORDINATOR_MAIL_WARNING, SMS_NO_PHONE_WARNING, SMS_FAILED_WARNING, teamMailWarning, type BookingCase,
} from '../bookingService';

const c = {
  id: 'case1', address: 'Storgatan 1', customer_name: 'Anna', customer_phone: '0701234567', seller: 'Sara',
  status: 'leverans_klar', team: 'GVMO', km_team: 'Samy', km_date: null, km_time: null, montage_date: null, montage_time: null,
  delivery_date: '2026-11-10', delivery_week: null, delivery_year: null,
} as unknown as BookingCase;

const events = () => m.event.mock.calls.map(([e]) => [e.event_type, e.description]);
const logs = () => m.log.mock.calls.map(([l]) => l.action);

beforeEach(() => {
  vi.clearAllMocks();
  m.update.mockResolvedValue({});
  m.event.mockResolvedValue({});
  m.notify.mockResolvedValue({});
  m.assign.mockResolvedValue('sent');
  m.tpl.mockResolvedValue({ ok: true, to: ['kontor@example.com'] });
  m.log.mockResolvedValue(undefined);
  m.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  m.teamEmail.mockImplementation(async (t: string) => (t ? `${t.toLowerCase()}@example.com` : null));
});

describe('montageDaysPatch', () => {
  it('sends >1, clears 1 only when a value exists, otherwise omits', () => {
    expect(montageDaysPatch(3, null)).toEqual({ montage_days: 3 });
    expect(montageDaysPatch(1, 3)).toEqual({ montage_days: null });
    expect(montageDaysPatch(1, null)).toEqual({});
    expect(montageDaysPatch(1, undefined)).toEqual({});
    expect(montageDaysPatch(undefined, 3)).toEqual({});
  });
});

describe('bookKm', () => {
  it('office: updates, logs and sends the assignment mail to the KM team', async () => {
    const r = await bookKm({ caseData: { ...c, status: 'vantar_km' }, date: '2026-11-20', actor: 'Mirna', origin: 'office' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'km_bokad', km_date: '2026-11-20' });
    expect(events()).toEqual([['status_change', 'KM bokad: 2026-11-20']]);
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'km_booked', description: 'Bokade kontrollmätning (2026-11-20) för Storgatan 1', metadata: { km_date: '2026-11-20' } }));
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ km_team: 'Samy' }), 'km', 'Mirna', { km_date: '2026-11-20' });
    expect(m.tpl).not.toHaveBeenCalled();
    expect(r).toEqual({ warnings: [] });
  });
  it('adds time and KM team change', async () => {
    await bookKm({ caseData: c, date: '2026-11-20', time: '08:00', kmTeam: 'Tomek', actor: 'Mirna', origin: 'office' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'km_bokad', km_date: '2026-11-20', km_time: '08:00', km_team: 'Tomek' });
    expect(events()).toEqual([['status_change', 'KM bokad: 2026-11-20 kl 08:00'], ['team_change', 'KM-montör ändrad till Tomek']]);
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'team_changed', description: 'Bytte montör (Samy → Tomek) på Storgatan 1', metadata: { field: 'km_team', old: 'Samy', new: 'Tomek' } }));
    expect(m.assign.mock.calls[0][0]).toMatchObject({ km_team: 'Tomek' });
  });
  it('does not touch km_team when it is unchanged', async () => {
    await bookKm({ caseData: c, date: '2026-11-20', kmTeam: 'Samy', actor: 'Mirna', origin: 'office' });
    expect(m.update.mock.calls[0][1]).not.toHaveProperty('km_team');
    expect(logs()).toEqual(['km_booked']);
  });
  it('montor: sends the fixed template and records the notification', async () => {
    const r = await bookKm({ caseData: c, date: '2026-11-20', actor: 'GVMO', origin: 'montor' });
    expect(m.tpl).toHaveBeenCalledWith('km_bokad', 'case1');
    expect(m.assign).not.toHaveBeenCalled();
    expect(events()).toContainEqual(['notification', 'Tilldelningsmail skickat till montör (kontor@example.com)']);
    expect(r.warnings).toEqual([]);
  });
  it('montor: failed template mail becomes MAIL_WARNING', async () => {
    m.tpl.mockResolvedValueOnce({ ok: false, to: [] });
    await expect(bookKm({ caseData: c, date: '2026-11-20', actor: 'GVMO', origin: 'montor' })).resolves.toEqual({ warnings: ['MAIL_WARNING'] });
  });
  it('throws when the update fails and does nothing else', async () => {
    m.update.mockRejectedValueOnce(new Error('nej'));
    await expect(bookKm({ caseData: c, date: '2026-11-20', actor: 'Mirna', origin: 'office' })).rejects.toThrow('nej');
    expect(m.event).not.toHaveBeenCalled();
    expect(m.assign).not.toHaveBeenCalled();
  });
  it('late failures become warnings', async () => {
    m.event.mockRejectedValue(new Error('x'));
    m.assign.mockResolvedValueOnce('failed');
    const r = await bookKm({ caseData: c, date: '2026-11-20', actor: 'Mirna', origin: 'office' });
    expect(r.warnings).toEqual([EVENT_WARNING, teamMailWarning('Samy')]);
  });
});

describe('bookMontage', () => {
  it('validates with the status rule before anything is saved', async () => {
    await expect(bookMontage({ caseData: { ...c, delivery_date: null }, date: '2026-11-20', team: 'GVMO', actor: 'Mirna', origin: 'office' }))
      .rejects.toThrow('Välj leveransdatum eller leveransvecka');
    await expect(bookMontage({ caseData: c, date: '2026-11-20', team: '', actor: 'Mirna', origin: 'office' })).rejects.toThrow('Montage-montör måste tilldelas först');
    expect(m.update).not.toHaveBeenCalled();
  });
  it('office: same update, texts, coordinator mail, SMS and assignment as before', async () => {
    const r = await bookMontage({ caseData: c, date: '2026-11-20', team: 'Tomek', note: 'Ring före', sendCustomerSms: true, actor: 'Mirna', origin: 'office' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'montage_bokat', montage_date: '2026-11-20', team: 'Tomek' });
    expect(events()).toEqual([
      ['status_change', 'Montage bokat 2026-11-20 — montör: Tomek. Ring före'],
      ['team_change', 'Montör bytt från GVMO till Tomek'],
      ['notification', 'Mail skickat till mirna.malke@mockfjards.se (montage bokat)'],
    ]);
    expect(logs()).toEqual(['team_changed', 'montage_booked']);
    expect(m.notify).toHaveBeenCalledWith({
      to: 'mirna.malke@mockfjards.se', cc: 'mf@malke.se', subject: 'MONTAGE BOKAT — Storgatan 1', heading: 'Montage bokat',
      rows: [
        { label: 'Adress', value: 'Storgatan 1' }, { label: 'Kund', value: 'Anna' }, { label: 'Montör', value: 'Tomek' },
        { label: 'Montagedatum', value: '2026-11-20' }, { label: 'Anteckning', value: 'Ring före' },
      ],
      callToAction: 'Montage är bokat.',
    });
    expect(m.invoke).toHaveBeenCalledWith('send-customer-sms', { body: { case_id: 'case1', kind: 'montage_bokat' } });
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ team: 'Tomek', montage_date: '2026-11-20' }), 'montage', 'Mirna', { montage_date: '2026-11-20' });
    expect(m.tpl).not.toHaveBeenCalled();
    expect(r.warnings).toEqual([]);
  });
  it('office: time and working days are added to update, event and mail rows', async () => {
    await bookMontage({ caseData: c, date: '2026-11-20', time: '07:30', days: 3, team: 'GVMO', actor: 'Mirna', origin: 'office' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'montage_bokat', montage_date: '2026-11-20', team: 'GVMO', montage_time: '07:30', montage_days: 3 });
    expect(events()[0]).toEqual(['status_change', 'Montage bokat 2026-11-20 kl 07:30 (3 arbetsdagar) — montör: GVMO']);
    expect(m.notify.mock.calls[0][0].rows).toEqual(expect.arrayContaining([{ label: 'Tid', value: '07:30' }, { label: 'Arbetsdagar', value: '3' }]));
    expect(m.invoke).not.toHaveBeenCalled();
    expect(logs()).toEqual(['montage_booked']);
  });
  it('office: SMS without valid phone and failed coordinator mail become warnings', async () => {
    m.invoke.mockResolvedValueOnce({ data: { skipped: 'no_valid_phone' }, error: null });
    m.notify.mockRejectedValueOnce(new Error('smtp'));
    const r = await bookMontage({ caseData: c, date: '2026-11-20', team: 'GVMO', sendCustomerSms: true, actor: 'Mirna', origin: 'office' });
    expect(r.warnings).toEqual([COORDINATOR_MAIL_WARNING, SMS_NO_PHONE_WARNING]);
  });
  it('office: SMS error becomes a warning', async () => {
    m.invoke.mockResolvedValueOnce({ data: null, error: new Error('down') });
    const r = await bookMontage({ caseData: c, date: '2026-11-20', team: 'GVMO', sendCustomerSms: true, actor: 'Mirna', origin: 'office' });
    expect(r.warnings).toEqual([SMS_FAILED_WARNING]);
  });
  it('montor: self-assigns when the case has no team, template mail, no SMS or coordinator mail', async () => {
    const r = await bookMontage({ caseData: { ...c, team: null }, date: '2026-11-20', time: '08:00', team: 'Tomek', actor: 'Tomek', origin: 'montor' });
    expect(m.update).toHaveBeenCalledWith('case1', { montage_date: '2026-11-20', montage_time: '08:00', status: 'montage_bokat', team: 'Tomek' });
    expect(events()).toEqual([
      ['montage_booked', 'Montage bokat 2026-11-20 08:00 av Tomek. Montage-montör: Tomek'],
      ['notification', 'Tilldelningsmail skickat till montör (kontor@example.com)'],
    ]);
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'montage_booked', metadata: { montage_date: '2026-11-20', montage_time: '08:00', case_id: 'case1' } }));
    expect(m.tpl).toHaveBeenCalledWith('montage_bokat', 'case1');
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.invoke).not.toHaveBeenCalled();
    expect(m.assign).not.toHaveBeenCalled();
    expect(r.warnings).toEqual([]);
  });
  it('montor: keeps the existing team', async () => {
    await bookMontage({ caseData: c, date: '2026-11-20', team: 'Tomek', actor: 'Tomek', origin: 'montor' });
    expect(m.update).toHaveBeenCalledWith('case1', { montage_date: '2026-11-20', montage_time: null, status: 'montage_bokat' });
    expect(events()[0]).toEqual(['montage_booked', 'Montage bokat 2026-11-20 av Tomek']);
  });
});

describe('rescheduleMontage', () => {
  const booked = { ...c, status: 'montage_bokat', montage_date: '2026-11-20', montage_time: '08:00:00', montage_days: 2 } as BookingCase;
  it('montor: same update and texts as before, no mail or SMS', async () => {
    const r = await rescheduleMontage({ caseData: booked, date: '2026-11-24', time: '', actor: 'GVMO', origin: 'montor' });
    expect(m.update).toHaveBeenCalledWith('case1', { montage_date: '2026-11-24', montage_time: null });
    expect(events()).toEqual([['montage_rescheduled', 'Montagedatum ändrat från 2026-11-20 08:00:00 till 2026-11-24 av GVMO']]);
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'montage_rescheduled', metadata: { old_date: '2026-11-20', new_date: '2026-11-24', old_time: '08:00:00', new_time: null, case_id: 'case1' } }));
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.invoke).not.toHaveBeenCalled();
    expect(r.warnings).toEqual([]);
  });
  it('clears montage_days when rescheduled to 1 day', async () => {
    await rescheduleMontage({ caseData: booked, date: '2026-11-24', days: 1, actor: 'Mirna', origin: 'montor' });
    expect(m.update).toHaveBeenCalledWith('case1', { montage_date: '2026-11-24', montage_days: null });
  });
  it('office: mails the team about the new day and sends SMS when asked', async () => {
    await rescheduleMontage({ caseData: booked, date: '2026-11-24', time: '09:00', days: 3, sendCustomerSms: true, actor: 'Mirna', origin: 'office' });
    expect(m.update).toHaveBeenCalledWith('case1', { montage_date: '2026-11-24', montage_time: '09:00', montage_days: 3 });
    expect(m.invoke).toHaveBeenCalledWith('send-customer-sms', { body: { case_id: 'case1', kind: 'montage_bokat' } });
    expect(m.teamEmail).toHaveBeenCalledWith('GVMO');
    expect(m.notify).toHaveBeenCalledWith({
      to: 'gvmo@example.com', subject: 'MONTAGE OMBOKAT — Storgatan 1', heading: 'Ett montage har fått ny dag',
      rows: [
        { label: 'Adress', value: 'Storgatan 1' }, { label: 'Kund', value: 'Anna' }, { label: 'Telefon', value: '0701234567' },
        { label: 'Ny dag', value: '2026-11-24 09:00' }, { label: 'Tidigare dag', value: '2026-11-20 08:00' },
      ],
      callToAction: 'Öppna appen för detaljer.',
    });
    expect(m.assign).not.toHaveBeenCalled();
  });
  it('office: a case without date gets "satt till" and the normal assignment mail', async () => {
    await rescheduleMontage({ caseData: { ...c, status: 'montage_bokat' }, date: '2026-11-24', actor: 'Mirna', origin: 'office' });
    expect(events()[0]).toEqual(['montage_rescheduled', 'Montagedatum satt till 2026-11-24 av Mirna']);
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ montage_date: '2026-11-24' }), 'montage', 'Mirna', { montage_date: '2026-11-24', montage_time: null });
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.invoke).not.toHaveBeenCalled();
  });
  it('office: failed team mail becomes a warning', async () => {
    m.notify.mockRejectedValueOnce(new Error('x'));
    const r = await rescheduleMontage({ caseData: booked, date: '2026-11-24', actor: 'Mirna', origin: 'office' });
    expect(r.warnings).toEqual([teamMailWarning('GVMO')]);
  });
});

describe('rescheduleKm', () => {
  const booked = { ...c, status: 'km_bokad', km_date: '2026-11-18', km_time: '10:00:00' } as BookingCase;
  it('office: updates date and time, event, log and mail to the KM team', async () => {
    await rescheduleKm({ caseData: booked, date: '2026-11-19', time: '13:00', actor: 'Mirna', origin: 'office' });
    expect(m.update).toHaveBeenCalledWith('case1', { km_date: '2026-11-19', km_time: '13:00' });
    expect(events()[0]).toEqual(['status_change', 'KM ombokad från 2026-11-18 till 2026-11-19']);
    expect(logs()).toEqual(['km_rescheduled']);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ to: 'samy@example.com', subject: 'KONTROLLMÄTNING OMBOKAD — Storgatan 1' }));
  });
  it('without earlier date says "satt till"; montor sends no mail', async () => {
    await rescheduleKm({ caseData: { ...c, status: 'km_bokad' }, date: '2026-11-19', actor: 'Samy', origin: 'montor' });
    expect(events()).toEqual([['status_change', 'KM-datum satt till 2026-11-19']]);
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.assign).not.toHaveBeenCalled();
  });
});

describe('changeBookingTeam', () => {
  it('montage with date: update, event, log, assignment to new team and move mail to old team', async () => {
    const booked = { ...c, status: 'montage_bokat', montage_date: '2026-11-20' } as BookingCase;
    await changeBookingTeam({ caseData: booked, kind: 'montage', team: 'Tomek', actor: 'Mirna' });
    expect(m.update).toHaveBeenCalledWith('case1', { team: 'Tomek' });
    expect(events()).toContainEqual(['team_change', 'Montage-montör ändrad till Tomek']);
    expect(m.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'team_changed', description: 'Bytte montör (GVMO → Tomek) på Storgatan 1', metadata: { field: 'team', old: 'GVMO', new: 'Tomek' } }));
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ team: 'Tomek' }), 'montage', 'Mirna');
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ to: 'gvmo@example.com', subject: 'MONTAGE FLYTTAT — Storgatan 1', heading: 'Jobbet har flyttats till ett annat team' }));
  });
  it('KM with date mails the KM teams', async () => {
    const booked = { ...c, status: 'km_bokad', km_date: '2026-11-18' } as BookingCase;
    await changeBookingTeam({ caseData: booked, kind: 'km', team: 'Tomek', actor: 'Mirna' });
    expect(m.update).toHaveBeenCalledWith('case1', { km_team: 'Tomek' });
    expect(events()).toContainEqual(['team_change', 'KM-montör ändrad till Tomek']);
    expect(m.assign).toHaveBeenCalledWith(expect.objectContaining({ km_team: 'Tomek' }), 'km', 'Mirna');
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ to: 'samy@example.com', subject: 'KONTROLLMÄTNING FLYTTAD — Storgatan 1' }));
  });
  it('without date sends no mails', async () => {
    await changeBookingTeam({ caseData: c, kind: 'montage', team: 'Tomek', actor: 'Mirna' });
    expect(m.assign).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });
});

describe('unbookKm', () => {
  it('resets to vantar_km and mails the KM team', async () => {
    const booked = { ...c, status: 'km_bokad', km_date: '2026-11-18', km_time: '10:00:00' } as BookingCase;
    const r = await unbookKm({ caseData: booked, actor: 'Mirna' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'vantar_km', km_date: null, km_time: null });
    expect(events()[0]).toEqual(['status_change', 'KM-bokning borttagen (var 2026-11-18)']);
    expect(logs()).toEqual(['km_unbooked']);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ to: 'samy@example.com', subject: 'KONTROLLMÄTNING AVBOKAD — Storgatan 1' }));
    expect(r.warnings).toEqual([]);
  });
  it('refuses after the measurement', async () => {
    await expect(unbookKm({ caseData: { ...c, status: 'km_klar' }, actor: 'Mirna' })).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe('unbookMontage', () => {
  it('derives status from delivery, keeps the team, clears days and mails the team, no SMS', async () => {
    const booked = { ...c, status: 'montage_bokat', delivery_date: '2020-01-01', montage_date: '2026-11-20', montage_time: '08:00:00', montage_days: 3 } as BookingCase;
    await unbookMontage({ caseData: booked, actor: 'Mirna' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'leverans_klar', montage_date: null, montage_time: null, montage_days: null });
    expect(events()[0]).toEqual(['status_change', 'Montagebokning borttagen (var 2026-11-20)']);
    expect(logs()).toEqual(['montage_unbooked']);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ to: 'gvmo@example.com', subject: 'MONTAGE AVBOKAT — Storgatan 1' }));
    expect(m.invoke).not.toHaveBeenCalled();
  });
  it('goes back to godkand before delivery and omits montage_days when absent', async () => {
    const booked = { ...c, status: 'montage_bokat', delivery_date: '2099-01-01', montage_date: '2099-02-01' } as BookingCase;
    await unbookMontage({ caseData: booked, actor: 'Mirna' });
    expect(m.update).toHaveBeenCalledWith('case1', { status: 'godkand', montage_date: null, montage_time: null });
  });
  it('is only allowed for montage_bokat', async () => {
    await expect(unbookMontage({ caseData: { ...c, status: 'montage_pagar' }, actor: 'Mirna' })).rejects.toThrow('Montagebokningen kan bara tas bort när montaget är bokat');
  });
});

describe('testmiljön (local_backend)', () => {
  it('mejl och SMS som hoppades över ger en enda informationsvarning', async () => {
    const { bookMontage, LOCAL_BACKEND_WARNING } = await import('../bookingService');
    m.assign.mockResolvedValueOnce('local');
    m.notify.mockResolvedValueOnce({ skipped: 'local_backend' });
    const r = await bookMontage({ caseData: { id: 'c1', status: 'leverans_klar', address: 'Storgatan 1', customer_name: 'Anna', team: 'Samy', delivery_date: '2026-11-10' } as never, date: '2026-11-20', team: 'Samy', actor: 'Mirna', origin: 'office' });
    expect(r.warnings.filter((w) => w === LOCAL_BACKEND_WARNING)).toHaveLength(1);
  });
});
