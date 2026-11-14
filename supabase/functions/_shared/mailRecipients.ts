// Gemensamma mottagare för mejl som byggs på servern. Klienten skickar aldrig adresser
// till de fasta mallarna; de slås upp här.
export const COORDINATOR_TO = 'mirna.malke@mockfjards.se';
export const MAIL_CC = 'mf@malke.se';

/** Montörsteamens adresser (samma som EMAIL_MAP i appen). */
export const TEAM_EMAILS: Record<string, string> = {
  'GVMO': 'gvmo.bygg@gmail.com',
  'Samy': 'info@smtmbygg.se',
  'Alex NBD': 'alex@nbdentreprenad.com',
  'Jerk': 'jerk.ryttman@mockfjards.se',
  'Villaspecialisten': 'Edvin@villaspecialisten.se',
};

/** Säljarnas adresser (samma som EMAIL_MAP i appen). */
export const SELLER_EMAILS: Record<string, string> = {
  'Daniel Malke': 'daniel.malke@mockfjards.se',
  'Gabriel Hanna': 'gabriel.hanna@mockfjards.se',
};

/** Koordinatorernas adresser (samma fasta adress som koordinatormejlen går till). */
export const COORDINATOR_EMAILS: Record<string, string> = {
  'Mirna Malke': COORDINATOR_TO,
};

export type TeamEmailOf = (team: string) => string | null;

/** Bara den statiska listan (reserv). */
export const staticTeamEmail: TeamEmailOf = (team) => TEAM_EMAILS[team] ?? null;

/** Teamets adress: montor_teams.email, annars den statiska listan. */
export function teamEmailResolver(rows: ReadonlyArray<{ name: string | null; email: string | null }> | null | undefined): TeamEmailOf {
  const map = new Map<string, string>();
  for (const r of rows ?? []) {
    const email = (r.email ?? '').trim();
    if (r.name && email) map.set(r.name, email);
  }
  return (team) => map.get(team) ?? TEAM_EMAILS[team] ?? null;
}
