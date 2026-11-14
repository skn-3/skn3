// Gemensam bokningstjänst: samma sak händer oavsett var man bokar.
// Ordning i varje funktion: 1) databasuppdateringen (kastar vid fel), 2) ärendehändelse,
// 3) aktivitetslogg, 4) mejl och SMS. Steg 2–4 kastar aldrig när steg 1 lyckats; fel
// samlas i warnings så att UI:t kan visa dem.
import { supabase } from '@/integrations/supabase/client';
import { updateCase, createCaseEvent, sendNotificationEmail, sendMontorAssignmentEmail, type CaseRow, type CaseUpdate } from '@/lib/supabaseClient';
import { sendMontorEmail, MAIL_WARNING, type MontorEmailTemplate } from '@/lib/montorEmail';
import { logActivity, type LogActivityParams } from '@/lib/activityLog';
import { canEnterStatus, deriveDeliveryStatus } from '@/lib/statusRules';
import { COORDINATOR_EMAIL, COORDINATOR_CC } from '@/lib/constants';
import { resolveTeamEmail } from './teamEmail';
import type { WithSchedule, ScheduleExtension } from '@/lib/schedule/types';

export type BookingOrigin = 'office' | 'montor';
export type BookingCase = WithSchedule<CaseRow>;
export interface BookingResult { warnings: string[] }

import { EVENT_WARNING, COORDINATOR_MAIL_WARNING, SMS_NO_PHONE_WARNING, SMS_FAILED_WARNING, teamMailWarning } from './messages';
export { EVENT_WARNING, COORDINATOR_MAIL_WARNING, SMS_NO_PHONE_WARNING, SMS_FAILED_WARNING, teamMailWarning, INFO_WARNINGS } from './messages';

type Update = CaseUpdate & ScheduleExtension;

/** Enda stället där uppdateringen med nya fält typas om till den genererade typen. */
async function saveCase(id: string, update: Update): Promise<void> {
  await updateCase(id, update as CaseUpdate);
}

/**
 * montage_days i uppdateringar: fler än 1 dag skickas; 1 dag skickas som null bara om
 * ärendet redan har ett värde; annars utelämnas fältet (kolumnen kan saknas före godkännandet).
 */
export function montageDaysPatch(days: number | null | undefined, current: number | null | undefined): ScheduleExtension {
  if (days === undefined) return {};
  const n = typeof days === 'number' && Number.isFinite(days) ? Math.floor(days) : 1;
  if (n > 1) return { montage_days: n };
  if (current !== null && current !== undefined) return { montage_days: null };
  return {};
}

const t5 = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : '');
/** För mejlrader: tiden kortas till HH:MM. */
const withTime = (date: string | null | undefined, time: string | null | undefined, sep = ' ') => `${date ?? ''}${time ? sep + t5(time) : ''}`;
/** För händelsetexter som redan finns i dag: tiden skrivs som den är lagrad (oförändrade texter). */
const rawWithTime = (date: string | null | undefined, time: string | null | undefined) => `${date ?? ''}${time ? ' ' + time : ''}`;

async function event(w: string[], caseId: string, event_type: string, description: string, created_by: string) {
  try {
    await createCaseEvent({ case_id: caseId, event_type, description, created_by });
  } catch (e) {
    console.error(`[booking] händelsen ${event_type} kunde inte sparas:`, e);
    if (!w.includes(EVENT_WARNING)) w.push(EVENT_WARNING);
  }
}

async function log(params: LogActivityParams) {
  try { await logActivity(params); } catch (e) { console.error('[booking] aktivitetsloggen misslyckades:', e); }
}

/** sendAndRecord från montörvyn: fast mall + händelserad när mejlet gått iväg. */
async function sendTemplate(w: string[], template: MontorEmailTemplate, caseId: string, actor: string) {
  const mail = await sendMontorEmail(template, caseId);
  if (mail.ok && !mail.skipped) {
    try {
      await createCaseEvent({ case_id: caseId, event_type: 'notification', description: `Tilldelningsmail skickat till montör (${mail.to.join(', ')})`, created_by: actor });
    } catch (e) {
      console.error(`[${template}] händelserad för mejl misslyckades:`, e);
    }
  }
  if (!mail.ok) w.push(MAIL_WARNING);
}

async function assignmentMail(w: string[], c: Parameters<typeof sendMontorAssignmentEmail>[0], kind: 'km' | 'montage', actor: string, overrides?: Parameters<typeof sendMontorAssignmentEmail>[3]) {
  const ok = overrides ? await sendMontorAssignmentEmail(c, kind, actor, overrides) : await sendMontorAssignmentEmail(c, kind, actor);
  if (!ok) {
    const team = (kind === 'km' ? c.km_team || c.team : c.team) || 'teamet';
    w.push(teamMailWarning(team));
  }
}

/** Kort mejl till ett team via notify-email, med notification-händelse. Okänd adress hoppas över. */
async function teamMail(w: string[], p: { caseId: string; team: string | null | undefined; subject: string; heading: string; rows: Array<{ label: string; value: string }>; eventText: (to: string) => string; actor: string }) {
  if (!p.team) return;
  const to = await resolveTeamEmail(p.team);
  if (!to) return;
  try {
    await sendNotificationEmail({ to, subject: p.subject, heading: p.heading, rows: p.rows, callToAction: 'Öppna appen för detaljer.' });
  } catch (e) {
    console.error('[booking] mejl till team misslyckades:', e);
    w.push(teamMailWarning(p.team));
    return;
  }
  try {
    await createCaseEvent({ case_id: p.caseId, event_type: 'notification', description: p.eventText(to), created_by: p.actor });
  } catch (e) {
    console.error('[booking] händelserad för mejl misslyckades:', e);
  }
}

async function customerSms(w: string[], caseId: string) {
  try {
    const { data, error } = await supabase.functions.invoke('send-customer-sms', { body: { case_id: caseId, kind: 'montage_bokat' } });
    if (error) throw error;
    if ((data as any)?.skipped === 'no_valid_phone') w.push(SMS_NO_PHONE_WARNING);
  } catch (e) {
    console.error('Customer SMS failed:', e);
    w.push(SMS_FAILED_WARNING);
  }
}

const phoneOf = (c: BookingCase) => c.customer_phone || 'Ej angivet';
const kmTeamOf = (c: BookingCase) => c.km_team || c.team || null;

// ---------------------------------------------------------------------------

export interface BookKmInput { caseData: BookingCase; date: string; time?: string | null; kmTeam?: string | null; actor: string; origin: BookingOrigin }

export async function bookKm({ caseData: c, date, time, kmTeam, actor, origin }: BookKmInput): Promise<BookingResult> {
  if (!date) throw new Error('Datum krävs');
  const oldKmTeam = c.km_team ?? null;
  const newKmTeam = kmTeam === undefined ? oldKmTeam : (kmTeam || null);
  const kmTeamChanged = kmTeam !== undefined && newKmTeam !== oldKmTeam;
  const kmTime = time ? t5(time) : '';

  await saveCase(c.id, {
    status: 'km_bokad',
    km_date: date,
    ...(kmTime ? { km_time: kmTime } : {}),
    ...(kmTeamChanged ? { km_team: newKmTeam } : {}),
  });

  const w: string[] = [];
  await event(w, c.id, 'status_change', `KM bokad: ${date}${kmTime ? ` kl ${kmTime}` : ''}`, actor);
  if (kmTeamChanged) {
    await event(w, c.id, 'team_change', `KM-montör ändrad till ${newKmTeam || '—'}`, actor);
    await log({ category: 'case', action: 'team_changed', description: `Bytte montör (${oldKmTeam || '—'} → ${newKmTeam || '—'}) på ${c.address}`, case_id: c.id, metadata: { field: 'km_team', old: oldKmTeam, new: newKmTeam } });
  }
  await log({ category: 'case', action: 'km_booked', description: `Bokade kontrollmätning (${date}) för ${c.address}`, case_id: c.id, metadata: { km_date: date } });

  if (origin === 'office') {
    await assignmentMail(w, { ...c, km_team: newKmTeam }, 'km', actor, { km_date: date });
  } else {
    await sendTemplate(w, 'km_bokad', c.id, actor);
  }
  return { warnings: w };
}

// ---------------------------------------------------------------------------

export interface BookMontageInput {
  caseData: BookingCase;
  date: string;
  time?: string | null;
  days?: number | null;
  /** office: valt team. montor: inloggat team, används bara för självtilldelning när ärendet saknar team. */
  team?: string | null;
  note?: string;
  sendCustomerSms?: boolean;
  actor: string;
  origin: BookingOrigin;
}

export async function bookMontage(input: BookMontageInput): Promise<BookingResult> {
  const { caseData: c, date, days, note, actor, origin } = input;
  if (!date) throw new Error('Datum krävs');
  const time = input.time || '';
  const selfAssign = origin === 'montor' && !c.team && !!input.team;
  const team = origin === 'office' ? (input.team || null) : selfAssign ? input.team! : (c.team ?? null);
  const check = canEnterStatus('montage_bokat', { ...c, team, montage_date: date });
  if (!check.ok) throw new Error(check.reason || 'Förutsättning saknas');
  const daysPatch = montageDaysPatch(days, c.montage_days);
  const n = typeof days === 'number' && days > 1 ? Math.floor(days) : 0;
  const daysText = n ? ` (${n} arbetsdagar)` : '';
  const w: string[] = [];

  if (origin === 'office') {
    const oldTeam = c.team;
    const teamChanged = team !== oldTeam;
    await saveCase(c.id, { status: 'montage_bokat', montage_date: date, team, ...(time ? { montage_time: time } : {}), ...daysPatch });

    await event(w, c.id, 'status_change', `Montage bokat ${withTime(date, time, ' kl ')}${daysText} — montör: ${team}${note ? '. ' + note : ''}`, actor);
    if (teamChanged && oldTeam) {
      await event(w, c.id, 'team_change', `Montör bytt från ${oldTeam} till ${team}`, actor);
      await log({ category: 'case', action: 'team_changed', description: `Bytte montör (${oldTeam} → ${team}) på ${c.address}`, case_id: c.id, metadata: { old: oldTeam, new: team } });
    }
    await log({ category: 'case', action: 'montage_booked', description: `Bokade montage för ${c.address}`, case_id: c.id, metadata: { montage_date: date, team, ...(time ? { montage_time: time } : {}), ...(n ? { montage_days: n } : {}) } });

    try {
      await sendNotificationEmail({
        to: COORDINATOR_EMAIL,
        cc: COORDINATOR_CC,
        subject: `MONTAGE BOKAT — ${c.address}`,
        heading: 'Montage bokat',
        rows: [
          { label: 'Adress', value: c.address },
          { label: 'Kund', value: c.customer_name },
          { label: 'Montör', value: team ?? '' },
          { label: 'Montagedatum', value: date },
          ...(time ? [{ label: 'Tid', value: time }] : []),
          ...(n ? [{ label: 'Arbetsdagar', value: String(n) }] : []),
          ...(note ? [{ label: 'Anteckning', value: note }] : []),
        ],
        callToAction: 'Montage är bokat.',
      });
      await createCaseEvent({ case_id: c.id, event_type: 'notification', description: `Mail skickat till ${COORDINATOR_EMAIL} (montage bokat)`, created_by: actor });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr);
      w.push(COORDINATOR_MAIL_WARNING);
    }
    if (input.sendCustomerSms) await customerSms(w, c.id);
    await assignmentMail(w, { ...c, team, montage_date: date, ...(time ? { montage_time: time } : {}) }, 'montage', actor, { montage_date: date, ...(time ? { montage_time: time } : {}) });
    return { warnings: w };
  }

  // origin 'montor'
  await saveCase(c.id, { montage_date: date, montage_time: time || null, status: 'montage_bokat', ...(selfAssign ? { team } : {}), ...daysPatch });
  const desc = `Montage bokat ${rawWithTime(date, time)}${daysText} av ${actor}${selfAssign ? `. Montage-montör: ${team}` : ''}`;
  await event(w, c.id, 'montage_booked', desc, actor);
  await log({ category: 'case', action: 'montage_booked', description: desc, case_id: c.id, metadata: { montage_date: date, montage_time: time || null, case_id: c.id, ...(n ? { montage_days: n } : {}) } });
  await sendTemplate(w, 'montage_bokat', c.id, actor);
  return { warnings: w };
}

// ---------------------------------------------------------------------------

export interface RescheduleMontageInput { caseData: BookingCase; date: string; time?: string | null; days?: number | null; sendCustomerSms?: boolean; actor: string; origin: BookingOrigin }

export async function rescheduleMontage({ caseData: c, date, time, days, sendCustomerSms, actor, origin }: RescheduleMontageInput): Promise<BookingResult> {
  if (!date) throw new Error('Datum krävs');
  const oldDate = c.montage_date ?? null;
  const oldTime = c.montage_time || null;
  const newTime = time === undefined ? oldTime : (time || null);

  await saveCase(c.id, { montage_date: date, ...(time !== undefined ? { montage_time: newTime } : {}), ...montageDaysPatch(days, c.montage_days) });

  const w: string[] = [];
  const desc = oldDate
    ? `Montagedatum ändrat från ${rawWithTime(oldDate, oldTime)} till ${rawWithTime(date, newTime)} av ${actor}`
    : `Montagedatum satt till ${rawWithTime(date, newTime)} av ${actor}`;
  await event(w, c.id, 'montage_rescheduled', desc, actor);
  await log({ category: 'case', action: 'montage_rescheduled', description: desc, case_id: c.id, metadata: { old_date: oldDate, new_date: date, old_time: oldTime, new_time: newTime, case_id: c.id, ...(days !== undefined ? { montage_days: days } : {}) } });

  if (origin === 'office') {
    if (sendCustomerSms) await customerSms(w, c.id);
    if (oldDate) {
      await teamMail(w, {
        caseId: c.id, team: c.team, actor,
        subject: `MONTAGE OMBOKAT — ${c.address}`,
        heading: 'Ett montage har fått ny dag',
        rows: [
          { label: 'Adress', value: c.address },
          { label: 'Kund', value: c.customer_name },
          { label: 'Telefon', value: phoneOf(c) },
          { label: 'Ny dag', value: withTime(date, newTime) },
          { label: 'Tidigare dag', value: withTime(oldDate, oldTime) },
        ],
        eventText: to => `Ombokningsmail skickat till montör (${to})`,
      });
    } else {
      await assignmentMail(w, { ...c, montage_date: date, montage_time: newTime }, 'montage', actor, { montage_date: date, montage_time: newTime });
    }
  }
  return { warnings: w };
}

// ---------------------------------------------------------------------------

export interface RescheduleKmInput { caseData: BookingCase; date: string; time?: string | null; actor: string; origin: BookingOrigin }

export async function rescheduleKm({ caseData: c, date, time, actor, origin }: RescheduleKmInput): Promise<BookingResult> {
  if (!date) throw new Error('Datum krävs');
  const oldDate = c.km_date ?? null;
  const oldTime = c.km_time ? t5(c.km_time) : null;
  const newTime = time === undefined ? oldTime : (time ? t5(time) : null);

  await saveCase(c.id, { km_date: date, ...(time !== undefined ? { km_time: newTime } : {}) });

  const w: string[] = [];
  const desc = oldDate ? `KM ombokad från ${oldDate} till ${date}` : `KM-datum satt till ${date}`;
  await event(w, c.id, 'status_change', desc, actor);
  await log({ category: 'case', action: 'km_rescheduled', description: `${desc} för ${c.address}`, case_id: c.id, metadata: { old_date: oldDate, new_date: date, old_time: oldTime, new_time: newTime } });

  if (origin === 'office') {
    if (oldDate) {
      await teamMail(w, {
        caseId: c.id, team: kmTeamOf(c), actor,
        subject: `KONTROLLMÄTNING OMBOKAD — ${c.address}`,
        heading: 'En kontrollmätning har fått ny dag',
        rows: [
          { label: 'Adress', value: c.address },
          { label: 'Kund', value: c.customer_name },
          { label: 'Telefon', value: phoneOf(c) },
          { label: 'Ny dag', value: withTime(date, newTime) },
          { label: 'Tidigare dag', value: withTime(oldDate, oldTime) },
        ],
        eventText: to => `Ombokningsmail skickat till KM-montör (${to})`,
      });
    } else {
      await assignmentMail(w, c, 'km', actor, { km_date: date });
    }
  }
  return { warnings: w };
}

// ---------------------------------------------------------------------------

export interface ChangeBookingTeamInput { caseData: BookingCase; kind: 'km' | 'montage'; team: string | null; actor: string }

export async function changeBookingTeam({ caseData: c, kind, team, actor }: ChangeBookingTeamInput): Promise<BookingResult> {
  const field = kind === 'km' ? 'km_team' : 'team';
  const label = kind === 'km' ? 'KM-montör' : 'Montage-montör';
  const newValue = team || null;
  const oldValue = (kind === 'km' ? c.km_team : c.team) ?? null;
  if (newValue === oldValue) return { warnings: [] };

  await saveCase(c.id, { [field]: newValue } as Update);

  const w: string[] = [];
  await event(w, c.id, 'team_change', `${label} ändrad till ${newValue || '—'}`, actor);
  await log({ category: 'case', action: 'team_changed', description: `Bytte montör (${oldValue || '—'} → ${newValue || '—'}) på ${c.address}`, case_id: c.id, metadata: { field, old: oldValue, new: newValue } });

  const date = kind === 'km' ? c.km_date : c.montage_date;
  if (date) {
    const updated: BookingCase = { ...c, [field]: newValue };
    const oldEff = kind === 'km' ? kmTeamOf(c) : (c.team ?? null);
    const newEff = kind === 'km' ? kmTeamOf(updated) : newValue;
    if (newEff && newEff !== oldEff) await assignmentMail(w, updated, kind, actor);
    if (oldEff && oldEff !== newEff) {
      const time = kind === 'km' ? c.km_time : c.montage_time;
      await teamMail(w, {
        caseId: c.id, team: oldEff, actor,
        subject: kind === 'km' ? `KONTROLLMÄTNING FLYTTAD — ${c.address}` : `MONTAGE FLYTTAT — ${c.address}`,
        heading: 'Jobbet har flyttats till ett annat team',
        rows: [
          { label: 'Adress', value: c.address },
          { label: 'Kund', value: c.customer_name },
          { label: kind === 'km' ? 'KM-datum' : 'Montagedatum', value: withTime(date, time) },
          { label: 'Nytt team', value: newEff || 'Ej tilldelat' },
        ],
        eventText: to => `Flyttmail skickat till tidigare montör (${to})`,
      });
    }
  }
  return { warnings: w };
}

// ---------------------------------------------------------------------------

export interface UnbookInput { caseData: BookingCase; actor: string }

export async function unbookKm({ caseData: c, actor }: UnbookInput): Promise<BookingResult> {
  if (c.status !== 'vantar_km' && c.status !== 'km_bokad') throw new Error('KM-bokningen kan bara tas bort innan kontrollmätningen är gjord');
  const oldDate = c.km_date ?? null;
  const oldTime = c.km_time ? t5(c.km_time) : null;

  await saveCase(c.id, { status: 'vantar_km', km_date: null, km_time: null });

  const w: string[] = [];
  await event(w, c.id, 'status_change', `KM-bokning borttagen (var ${oldDate || '—'})`, actor);
  await log({ category: 'case', action: 'km_unbooked', description: `Tog bort KM-bokningen (${oldDate || '—'}) för ${c.address}`, case_id: c.id, metadata: { old_date: oldDate, old_time: oldTime, from: c.status } });
  if (oldDate) {
    await teamMail(w, {
      caseId: c.id, team: kmTeamOf(c), actor,
      subject: `KONTROLLMÄTNING AVBOKAD — ${c.address}`,
      heading: 'En kontrollmätning har avbokats',
      rows: [
        { label: 'Adress', value: c.address },
        { label: 'Kund', value: c.customer_name },
        { label: 'Tidigare dag', value: withTime(oldDate, oldTime) },
      ],
      eventText: to => `Avbokningsmail skickat till KM-montör (${to})`,
    });
  }
  return { warnings: w };
}

export async function unbookMontage({ caseData: c, actor }: UnbookInput): Promise<BookingResult> {
  if (c.status !== 'montage_bokat') throw new Error('Montagebokningen kan bara tas bort när montaget är bokat');
  const oldDate = c.montage_date ?? null;
  const oldTime = c.montage_time ? t5(c.montage_time) : null;
  const status = deriveDeliveryStatus(c);
  const hadDays = c.montage_days !== null && c.montage_days !== undefined;

  await saveCase(c.id, { status, montage_date: null, montage_time: null, ...(hadDays ? { montage_days: null } : {}) });

  const w: string[] = [];
  await event(w, c.id, 'status_change', `Montagebokning borttagen (var ${oldDate || '—'})`, actor);
  await log({ category: 'case', action: 'montage_unbooked', description: `Tog bort montagebokningen (${oldDate || '—'}) för ${c.address}`, case_id: c.id, metadata: { old_date: oldDate, old_time: oldTime, to: status, team: c.team ?? null } });
  if (oldDate) {
    await teamMail(w, {
      caseId: c.id, team: c.team, actor,
      subject: `MONTAGE AVBOKAT — ${c.address}`,
      heading: 'Ett montage har avbokats',
      rows: [
        { label: 'Adress', value: c.address },
        { label: 'Kund', value: c.customer_name },
        { label: 'Tidigare dag', value: withTime(oldDate, oldTime) },
      ],
      eventText: to => `Avbokningsmail skickat till montör (${to})`,
    });
  }
  return { warnings: w };
}
