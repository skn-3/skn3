// Vad en kontorsbokning faktiskt skickade, utläst ur tjänstens varningar. Ren logik.
import { SMS_FAILED_WARNING, SMS_NO_PHONE_WARNING, teamMailWarning } from './messages';

export interface BookingOutcomeInput {
  warnings: readonly string[];
  /** Teamet som mejlet går till (KM: km_team, annars ärendets team). */
  mailTeam: string | null | undefined;
  /** Teamets kända adress (montor_teams.email eller reservlistan); tom = inget mejl skickas. */
  teamEmail: string | null | undefined;
  smsRequested: boolean;
}

export interface BookingOutcome { teamMailed: boolean; smsSent: boolean }

export function bookingOutcome({ warnings, mailTeam, teamEmail, smsRequested }: BookingOutcomeInput): BookingOutcome {
  const teamMailed = !!mailTeam && !!teamEmail && !warnings.includes(teamMailWarning(mailTeam));
  const smsSent = smsRequested && !warnings.includes(SMS_NO_PHONE_WARNING) && !warnings.includes(SMS_FAILED_WARNING);
  return { teamMailed, smsSent };
}
